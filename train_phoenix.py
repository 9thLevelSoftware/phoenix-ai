#!/usr/bin/env python3
"""
Phoenix Coach — Unsloth QLoRA Fine-Tuning Script
=================================================
Base model : Qwen3-4B-Instruct (4-bit via bitsandbytes)
Method     : QLoRA (LoRA on top of 4-bit base)
Dataset    : ChatML JSONL (system / user / assistant turns)
Target GPU : 12-16 GB VRAM (RTX 3060 Ti / 4060 Ti / 4070 etc.)

Usage:
    python train_phoenix.py                        # train with defaults
    python train_phoenix.py --epochs 5             # override epochs
    python train_phoenix.py --resume ./outputs/checkpoint-300  # resume

After training, run the export section at the bottom (or the companion
export script) to convert to GGUF / merged / LoRA-only.
"""

import argparse
import json
import os
import torch
from pathlib import Path

# ──────────────────────────────────────────────
# 0.  CLI ARGS (override any default below)
# ──────────────────────────────────────────────
parser = argparse.ArgumentParser()
parser.add_argument("--train",      default="dataset/final/train.jsonl")
parser.add_argument("--valid",      default="dataset/final/valid.jsonl")
parser.add_argument("--output_dir", default="./outputs")
parser.add_argument("--epochs",     type=int,   default=3)
parser.add_argument("--batch_size", type=int,   default=2)
parser.add_argument("--grad_accum", type=int,   default=4)
parser.add_argument("--lr",         type=float, default=2e-4)
parser.add_argument("--max_seq_len",type=int,   default=2048)
parser.add_argument("--lora_r",     type=int,   default=16)
parser.add_argument("--resume",     type=str,   default=None,
                    help="Path to a checkpoint dir to resume from")
args = parser.parse_args()


# ──────────────────────────────────────────────
# 1.  LOAD BASE MODEL  (4-bit quantised)
# ──────────────────────────────────────────────
#   Why 4-bit?  A 4B-param model in bf16 is ~8 GB just for weights.
#   4-bit cuts that to ~2.5 GB, leaving room for activations, optimizer
#   states, and LoRA parameters on a 12-16 GB card.
#
#   Unsloth's FastLanguageModel handles the bitsandbytes config
#   internally — you don't need to wire up BitsAndBytesConfig yourself.

from unsloth import FastLanguageModel

MODEL_NAME = "unsloth/Qwen3-4B-Instruct-2507-unsloth-bnb-4bit"

model, tokenizer = FastLanguageModel.from_pretrained(
    model_name  = MODEL_NAME,
    max_seq_length = args.max_seq_len,
    dtype       = None,        # auto-detect (bf16 on Ampere+, fp16 otherwise)
    load_in_4bit = True,       # QLoRA
)

print(f"[✓] Loaded {MODEL_NAME}")
print(f"    Max sequence length: {args.max_seq_len}")


# ──────────────────────────────────────────────
# 2.  ATTACH LoRA ADAPTERS
# ──────────────────────────────────────────────
#   LoRA freezes the base weights and trains small low-rank matrices
#   injected into the attention and MLP layers.  Only ~1-3 % of params
#   are actually updated, which is why this fits on consumer GPUs.
#
#   target_modules: We hit all the linear projections in each transformer
#   block.  This is the "full LoRA" approach recommended for instruction
#   tuning — skipping layers (e.g. only q/v) can leave capability on
#   the table.
#
#   use_gradient_checkpointing="unsloth": Unsloth's optimised version
#   of gradient checkpointing — same memory savings, ~30 % faster than
#   the HuggingFace default.

model = FastLanguageModel.get_peft_model(
    model,
    r              = args.lora_r,       # rank — 16 is a solid default
    lora_alpha     = args.lora_r * 2,   # scaling factor (2× rank is common)
    lora_dropout   = 0.05,
    bias           = "none",
    target_modules = [
        "q_proj", "k_proj", "v_proj", "o_proj",   # attention
        "gate_proj", "up_proj", "down_proj",       # MLP
    ],
    use_gradient_checkpointing = "unsloth",
    random_state   = 42,
    use_rslora     = True,   # rank-stabilised LoRA — better stability
)

print("[✓] LoRA adapters attached")


# ──────────────────────────────────────────────
# 3.  LOAD & FORMAT DATASET
# ──────────────────────────────────────────────
#   Your JSONL files are already in ChatML format:
#     {"messages": [{"role":"system",...}, {"role":"user",...}, {"role":"assistant",...}]}
#
#   tokenizer.apply_chat_template() converts this into the token
#   sequence the model was pre-trained on (with <|im_start|> / <|im_end|>
#   delimiters for Qwen).  We do NOT add a generation prompt because
#   the assistant turn is already present — we're training, not inferring.

