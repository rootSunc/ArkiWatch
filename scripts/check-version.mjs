import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const version = (await readFile(resolve(root, "VERSION"), "utf8")).trim();

const packageFiles = ["package.json", "apps/web/package.json"];
for (const relativePath of packageFiles) {
  const packageJson = JSON.parse(await readFile(resolve(root, relativePath), "utf8"));
  if (packageJson.version !== version) {
    throw new Error(`${relativePath} has version ${packageJson.version}; expected ${version}`);
  }
}

const openapi = JSON.parse(await readFile(resolve(root, "contracts/openapi.json"), "utf8"));
if (openapi.info?.version !== version) {
  throw new Error(`contracts/openapi.json has version ${openapi.info?.version}; expected ${version}`);
}

console.log(`Version ${version} is consistent across packages, API metadata, and OpenAPI.`);
