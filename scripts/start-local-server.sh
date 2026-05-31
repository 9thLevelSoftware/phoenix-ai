#!/usr/bin/env bash
# Start llama.cpp server with the v4 coaching model

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
MODEL_PATH="${PROJECT_DIR}/models/qwen2.5-7b-coaching-v4-Q4_K_M.gguf"
HOST="${LLAMA_HOST:-0.0.0.0}"
PORT="${LLAMA_PORT:-8080}"
CONTEXT_SIZE="${LLAMA_CONTEXT:-8192}"

if [ ! -f "$MODEL_PATH" ]; then
    echo "ERROR: Model not found at $MODEL_PATH"
    echo "Run 'scripts/convert-v4-to-gguf.py' first to generate the GGUF model."
    exit 1
fi

echo "Starting llama.cpp server with v4 coaching model..."
echo "  Model: $MODEL_PATH"
echo "  Host:  $HOST:$PORT"
echo "  Context: $CONTEXT_SIZE"

# Find llama-server binary
LLAMA_SERVER=""
for path in /tmp/llama.cpp/build/bin/llama-server \
            llama-server \
            /usr/local/bin/llama-server; do
    if command -v "$path" &>/dev/null || [ -x "$path" ]; then
        LLAMA_SERVER="$path"
        break
    fi
done

if [ -z "$LLAMA_SERVER" ]; then
    echo "ERROR: llama-server not found. Build llama.cpp first:"
    echo "  cd /tmp/llama.cpp && cmake -B build && cmake --build build --config Release"
    exit 1
fi

exec "$LLAMA_SERVER" \
    --model "$MODEL_PATH" \
    --host "$HOST" \
    --port "$PORT" \
    --ctx-size "$CONTEXT_SIZE" \
    --n-gpu-layers 999 \
    --parallel 1 \
    "$@"
