import assert from "node:assert/strict";
import { test } from "node:test";
import { checkSafetyRedFlags } from "../src/safety.ts";
import { extractChunks, sourceMetadata, checkContextGrounding } from "../src/retrieval.ts";

test("Safety pre-filter flags acute pain and injury triggers", () => {
  const cases = [
    "I have joint pain in my shoulder",
    "stabbing pain in my knee when squatting",
    "experiencing severe chest pain during cardio",
    "how to train with a rotator cuff injury",
    "it hurts my back to lift this"
  ];

  for (const text of cases) {
    const res = checkSafetyRedFlags(text);
    assert.equal(res.safe, false, `Should flag: "${text}"`);
    assert.equal(res.reason, "acute_pain_injury");
    assert.match(res.responseOverride || "", /medical advice/i);
    assert.match(res.responseOverride || "", /consult a healthcare professional/i);
  }
});

test("Safety pre-filter flags extreme dieting calorie targets", () => {
  const cases = [
    "I am going to starve myself to cut fast",
    "can I diet on 500 calories per day?",
    "how to structure an 800 kcal daily diet",
    "starving is the only way for me to lose weight"
  ];

  for (const text of cases) {
    const res = checkSafetyRedFlags(text);
    assert.equal(res.safe, false, `Should flag: "${text}"`);
    assert.equal(res.reason, "extreme_dieting");
    assert.match(res.responseOverride || "", /extreme calorie targets/i);
    assert.match(res.responseOverride || "", /1200 kcal/i);
  }
});

test("Safety pre-filter flags hazardous supplements", () => {
  const cases = [
    "is clenbuterol safe for fat loss?",
    "how to cycle clen",
    "DNP dosage for rapid shredding",
    "dinitrophenol fat burning routines"
  ];

  for (const text of cases) {
    const res = checkSafetyRedFlags(text);
    assert.equal(res.safe, false, `Should flag: "${text}"`);
    assert.equal(res.reason, "unsafe_supplement");
    assert.match(res.responseOverride || "", /life-threatening/i);
    assert.match(res.responseOverride || "", /progressive overload/i);
  }
});

test("Safety pre-filter allows safe words with matching roots", () => {
  const cases = [
    "I am painting my home gym today",
    "progressive overload is painstaking but worth it",
    "clenching my teeth during heavy lifts",
    "no pain no gain is a common saying" // General idiom, not acute pain report
  ];

  for (const text of cases) {
    const res = checkSafetyRedFlags(text);
    assert.equal(res.safe, true, `Should allow: "${text}"`);
  }
});

test("Grounding validator flags unsupported Vitruvian product claims", () => {
  const mockChunks = [
    {
      id: "training-modes",
      text: "The Old School (OLD_SCHOOL) and Time Under Tension (TUT) modes are supported.",
      metadata: { title: "Vitruvian Training Modes" }
    }
  ];

  // Grounded response using supported modes
  const groundedReply = "You can train hypertrophy in Time Under Tension (TUT) mode.";
  const res1 = checkContextGrounding(mockChunks, groundedReply);
  assert.equal(res1.grounded, true);

  // Ungrounded response mentioning TUT_BEAST and strength ceiling not in chunks
  const ungroundedReply = "We should calibrate your strength ceiling in TUT_BEAST mode.";
  const res2 = checkContextGrounding(mockChunks, ungroundedReply);
  assert.equal(res2.grounded, false);
  assert.deepEqual(res2.missingClaims, ["tut_beast", "strength ceiling"]);
});

test("AI Search chunk extractor normalizes multiple response shapes", () => {
  const responseWithChunks = {
    chunks: [
      { id: "c1", text: "chunk text", metadata: { title: "Title 1" } }
    ]
  };
  const responseWithData = {
    data: [
      { id: "d1", text: "data text", metadata: { title: "Title 2" } }
    ]
  };
  const responseWithResults = {
    results: [
      { id: "r1", text: "result text", metadata: { title: "Title 3" } }
    ]
  };

  const parsedChunks = extractChunks(responseWithChunks);
  assert.equal(parsedChunks.length, 1);
  assert.equal(parsedChunks[0].id, "c1");

  const parsedData = extractChunks(responseWithData);
  assert.equal(parsedData.length, 1);
  assert.equal(parsedData[0].id, "d1");

  const parsedResults = extractChunks(responseWithResults);
  assert.equal(parsedResults.length, 1);
  assert.equal(parsedResults[0].id, "r1");
});

test("Source metadata maps safe payload format", () => {
  const chunks = [
    {
      id: "vitruvian-modes",
      metadata: { title: "Vitruvian Training Modes" },
      score: 0.95
    }
  ];

  const meta = sourceMetadata(chunks);
  assert.equal(meta.length, 1);
  assert.equal(meta[0].id, "vitruvian-modes");
  assert.equal(meta[0].source, "Vitruvian Training Modes");
  assert.equal(meta[0].score, 0.95);
});
