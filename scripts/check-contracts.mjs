import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const root = process.cwd();
const tempRoot = mkdtempSync(join(tmpdir(), "arkiwatch-contracts-"));
const generatedTypes = join(tempRoot, "api-contract.ts");
const openApi = join(root, "contracts/openapi.json");

try {
  execFileSync("pnpm", [
    "--filter",
    "@arkiwatch/web",
    "exec",
    "openapi-typescript",
    openApi,
    "-o",
    generatedTypes,
  ], { cwd: root, stdio: "inherit" });

  const currentTypes = readFileSync(join(root, "apps/web/src/lib/api-contract.ts"), "utf8");
  const freshTypes = readFileSync(generatedTypes, "utf8");

  if (currentTypes !== freshTypes) {
    console.error(
      "Generated frontend API types are stale. Run `pnpm run contracts:generate` and review the result.",
    );
    process.exitCode = 1;
  } else {
    console.log("OpenAPI and frontend API contracts are up to date.");
  }
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}
