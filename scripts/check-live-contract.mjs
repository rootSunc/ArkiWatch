// Verifies a running Go API against contracts/openapi.json.
//
// The OpenAPI file is a static contract, not generated from the live routes.
// A nested field can diverge (a PascalCase metric list, a renamed key) while
// every top-level check still passes, so this walks the declared schema
// recursively against real responses.
//
// Usage: node scripts/check-live-contract.mjs [baseUrl]
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const baseUrl = (process.argv[2] || process.env.ARKIWATCH_API_URL || "http://127.0.0.1:8000").replace(/\/$/, "");
const spec = JSON.parse(readFileSync(resolve(root, "contracts/openapi.json"), "utf8"));
const schemas = spec.components?.schemas ?? {};

function resolveSchema(schema, depth = 0) {
  if (!schema || typeof schema !== "object" || depth > 12) return schema;
  if (schema.$ref) {
    const name = schema.$ref.split("/").pop();
    return resolveSchema(schemas[name], depth + 1);
  }
  return schema;
}

// A declared "anyOf" is satisfied by any branch, so only report a mismatch when
// no branch accepts the value.
function branches(schema) {
  const resolved = resolveSchema(schema);
  if (!resolved) return [];
  if (Array.isArray(resolved.anyOf)) return resolved.anyOf.map((item) => resolveSchema(item));
  if (Array.isArray(resolved.oneOf)) return resolved.oneOf.map((item) => resolveSchema(item));
  return [resolved];
}

function checkValue(schema, value, path, problems) {
  const options = branches(schema);
  if (options.length === 0) return;
  if (options.length > 1) {
    const accepted = options.some((option) => {
      const nested = [];
      checkValue(option, value, path, nested);
      return nested.length === 0;
    });
    if (!accepted) problems.push(`${path}: value does not match any declared variant`);
    return;
  }

  const resolved = options[0];
  if (value === null || value === undefined) return;
  if (resolved.type === "array") {
    if (!Array.isArray(value)) {
      problems.push(`${path}: expected an array, got ${typeof value}`);
      return;
    }
    // One representative element is enough; the shapes within a list are uniform.
    if (value.length > 0) checkValue(resolved.items, value[0], `${path}[0]`, problems);
    return;
  }
  if (resolved.type === "object" || resolved.properties) {
    if (typeof value !== "object" || Array.isArray(value)) {
      problems.push(`${path}: expected an object, got ${Array.isArray(value) ? "array" : typeof value}`);
      return;
    }
    const declared = resolved.properties ?? {};
    const declaredKeys = Object.keys(declared);
    if (declaredKeys.length === 0) return;

    for (const required of resolved.required ?? []) {
      if (!(required in value)) problems.push(`${path}.${required}: required by the contract but absent from the response`);
    }
    if (resolved.additionalProperties !== true) {
      for (const key of Object.keys(value)) {
        if (!declaredKeys.includes(key)) problems.push(`${path}.${key}: returned by the server but not declared in the contract`);
      }
    }
    for (const key of declaredKeys) {
      if (key in value) checkValue(declared[key], value[key], `${path}.${key}`, problems);
    }
  }
}

async function login() {
  const response = await fetch(`${baseUrl}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: process.env.ADMIN_USERNAME || "admin",
      password: process.env.ADMIN_PASSWORD || "admin",
    }),
  });
  if (!response.ok) return null;
  return (await response.json()).access_token ?? null;
}

const token = await login();
if (!token) {
  console.error(`Could not authenticate against ${baseUrl}; is the API running and bootstrapped?`);
  process.exit(1);
}
const headers = { Authorization: `Bearer ${token}` };
const userId = (await (await fetch(`${baseUrl}/api/auth/me`, { headers })).json()).id;

const problems = [];
const degraded = [];
let checked = 0;
for (const [path, operations] of Object.entries(spec.paths)) {
  const operation = operations.get;
  if (!operation) continue;
  if (path.includes("{")) continue; // identifier routes need fixtures, not a smoke check

  const schema = operation.responses?.["200"]?.content?.["application/json"]?.schema;
  if (!schema) continue;

  const needsUser = (operation.parameters ?? []).some((parameter) => parameter.name === "user_id" && parameter.required);
  const url = `${baseUrl}${path}${needsUser ? `?user_id=${encodeURIComponent(userId)}` : ""}`;
  const response = await fetch(url, { headers });
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("json")) {
    if (!response.ok) problems.push(`${path}: returned HTTP ${response.status} with a non-JSON body`);
    continue;
  }

  // A health endpoint answers 503 while a source is degraded, which is a real
  // operational state rather than contract drift. What matters either way is
  // that the body still has the declared shape.
  checked += 1;
  const body = await response.json();
  const before = problems.length;
  checkValue(schema, body, path, problems);
  if (!response.ok && problems.length === before) {
    degraded.push(`${path} -> HTTP ${response.status}`);
  }
}

if (problems.length > 0) {
  console.error(`Live API drifted from contracts/openapi.json (${problems.length} issues):`);
  for (const problem of problems) console.error(`- ${problem}`);
  process.exit(1);
}
console.log(`Live API matches contracts/openapi.json across ${checked} endpoints.`);
if (degraded.length > 0) {
  console.log(`Shape-valid but not healthy right now: ${degraded.join(", ")}`);
}