from datasets import load_dataset

train_ds = load_dataset("json", data_files=args.train, split="train")
valid_ds = load_dataset("json", data_files=args.valid, split="train")

def apply_chat_template(examples):
    """Convert messages list → single formatted string per example."""
    texts = []
    for msgs in examples["messages"]:
        text = tokenizer.apply_chat_template(
            msgs,
            tokenize=False,
            add_generation_prompt=False,   # assistant response is already there
        )
        texts.append(text)
    return {"text": texts}

train_ds = train_ds.map(apply_chat_template, batched=True, remove_columns=["messages"])
valid_ds = valid_ds.map(apply_chat_template, batched=True, remove_columns=["messages"])

print(f"[✓] Dataset loaded — {len(train_ds)} train / {len(valid_ds)} valid examples")


# ──────────────────────────────────────────────
# 4.  TRAINING ARGUMENTS
# ──────────────────────────────────────────────
#   Key decisions for 12-16 GB VRAM:
#
#   • batch_size=2, grad_accum=4  →  effective batch of 8
#     This is a good balance.  If you OOM, drop batch_size to 1
#     and raise grad_accum to 8 (same effective batch, less peak VRAM).
#
#   • optim="adamw_8bit"  →  8-bit Adam from bitsandbytes.
#     Uses ~75 % less memory for optimizer states vs. standard Adam.
#     Negligible quality difference for fine-tuning.
#
#   • bf16=True  →  bfloat16 mixed precision.  More numerically stable
#     than fp16 (no loss scaling needed).  Requires Ampere+ GPU (30xx/40xx).
#     If you're on a 20-series or older, set bf16=False, fp16=True.
#
#   • lr=2e-4 with cosine schedule  →  matches your config.  This is on
#     the higher end; if val loss starts climbing after epoch 1, try 1e-4.
#
#   • warmup_ratio=0.05  →  ~5 % of total steps for LR warmup.
#     Helps avoid early instability.
#
#   • eval_steps=50  →  frequent enough to catch overfitting early.
#     With 3261 train examples and effective batch 8, one epoch ≈ 408 steps,
#     so you'll get ~8 eval checkpoints per epoch.

from transformers import TrainingArguments

# Detect bf16 support
bf16_supported = torch.cuda.is_available() and torch.cuda.get_device_capability()[0] >= 8

training_args = TrainingArguments(
    output_dir                  = args.output_dir,
    num_train_epochs            = args.epochs,
    per_device_train_batch_size = args.batch_size,
    per_device_eval_batch_size  = args.batch_size,
    gradient_accumulation_steps = args.grad_accum,
    learning_rate               = args.lr,
    lr_scheduler_type           = "cosine",
    warmup_ratio                = 0.05,
    weight_decay                = 0.01,
    max_grad_norm               = 1.0,
    bf16                        = bf16_supported,
    fp16                        = not bf16_supported,
    optim                       = "adamw_8bit",
    logging_steps               = 10,
    eval_strategy               = "steps",
    eval_steps                  = 50,
    save_strategy               = "steps",
    save_steps                  = 100,
    save_total_limit            = 3,          # keep last 3 checkpoints to save disk
    load_best_model_at_end      = True,
    metric_for_best_model       = "eval_loss",
    greater_is_better           = False,
    report_to                   = "tensorboard",
    seed                        = 42,
    dataloader_num_workers      = 2,
)


# ──────────────────────────────────────────────
# 5.  CREATE TRAINER & RUN
# ──────────────────────────────────────────────
#   SFTTrainer (from the `trl` library) wraps HF Trainer with
#   convenience for supervised fine-tuning: it handles the text
#   field, tokenisation, sequence packing, etc.
#
#   packing=False: Each example is its own sequence.  With ~4 K
#   examples averaging 658 tokens, packing would concatenate short
#   sequences to fill max_seq_len.  This can speed things up but
#   risks blending unrelated examples.  For structured JSON output
#   where clean example boundaries matter, keep packing off.

from trl import SFTTrainer

trainer = SFTTrainer(
    model           = model,
    tokenizer       = tokenizer,
    args            = training_args,
    train_dataset   = train_ds,
    eval_dataset    = valid_ds,
    dataset_text_field = "text",
    max_seq_length  = args.max_seq_len,
    packing         = False,
    dataset_kwargs  = {"add_special_tokens": False},  # chat template already added them
)

