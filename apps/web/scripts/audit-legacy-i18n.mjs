#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const messagesRoot = path.join(
  repoRoot,
  "apps/web/src/features/data-platform/messages",
);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(messagesRoot, relativePath), "utf8"));
}

function walkCode(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "messages"].includes(entry.name)) {
        continue;
      }
      walkCode(absolutePath, acc);
    } else if (/\.(tsx?|py)$/.test(entry.name)) {
      acc.push(fs.readFileSync(absolutePath, "utf8"));
    }
  }
  return acc;
}

const legacyZh = readJson("zh.json");
const labelsEn = readJson("labels.en.json").labels;
const legacyKeyCount = Object.keys(legacyZh).length;

const codeCorpus = walkCode(
  path.join(repoRoot, "apps/web/src/features/data-platform"),
).concat(walkCode(path.join(repoRoot, "apps/api/backend"))).join("\n");

const unreferencedLabels = Object.entries(labelsEn)
  .filter(([, englishText]) => {
    return !codeCorpus.includes(`"${englishText}"`) && !codeCorpus.includes(`'${englishText}'`);
  })
  .map(([key]) => key);

console.log("Legacy zh.json keys:", legacyKeyCount);
console.log("Structured labels keys:", Object.keys(labelsEn).length);
console.log("Labels without source/API literal match:", unreferencedLabels.length);

if (legacyKeyCount > 0) {
  console.log("\nLegacy zh.json still contains entries. Prefer labels.* namespaces.");
  console.log("Sample:", Object.keys(legacyZh).slice(0, 10).join(", "));
}

if (unreferencedLabels.length > 0) {
  console.log("\nPossibly stale labels.* keys (first 20):");
  for (const key of unreferencedLabels.slice(0, 20)) {
    console.log(`- labels.${key}`);
  }
}

if (legacyKeyCount === 0 && unreferencedLabels.length === 0) {
  console.log("\nCatalog looks clean.");
}
