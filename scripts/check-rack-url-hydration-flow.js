#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const sourcePath = path.resolve(
  __dirname,
  "../src/landing/components/content/index.tsx"
);
const source = fs.readFileSync(sourcePath, "utf8");

assert(
  !source.includes("await hydrateRackUrlContext(ac.signal)"),
  "rack context hydration must not be aborted by startup effect cleanup"
);
assert(
  !source.includes("}, [props.page, selectedVendor]);"),
  "rack context hydration must not rerun when selectedVendor changes"
);
assert(
  source.includes('const isRackPage = Boolean(props.page?.includes("rack"));'),
  "direct rack URL hydration should wait until the router is on the rack page"
);
assert(
  !source.includes('if ((error as any)?.name === "AbortError") {\n          return;\n        }'),
  "rack context hydration must not silently ignore non-cleanup AbortError failures"
);
assert(
  source.includes("if (!ctx.userType) {") &&
    source.indexOf("if (!ctx.userType) {") < source.indexOf("resolveCurrentUserType("),
  "full rack URLs that provide userType must not invoke async user type lookup"
);
assert(
  !source.includes("Loading rack context") &&
    source.includes('class="rack-url-loading"') &&
    source.includes("<oj-progress-circle") &&
    source.includes("Loading rack..."),
  "direct rack URL loading state should use a polished spinner and user-facing copy"
);

console.log("rack URL hydration flow checks passed");
