#!/usr/bin/env node

const assert = require("assert");
const fs = require("fs");
const path = require("path");

const headerPath = path.resolve(__dirname, "../src/landing/components/header.tsx");
const header = fs.readFileSync(headerPath, "utf8");

assert(
  header.includes('useState<string>(() => page === "cabling" ? tabs[0].path : tabs[1].path)'),
  "header tab selection should default rack/home pages to Rack Validation"
);
assert(
  header.includes('if (page?.includes("rack") && event.detail.value === "home")'),
  "header must not navigate a direct rack URL to home when highlighting Rack Validation"
);

console.log("rack URL history preservation checks passed");
