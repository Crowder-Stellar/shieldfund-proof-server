const { execFile } = require("child_process");
const fs = require("fs/promises");
const path = require("path");
const { NARGO_BIN, BB_BIN, HASH_UTIL_DIR, PAYROLL_DIR, SUBPROCESS_TIMEOUT_MS } = require("./config");
const { createMutex } = require("./mutex");
const { toFieldHex } = require("./hash");

const hashUtilLock = createMutex();
const payrollLock = createMutex();

function run(bin, args, cwd, timeout = SUBPROCESS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const options = { cwd, maxBuffer: 1024 * 1024 * 64, timeout, killSignal: "SIGKILL" };
    execFile(bin, args, options, (err, stdout, stderr) => {
      if (err && err.killed) {
        const wrapped = new Error(`${path.basename(bin)} ${args[0]} timed out after ${timeout}ms`);
        wrapped.assertion = null;
        wrapped.stdout = stdout;
        wrapped.stderr = stderr;
        reject(wrapped);
        return;
      }
      if (err) {
        const assertion = extractAssertionMessage(stderr) || extractAssertionMessage(stdout);
        const wrapped = new Error(assertion || stderr || stdout || err.message);
        // Set only when a Noir assert() rejected the inputs — safe to show
        // callers. Anything else is a toolchain failure whose raw output
        // (paths, compiler dumps) must stay in the server logs.
        wrapped.assertion = assertion;
        wrapped.stdout = stdout;
        wrapped.stderr = stderr;
        reject(wrapped);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// nargo prints Noir assert() messages as `error: Assertion failed: <msg>`.
// Surface that directly instead of the raw multi-line compiler output.
function extractAssertionMessage(output) {
  if (!output) return null;
  const match = output.match(/Assertion failed:\s*'?([^'\n]+)'?/);
  return match ? match[1].trim() : null;
}

// Runs the hash_util circuit (pedersen_hash([a, b])) and returns its return
// value. Used off-chain to build the allowlist Merkle tree with the exact
// hash function payroll_compliance uses internally, so tree/path values line
// up with what the circuit will recompute.
async function hashPair(a, b) {
  return hashUtilLock(async () => {
    const toml = `a = "${toFieldHex(a)}"\nb = "${toFieldHex(b)}"\n`;
    await fs.writeFile(path.join(HASH_UTIL_DIR, "Prover.toml"), toml);
    const { stdout } = await run(NARGO_BIN, ["execute", "server_witness"], HASH_UTIL_DIR);
    const match = stdout.match(/Circuit output:\s*(0x[0-9a-fA-F]+)/);
    if (!match) throw new Error(`could not parse hash_util output: ${stdout}`);
    return match[1];
  });
}

function buildPayrollProverToml(inputs) {
  const { merkleRoot, budgetCommitment, recipientId, amount, proofTypeId, merklePath, merkleIndex, budgetCap, budgetSalt } = inputs;
  const pathToml = merklePath.map((v) => `"${v}"`).join(", ");
  const indexToml = merkleIndex.map((v) => (v ? "true" : "false")).join(", ");
  return [
    `merkle_root = "${merkleRoot}"`,
    `budget_commitment = "${budgetCommitment}"`,
    `recipient_id = "${toFieldHex(recipientId)}"`,
    `amount = "${toFieldHex(amount)}"`,
    `proof_type_id = "${proofTypeId}"`,
    `merkle_path = [${pathToml}]`,
    `merkle_index = [${indexToml}]`,
    `budget_cap = "${toFieldHex(budgetCap)}"`,
    `budget_salt = "${toFieldHex(budgetSalt)}"`,
    "",
  ].join("\n");
}

// Executes the circuit (fails with the Noir assert() message if inputs are
// invalid — no allowlist membership, over budget, bad proof_type_id), then
// generates an UltraHonk proof with `bb prove` and locally verifies it with
// `bb verify` before returning. Mirrors the "proof server generates and
// locally verifies" design described in shieldfund-contracts' proof_registry.
async function provePayrollCompliance(inputs) {
  return payrollLock(async () => {
    const toml = buildPayrollProverToml(inputs);
    await fs.writeFile(path.join(PAYROLL_DIR, "Prover.toml"), toml);

    const witnessName = "server_witness";
    await run(NARGO_BIN, ["execute", witnessName], PAYROLL_DIR);

    const outDir = path.join("target", "server_proof");
    await fs.mkdir(path.join(PAYROLL_DIR, outDir), { recursive: true });

    const started = Date.now();
    await run(
      BB_BIN,
      [
        "prove",
        "-b", "target/payroll_compliance.json",
        "-w", `target/${witnessName}.gz`,
        "-o", outDir,
        "--output_format", "json",
        "--write_vk",
      ],
      PAYROLL_DIR,
    );
    const provingTimeMs = Date.now() - started;

    const proofPath = path.join(PAYROLL_DIR, outDir, "proof.json");
    const publicInputsPath = path.join(PAYROLL_DIR, outDir, "public_inputs.json");
    const vkPath = path.join(PAYROLL_DIR, outDir, "vk.json");

    // Explicit local verification step — this is the "locally verified"
    // guarantee the proof-server is trusted for before it ever anchors a
    // hash on-chain via proof_registry::register_proof().
    await run(
      BB_BIN,
      ["verify", "-p", path.relative(PAYROLL_DIR, proofPath), "-i", path.relative(PAYROLL_DIR, publicInputsPath), "-k", path.relative(PAYROLL_DIR, vkPath)],
      PAYROLL_DIR,
    );

    const proofJson = JSON.parse(await fs.readFile(proofPath, "utf8"));
    const publicInputsJson = JSON.parse(await fs.readFile(publicInputsPath, "utf8"));

    return {
      proof: proofJson.proof,
      publicInputs: publicInputsJson.public_inputs,
      vkHash: proofJson.vk_hash,
      bbVersion: proofJson.bb_version,
      scheme: proofJson.scheme,
      provingTimeMs,
      proofSizeBytes: JSON.stringify(proofJson.proof).length,
    };
  });
}

module.exports = { hashPair, provePayrollCompliance, run };
