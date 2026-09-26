import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const sourceRoot = join(process.cwd(), "src");
const tokenFile = join(sourceRoot, "app", "tokens.css");
const literalColor = /#[\da-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\s*\(/gi;
const violations = [];

function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(path);
      continue;
    }
    if (!entry.name.endsWith(".css") || path === tokenFile) continue;

    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(literalColor)) {
      const line = source.slice(0, match.index).split("\n").length;
      violations.push(`${relative(process.cwd(), path)}:${line}: ${match[0]}`);
    }
  }
}

scan(sourceRoot);

if (violations.length) {
  console.error("Color literals belong in src/app/tokens.css:\n" + violations.join("\n"));
  process.exitCode = 1;
} else {
  console.log("Component styles use shared color tokens.");
}
