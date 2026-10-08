const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { MERKLE_DEPTH, MAX_ALLOWLIST_SIZE, PAYROLL_DIR } = require("../src/config");

// #44: the server and the circuit must agree on the tree depth, or every
// proof fails (or worse, the allowlist cap is wrong).
test("MERKLE_DEPTH in config.js matches DEPTH in the circuit source", () => {
  const source = fs.readFileSync(path.join(PAYROLL_DIR, "src", "main.nr"), "utf8");
  const match = /^global DEPTH: u32 = (\d+);/m.exec(source);
  assert.ok(match, "could not find `global DEPTH: u32 = N;` in main.nr");
  assert.equal(MERKLE_DEPTH, Number(match[1]));
  assert.equal(MAX_ALLOWLIST_SIZE, 2 ** Number(match[1]));
});

test("MERKLE_DEPTH matches merkle_path in the compiled circuit ABI", (t) => {
  const artifactPath = path.join(PAYROLL_DIR, "target", "payroll_compliance.json");
  if (!fs.existsSync(artifactPath)) return t.skip("circuit not compiled (run nargo compile)");
  const { abi } = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  for (const name of ["merkle_path", "merkle_index"]) {
    const param = abi.parameters.find((p) => p.name === name);
    assert.equal(param.type.length, MERKLE_DEPTH, name);
  }
});
