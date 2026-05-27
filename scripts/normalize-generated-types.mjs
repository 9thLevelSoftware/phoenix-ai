#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";

const generatedTypesPath = new URL("../worker-configuration.d.ts", import.meta.url);
const content = readFileSync(generatedTypesPath, "utf8");
const normalized = content.replace(/[ \t]+$/gm, "");

if (normalized !== content) {
  writeFileSync(generatedTypesPath, normalized);
}
