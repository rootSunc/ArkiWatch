import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src");
const files = [];
function walk(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".css")) files.push(path);
  }
}
walk(root);
let lines = 0;
const violations = [];
for (const path of files) {
  const text = readFileSync(path, "utf8");
  lines += text.trimEnd().split("\n").length;
  const css = text.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (css.replace(/@import[^;]+;/g, "").trim() && !css.includes("@layer")) {
    violations.push(`${relative(root, path)} must declare its cascade layer`);
  }
  if (css.includes("!important") && !path.endsWith("/overrides.css")) {
    violations.push(`${relative(root, path)}: !important belongs in the overrides layer`);
  }
}
if (lines >= 6000) violations.push(`${lines} CSS lines exceeds the <6000 line budget`);
console.log(`CSS: ${lines}/6000 lines across ${files.length} files.`);
if (violations.length) {
  console.error(violations.join("\n"));
  process.exitCode = 1;
} else console.log("Cascade layers and CSS budget are clean.");
