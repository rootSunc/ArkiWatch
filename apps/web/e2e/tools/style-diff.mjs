/**
 * Diffs two style snapshots. Exit code 0 means the refactor changed no
 * rendering anywhere in the captured matrix.
 *
 *   node e2e/tools/style-diff.mjs before.json after.json [--max=40]
 */
import { readFileSync } from "node:fs";

const [beforePath, afterPath, ...flags] = process.argv.slice(2);
const maxReported = Number(flags.find((f) => f.startsWith("--max="))?.slice(6) ?? 40);

const before = JSON.parse(readFileSync(beforePath, "utf8"));
const after = JSON.parse(readFileSync(afterPath, "utf8"));

const differences = [];
const record = (scope, detail) => differences.push(`${scope}: ${detail}`);

for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
  if (!before[key] || !after[key]) {
    record(key, before[key] ? "missing from after" : "missing from before");
    continue;
  }

  for (const token of new Set([
    ...Object.keys(before[key].tokens),
    ...Object.keys(after[key].tokens),
  ])) {
    const from = before[key].tokens[token];
    const to = after[key].tokens[token];
    if (from !== to) {
      record(key, `token ${token}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
    }
  }

  const beforeElements = before[key].elements;
  const afterElements = after[key].elements;
  for (const address of new Set([...Object.keys(beforeElements), ...Object.keys(afterElements)])) {
    if (!beforeElements[address] || !afterElements[address]) {
      record(key, `element ${address} ${beforeElements[address] ? "removed" : "added"}`);
      continue;
    }
    for (const property of Object.keys(beforeElements[address])) {
      const from = beforeElements[address][property];
      const to = afterElements[address][property];
      if (from !== to) {
        record(key, `${address} ${property}: ${JSON.stringify(from)} -> ${JSON.stringify(to)}`);
      }
    }
  }
}

if (differences.length === 0) {
  console.log("No rendering differences.");
  process.exit(0);
}

console.log(`${differences.length} rendering difference(s):\n`);
for (const difference of differences.slice(0, maxReported)) {
  console.log(`  ${difference}`);
}
if (differences.length > maxReported) {
  console.log(`  … ${differences.length - maxReported} more`);
}
process.exit(1);
