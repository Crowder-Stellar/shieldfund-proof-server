const { execFile } = require("child_process");
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const { Noir } = require("@noir-lang/noir_js");
const { NARGO_BIN, BB_BIN, PAYROLL_DIR, SUBPROCESS_TIMEOUT_MS, MAX_CONCURRENT_PROOFS } = require("./config");
const { createLimiter } = require("./limiter");
const { toFieldHex, proofByteLength } = require("./hash");

const ARTIFACT_PATH = path.join(PAYROLL_DIR, "target", "payroll_compliance.json");

// Each proof runs in its own temp dir, so requests no longer share files and
// only the CPU budget limits how many run at once.
const proofSlot = createLimiter(MAX_CONCURRENT_PROOFS);

function run(bin, args, cwd, timeout = SUBPROCESS_TIMEOUT_MS) {
  return new Promise((resolve, reject) => {
    const options = { cwd, maxBuffer: 1024 * 1024 * 64, timeout, killSignal: "SIGKILL" };
    execFile(bin, args, options, (err, stdout, stderr) => {
      if (err) {
        const message = err.killed ? `${path.basename(bin)} ${args[0]} timed out after ${timeout}ms` : stderr || stdout || err.message;
        // Raw toolchain output (paths, compiler dumps) stays in the server
        // logs; callers only ever see a generic 500.
        const wrapped = new Error(message);
        wrapped.assertion = null;
        wrapped.stdout = stdout;
        wrapped.stderr = stderr;
        reject(wrapped);
        return;
      }
      resolve({ stdout, stderr });
    });
  });
}

// Compiles payroll_compliance once per process (nargo skips the work if the
// artifact is already current) — the only write into circuits/, and only
// into the gitignored target/ dir. Retried on the next proof if it fails.
let circuit;
function loadCircuit() {
  circuit ??= (async () => {
    await run(NARGO_BIN, ["compile"], PAYROLL_DIR);
    const artifact = JSON.parse(await fs.readFile(ARTIFACT_PATH, "utf8"));
    return { noir: new Noir(artifact) };
  })().catch((err) => {
    circuit = undefined;
    throw err;
  });
  return circuit;
}

// noir_js reports a failed Noir assert() as "Circuit execution failed: <msg>".
function extractAssertionMessage(message) {
  const match = /Circuit execution failed:\s*'?([^'\n]+)'?/.exec(message || "");
  return match ? match[1].trim() : null;
}

function toCircuitInputs(inputs) {
  const { merkleRoot, budgetCommitment, recipientId, amount, proofTypeId, merklePath, merkleIndex, budgetCap, budgetSalt } = inputs;
  return {
    merkle_root: merkleRoot,
    budget_commitment: budgetCommitment,
    recipient_id: toFieldHex(recipientId),
    amount: toFieldHex(amount),
    proof_type_id: toFieldHex(proofTypeId),
    merkle_path: merklePath,
    merkle_index: merkleIndex.map(Boolean),
    budget_cap: toFieldHex(budgetCap),
    budget_salt: toFieldHex(budgetSalt),
  };
}

// Executes the circuit in-process (fails with the Noir assert() message if
// inputs are invalid — no allowlist membership, over budget, bad
// proof_type_id), then generates an UltraHonk proof with `bb prove` and
// locally verifies it with `bb verify` before returning. Mirrors the "proof
// server generates and locally verifies" design described in
// shieldfund-contracts' proof_registry.
async function provePayrollCompliance(inputs) {
  const { noir } = await loadCircuit();
  return proofSlot(async () => {
    let witness;
    try {
      ({ witness } = await noir.execute(toCircuitInputs(inputs)));
    } catch (err) {
      err.assertion = extractAssertionMessage(err.message);
      throw err;
    }

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "shieldfund-proof-"));
    try {
      await fs.writeFile(path.join(workDir, "witness.gz"), witness);

      const started = Date.now();
      await run(
        BB_BIN,
        ["prove", "-b", ARTIFACT_PATH, "-w", "witness.gz", "-o", ".", "--output_format", "json", "--write_vk"],
        workDir,
      );
      const provingTimeMs = Date.now() - started;

      // Explicit local verification step — this is the "locally verified"
      // guarantee the proof-server is trusted for before it ever anchors a
      // hash on-chain via proof_registry::register_proof().
      await run(BB_BIN, ["verify", "-p", "proof.json", "-i", "public_inputs.json", "-k", "vk.json"], workDir);

      const proofJson = JSON.parse(await fs.readFile(path.join(workDir, "proof.json"), "utf8"));
      const publicInputsJson = JSON.parse(await fs.readFile(path.join(workDir, "public_inputs.json"), "utf8"));

      return {
        proof: proofJson.proof,
        publicInputs: publicInputsJson.public_inputs,
        vkHash: proofJson.vk_hash,
        bbVersion: proofJson.bb_version,
        scheme: proofJson.scheme,
        provingTimeMs,
        proofSizeBytes: proofByteLength(proofJson.proof),
      };
    } finally {
      await fs.rm(workDir, { recursive: true, force: true });
    }
  });
}

module.exports = { provePayrollCompliance, run, ARTIFACT_PATH };
