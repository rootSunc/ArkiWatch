import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const configSource = readFileSync(resolve(root, "apps/api/internal/config/config.go"), "utf8");

// Keep the check coupled to the Go loader itself, in both directions. Every key
// the loader reads must be documented, and every documented key must be read.
const loadedKeys = new Set();
for (const match of configSource.matchAll(/env(?:Or|Int|Bool|Float)\(\s*"([A-Z][A-Z0-9_]*)"/g)) {
  loadedKeys.add(match[1]);
}

function keysIn(path) {
  const keys = new Set();
  const pattern = /^(?:export\s+)?([A-Z][A-Z0-9_]*)=/;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const match = line.match(pattern);
    if (match) keys.add(match[1]);
  }
  return keys;
}

const failures = [];
// deploy/ is a local, untracked recipe; check its example only when present.
const examples = ["apps/api/.env.example", "deploy/env/api.env.example"].filter((path) =>
  existsSync(resolve(root, path)),
);
for (const relativePath of examples) {
  const documented = keysIn(resolve(root, relativePath));

  const missing = [...loadedKeys].filter((key) => !documented.has(key)).sort();
  if (missing.length > 0) {
    failures.push(`${relativePath}: read by the Go config but undocumented -> ${missing.join(", ")}`);
  }

  const unread = [...documented].filter((key) => !loadedKeys.has(key)).sort();
  if (unread.length > 0) {
    failures.push(
      `${relativePath}: documented but never read by the Go config -> ${unread.join(", ")}\n` +
        "  Either wire the key into apps/api/internal/config/config.go or remove it from the example.",
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`Go API environment examples match the loader exactly (${loadedKeys.size} keys).`);
}
