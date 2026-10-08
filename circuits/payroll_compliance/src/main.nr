// ShieldFund payroll/budget compliance circuit.
//
// Proves, without revealing the full allowlist or the exact budget cap:
//   1. `recipient_id` is a member of an admin-published allowlist
//      (membership via Merkle inclusion against `merkle_root`).
//   2. `amount` does not exceed a budget cap that was committed to
//      in advance via `budget_commitment = pedersen_hash([budget_cap, budget_salt])`.
//   3. `proof_type_id` is one of the three ShieldFund proof categories
//      (0 = payroll, 1 = operational, 2 = relief).
//
// `recipient_id` and `amount` are public here even though they're private
// witnesses to the *set membership*/*budget* facts, because both already
// appear as plaintext arguments to treasury_vault::disburse() on-chain —
// there's no privacy to preserve by hiding them in the proof too. What stays
// private is the rest of the allowlist (other employees/recipients) and the
// exact budget figure.

global DEPTH: u32 = 4; // supports up to 2^DEPTH = 16 allowlisted recipients

// Leaves are pedersen_hash([LEAF_DOMAIN, recipient_id]); internal nodes are
// pedersen_hash([left, right]). The tag keeps a leaf from ever equalling an
// internal node, since a node's left input is a hash output, never 1.
// Must match LEAF_DOMAIN in src/merkle.js.
global LEAF_DOMAIN: Field = 1;

fn main(
    merkle_root: pub Field,
    budget_commitment: pub Field,
    recipient_id: pub Field,
    amount: pub Field,
    proof_type_id: pub Field,
    merkle_path: [Field; DEPTH],
    merkle_index: [bool; DEPTH],
    budget_cap: Field,
    budget_salt: Field,
) {
    // 0 is reserved: padding leaves in a non-full allowlist are
    // pedersen_hash([LEAF_DOMAIN, 0]), so recipient 0 would prove membership in any of them.
    assert(recipient_id != 0, "recipient_id must be non-zero");

    // 1. Merkle inclusion: recompute the root from the private leaf + path
    // and assert it matches the publicly committed allowlist root.
    let leaf = std::hash::pedersen_hash([LEAF_DOMAIN, recipient_id]);
    let mut current = leaf;
    for i in 0..DEPTH {
        let sibling = merkle_path[i];
        let (l, r) = if merkle_index[i] { (sibling, current) } else { (current, sibling) };
        current = std::hash::pedersen_hash([l, r]);
    }
    assert(current == merkle_root, "recipient not in allowlist");

    // 2. Budget commitment: prove knowledge of the (budget_cap, budget_salt)
    // preimage the admin committed to, without revealing budget_cap itself.
    let computed_commitment = std::hash::pedersen_hash([budget_cap, budget_salt]);
    assert(computed_commitment == budget_commitment, "budget commitment mismatch");

    // 3. Range check: amount must not exceed the (hidden) budget cap.
    // `as u128` keeps only the low 128 bits, so constrain both values to fit
    // first; otherwise e.g. amount = 2^128 + 1 would compare as 1.
    amount.assert_max_bit_size::<128>();
    budget_cap.assert_max_bit_size::<128>();
    let amount_u: u128 = amount as u128;
    let budget_u: u128 = budget_cap as u128;
    assert(amount_u <= budget_u, "amount exceeds budget cap");

    // 4. proof_type_id must be a known ShieldFund category.
    assert(
        (proof_type_id == 0) | (proof_type_id == 1) | (proof_type_id == 2),
        "unknown proof_type_id",
    );
}