print(f"\n{'='*50}")
print(f"  Training Phoenix Coach")
print(f"  Epochs: {args.epochs}  |  Effective batch: {args.batch_size * args.grad_accum}")
print(f"  LR: {args.lr}  |  LoRA rank: {args.lora_r}")
print(f"  Precision: {'bf16' if bf16_supported else 'fp16'}")
print(f"{'='*50}\n")

# Resume from checkpoint if specified
trainer.train(resume_from_checkpoint=args.resume)

print("\n[✓] Training complete!")


# ──────────────────────────────────────────────
# 6.  SAVE LoRA ADAPTER
# ──────────────────────────────────────────────
#   This saves ONLY the trained LoRA weights (~100-200 MB),
#   not the full 4B-param base model.  You can reload them later
#   with PeftModel.from_pretrained() on top of the base model.

lora_dir = os.path.join(args.output_dir, "phoenix-coach-lora")
model.save_pretrained(lora_dir)
tokenizer.save_pretrained(lora_dir)
print(f"[✓] LoRA adapter saved to {lora_dir}")


# ──────────────────────────────────────────────
# 7.  EXPORT OPTIONS  (uncomment what you need)
# ──────────────────────────────────────────────
#   Run these AFTER training, or in a separate script.
#   Each option produces a different artifact depending on
#   how you plan to deploy the model.

# --- Option A: GGUF for Ollama / llama.cpp ---
#   This merges the LoRA into the base model and quantises
#   to a GGUF file.  Q4_K_M is a good balance of size vs quality.
#   Q5_K_M is slightly better quality, Q8_0 is near-lossless.
#
# model.save_pretrained_gguf(
#     os.path.join(args.output_dir, "phoenix-coach-gguf"),
#     tokenizer,
#     quantization_method="q4_k_m",
# )
# print("[✓] GGUF (Q4_K_M) exported")

# --- Option B: Merged 16-bit (for vLLM / SGLang / HF) ---
#   Merges LoRA weights back into the base model at full precision.
#   Produces a single ~8 GB checkpoint you can load without PEFT.
#
# model.save_pretrained_merged(
#     os.path.join(args.output_dir, "phoenix-coach-merged-16bit"),
#     tokenizer,
#     save_method="merged_16bit",
# )
# print("[✓] Merged 16-bit model exported")

# --- Option C: Push to Hugging Face Hub ---
# model.push_to_hub_merged(
#     "your-username/phoenix-coach",
#     tokenizer,
#     save_method="merged_16bit",
#     token="hf_...",
# )


# ──────────────────────────────────────────────
# 8.  QUICK SANITY TEST
# ──────────────────────────────────────────────
#   Generate a response from the fine-tuned model to make sure
#   it produces valid JSON in the expected schema.

print("\n--- Sanity check: generating a test response ---\n")
FastLanguageModel.for_inference(model)

test_messages = [
    {"role": "system", "content": (
        "You are Phoenix Coach. You analyze the user's workout data and "
        "recommend safe, evidence-based progression. Output MUST be valid "
        'JSON matching the CoachResponse schema (schema_version="coach_response_v1").'
    )},
    {"role": "user", "content": (
        "TASK=coach_chat\n"
        'USER_PROFILE={"unit": "kg", "goal": "strength", "experience": "intermediate", "days_per_week": 4}\n'
        'WORKOUT_SUMMARY={"period_days": 7, "avg_sessions_per_week": 3.5, '
        '"current_volume": 25000, "previous_volume": 23000, "streak": 12, '
        '"recent_prs": [{"exercise": "Bench Press", "value": 100.0, "previous": 95.0}], '
        '"plateau_exercises": ["Overhead Press"]}'
    )},
]

inputs = tokenizer.apply_chat_template(
    test_messages,
    tokenize=True,
    add_generation_prompt=True,
    return_tensors="pt",
).to(model.device)

outputs = model.generate(
    input_ids=inputs,
    max_new_tokens=1024,
    temperature=0.7,
    top_p=0.8,
    top_k=20,
    repetition_penalty=1.05,
    do_sample=True,
)

response = tokenizer.decode(outputs[0][inputs.shape[-1]:], skip_special_tokens=True)
print(response[:1500])

# Validate JSON
try:
    parsed = json.loads(response)
    print("\n[✓] Output is valid JSON")
    if parsed.get("schema_version") == "coach_response_v1":
        print("[✓] Schema version matches")
    else:
        print("[!] Schema version missing or unexpected")
except json.JSONDecodeError as e:
    print(f"\n[✗] Output is NOT valid JSON: {e}")
    print("    This is common early in training or with low epochs.")
    print("    Try increasing epochs or check your dataset for consistency.")
