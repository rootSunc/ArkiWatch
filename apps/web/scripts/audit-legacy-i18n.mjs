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

function flattenMessageKeys(value, prefix = "", result = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return result;
  }

  for (const [key, child] of Object.entries(value)) {
    const messageKey = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      flattenMessageKeys(child, messageKey, result);
    } else {
      result.push(messageKey);
    }
  }

  return result;
}

function validateStructuredCatalogs() {
  const parityIssues = [];
  const suspiciousKeys = [];
  const englishFiles = fs
    .readdirSync(messagesRoot)
    .filter((file) => file.endsWith(".en.json"))
    .sort();

  for (const englishFile of englishFiles) {
    const chineseFile = englishFile.replace(/\.en\.json$/, ".zh.json");
    const englishPath = path.join(messagesRoot, englishFile);
    const chinesePath = path.join(messagesRoot, chineseFile);
    if (!fs.existsSync(chinesePath)) {
      parityIssues.push(`${englishFile} is missing ${chineseFile}`);
      continue;
    }

    const englishKeys = new Set(
      flattenMessageKeys(JSON.parse(fs.readFileSync(englishPath, "utf8"))),
    );
    const chineseKeys = new Set(
      flattenMessageKeys(JSON.parse(fs.readFileSync(chinesePath, "utf8"))),
    );

    for (const key of englishKeys) {
      if (!chineseKeys.has(key)) {
        parityIssues.push(`${englishFile}: missing in ${chineseFile}: ${key}`);
      }
    }
    for (const key of chineseKeys) {
      if (!englishKeys.has(key)) {
        parityIssues.push(`${chineseFile}: missing in ${englishFile}: ${key}`);
      }
    }

    for (const key of new Set([...englishKeys, ...chineseKeys])) {
      const leaf = key.slice(key.lastIndexOf(".") + 1);
      // labels._ is an intentional alias used to translate a bare underscore.
      if (leaf.length <= 1 && !(englishFile === "labels.en.json" && key === "labels._")) {
        suspiciousKeys.push(`${englishFile}/${chineseFile}: ${key}`);
      }
    }
  }

  return { parityIssues, suspiciousKeys };
}

function walkCode(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", ".next", "dist", "messages", "__pycache__", ".venv"].includes(entry.name)) {
        continue;
      }
      walkCode(absolutePath, acc);
    } else if (/\.(tsx?|py)$/.test(entry.name)) {
      acc.push(fs.readFileSync(absolutePath, "utf8"));
    }
  }
  return acc;
}

function camelToSnake(value) {
  return value.replace(/([a-z0-9])([A-Z])/g, "$1_$2").toLowerCase();
}

const legacyZh = readJson("zh.json");
const labelsEn = readJson("labels.en.json").labels;
const apiCorpus = walkCode(path.join(repoRoot, "apps/api/backend")).join("\n");
const webCorpus = walkCode(path.join(repoRoot, "apps/web/src")).join("\n");

const runtimeTexts = new Set();
const runtimeSnakes = new Set();

for (const pattern of [
  /_metric\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g,
  /_build_metric\(\s*\n?\s*"([^"]+)"\s*,\s*\n?\s*"([^"]+)"/g,
]) {
  let match = pattern.exec(apiCorpus);
  while (match) {
    runtimeSnakes.add(match[1]);
    runtimeTexts.add(match[2]);
    match = pattern.exec(apiCorpus);
  }
}

for (const pattern of [/label=\"([^\"\\]{2,200})\"/g, /title=\"([^\"\\]{2,200})\"/g]) {
  let match = pattern.exec(apiCorpus);
  while (match) {
    runtimeTexts.add(match[1]);
    match = pattern.exec(apiCorpus);
  }
}

for (const file of [
  path.join(repoRoot, "apps/web/src/features/data-platform/category-metadata.ts"),
  path.join(repoRoot, "apps/api/backend/app/data_catalog_entries.py"),
]) {
  const text = fs.readFileSync(file, "utf8");
  for (const match of text.matchAll(/"([a-z0-9_]+)"/g)) {
    if (match[1].includes("_")) {
      runtimeSnakes.add(match[1]);
    }
  }
}

function metricLabelKeyFromSnake(key) {
  if (!key) {
    return key;
  }
  const [head, ...tail] = key.split("_");
  return head + tail.map((part) => part.slice(0, 1).toUpperCase() + part.slice(1)).join("");
}

function isRuntimeLabel(key, englishText) {
  const snake = camelToSnake(key);
  return (
    runtimeTexts.has(englishText) ||
    runtimeSnakes.has(snake) ||
    metricLabelKeyFromSnake(snake) === key ||
    webCorpus.includes(`"${key}"`) ||
    webCorpus.includes(`labelKey: "${key}"`) ||
    webCorpus.includes(`fullLabelKey: "${key}"`) ||
    webCorpus.includes(`label_key: "${key}"`) ||
    apiCorpus.includes(`"label": "${englishText}"`)
  );
}

const stale = Object.entries(labelsEn)
  .filter(([key, englishText]) => !isRuntimeLabel(key, englishText))
  .map(([key]) => key);

const { parityIssues, suspiciousKeys } = validateStructuredCatalogs();

console.log("Legacy zh.json keys:", Object.keys(legacyZh).length);
console.log("Structured labels keys:", Object.keys(labelsEn).length);
console.log("Labels without API/runtime match:", stale.length);
console.log("Structured catalog parity issues:", parityIssues.length);
console.log("Suspicious structured message keys:", suspiciousKeys.length);

if (stale.length > 0) {
  console.log("\nPossibly stale labels.* keys (first 20):");
  for (const key of stale.slice(0, 20)) {
    console.log(`- labels.${key}`);
  }
} else {
  console.log("\nCatalog looks clean.");
}

const legacyKeyCount = Object.keys(legacyZh).length;
let failed = false;

if (legacyKeyCount > 0) {
  console.error(`\nFAIL: legacy zh.json still has ${legacyKeyCount} flat keys.`);
  failed = true;
}

if (stale.length > 0) {
  console.error(`\nFAIL: ${stale.length} labels.* keys have no API or frontend runtime match.`);
  failed = true;
}

if (parityIssues.length > 0) {
  console.error("\nFAIL: structured message catalogs are not symmetric (first 20):");
  for (const issue of parityIssues.slice(0, 20)) {
    console.error(`- ${issue}`);
  }
  failed = true;
}

if (suspiciousKeys.length > 0) {
  console.error("\nFAIL: structured catalogs contain suspicious one-character keys:");
  for (const key of suspiciousKeys.slice(0, 20)) {
    console.error(`- ${key}`);
  }
  failed = true;
}

if (failed) {
  process.exit(1);
}
