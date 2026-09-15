// Export Go-owned coverage and offline decisions. TypeScript is loaded only to
// obtain raw UI fixtures; production decision code is never implemented here.
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const web = path.join(root, "apps/web");
const ts = require(path.join(web, "node_modules/typescript"));
const resolve = Module._resolveFilename;
Module._resolveFilename = function (id, parent, ...rest) {
 return resolve.call(this, id.startsWith("@/") ? path.join(web, "src", id.slice(2)) : id, parent, ...rest);
};
for (const ext of [".ts", ".tsx"]) Module._extensions[ext] = (module, file) => {
 const output = ts.transpileModule(fs.readFileSync(file, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true, jsx: ts.JsxEmit.ReactJSX } });
 module._compile(output.outputText, file);
};
const temp = fs.mkdtempSync(path.join(os.tmpdir(), "arkiwatch-assets-"));
const check = process.argv.includes("--check");
function save(name, value) {
 const file = path.join(web, "src/features/data-platform/generated", name);
 if (check) { if (fs.readFileSync(file,"utf8") !== value) throw new Error(`${name} is stale; run pnpm run domain:generate`); }
 else fs.writeFileSync(file, value);
}
try {
 const binary = path.join(temp,"web-assets");
 execFileSync("go",["build","-o",binary,"./cmd/web-assets"],{cwd:path.join(root,"apps/api"),stdio:"inherit"});
 const coverageJSON = execFileSync(binary,[],{encoding:"utf8"});
 save("coverage.json",coverageJSON);
 const coverage=JSON.parse(coverageJSON);
 const { rawDemoFixtureForScope, DEMO_SNAPSHOT_DATE } = require(path.join(web,"src/features/data-platform/demo/demo-data.ts"));
 const inputs={};
 for(const city of coverage.cities) for(const [kind,date] of [["live",null],["historical",DEMO_SNAPSHOT_DATE],["missing","2026-08-07"]]) {
  inputs[`${city.city_ref}:${kind}`] = { ...rawDemoFixtureForScope({city:city.city_ref,date}), city:city.city_ref,region:city.region };
 }
 const rawEnergy={energy:inputs["helsinki:live"].energy, householdEnergy:inputs["helsinki:live"].householdEnergy};
 save("energy-costs.json",execFileSync(binary,["-energy-costs"],{input:JSON.stringify(rawEnergy),encoding:"utf8"}));
 const decisions=execFileSync(binary,["-briefings"],{input:JSON.stringify(inputs),encoding:"utf8",maxBuffer:16*1024*1024});
 save("briefings.json",decisions);
 console.log(check ? "Go-generated web assets are current." : "Generated coverage and Demo decisions from Go.");
} finally {fs.rmSync(temp,{recursive:true,force:true});}
