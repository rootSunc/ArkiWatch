import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const trackedFiles = execFileSync("git", ["ls-files"], {
  cwd: root,
  encoding: "utf8",
})
  .split(/\r?\n/)
  .filter(Boolean)
  .filter((relativePath) => fs.existsSync(path.join(root, relativePath)));

const forbiddenFiles = trackedFiles.filter((relativePath) => {
  return (
    relativePath.endsWith(".py") ||
    ["alembic.ini", "pyproject.toml", "uv.lock"].includes(path.basename(relativePath))
  );
});

if (forbiddenFiles.length > 0) {
  console.error("Python project files are tracked; this repository is Go + TypeScript only:");
  for (const relativePath of forbiddenFiles) {
    console.error(`- ${relativePath}`);
  }
  process.exit(1);
}

const packageJson = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
if (JSON.stringify(packageJson.workspaces) !== JSON.stringify(["apps/web"])) {
  throw new Error("The root workspace must contain only apps/web.");
}

if (!fs.existsSync(path.join(root, "apps/api/go.mod"))) {
  throw new Error("The Go API module is missing.");
}

if (!fs.existsSync(path.join(root, "contracts/openapi.json"))) {
  throw new Error("The static OpenAPI contract is missing.");
}

console.log("Go-only backend boundary is intact.");
