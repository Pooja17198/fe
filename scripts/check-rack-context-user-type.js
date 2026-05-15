#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const repoRoot = path.resolve(__dirname, "..");
const sourcePath = path.join(repoRoot, "src/landing/components/content/rackContext.ts");
const source = fs.readFileSync(sourcePath, "utf8");

const transpiled = ts.transpileModule(source, {
  compilerOptions: {
    esModuleInterop: true,
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
});

const moduleUnderTest = { exports: {} };
const localRequire = (request) => {
  if (request === "../../config/api") {
    return { getLvvApiBase: () => "https://lvv.test/validation" };
  }
  if (request === "../rack/api") {
    return {
      fetchWithRetry: async () => ({
        ok: true,
        json: async () => ({}),
      }),
    };
  }
  return require(request);
};

new Function("require", "module", "exports", transpiled.outputText)(
  localRequire,
  moduleUnderTest,
  moduleUnderTest.exports
);

const { parseRackUrlContext } = moduleUnderTest.exports;

function makeLocation(search) {
  return {
    pathname: "/rack/2604NM8001",
    search,
  };
}

const fullMasterUrl = parseRackUrlContext(
  makeLocation(
    "?region=us-phoenix-1&project=testFecBer&building=phx23&block=9&rack=4206&rackState=RECEIVED&isGpuRack=false&availabilityDomain=&userType=master&ticket=DO-2749265"
  )
);

assert.strictEqual(fullMasterUrl.metadata.userType, "master");
assert.strictEqual(fullMasterUrl.needsBackendHydration, false);

const fullVendorUrl = parseRackUrlContext(
  makeLocation(
    "?region=us-phoenix-1&project=testFecBer&building=phx23&block=9&rack=4206&rackState=RECEIVED&isGpuRack=false&availabilityDomain=&userType=vendor&resolveEnabled=false&resolveDisabledReason=No+open+ticket"
  )
);

assert.strictEqual(fullVendorUrl.metadata.userType, "vendor");
assert.strictEqual(fullVendorUrl.needsBackendHydration, false);

const shortUrl = parseRackUrlContext(
  makeLocation("?region=us-phoenix-1&building=phx23&block=9&rack=4206")
);

assert.strictEqual(shortUrl.metadata.userType, undefined);
assert.strictEqual(shortUrl.needsBackendHydration, true);

console.log("rackContext userType URL compatibility checks passed");
