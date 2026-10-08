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

// ---------------------------------------------------------------------------
// Tests (`nargo test` in circuits/payroll_compliance). Each rejection test
// starts from the inputs `valid_inputs_are_accepted` proves good and breaks
// exactly one thing, so the failure can only come from that check.
// ---------------------------------------------------------------------------

global RECIPIENT: Field = 42;
global SALT: Field = 777;
global CAP: Field = 1000000;
global PATH: [Field; DEPTH] = [11, 22, 33, 44];
global INDEX: [bool; DEPTH] = [false, true, false, true];
global TWO_POW_128: Field = 0x100000000000000000000000000000000;

// Root of a tree containing `recipient_id` at the position given by PATH/INDEX,
// built independently of main() so a broken main() can't agree with itself.
fn root_for(recipient_id: Field) -> Field {
    let mut current = std::hash::pedersen_hash([LEAF_DOMAIN, recipient_id]);
    for i in 0..DEPTH {
        current = if INDEX[i] {
            std::hash::pedersen_hash([PATH[i], current])
        } else {
            std::hash::pedersen_hash([current, PATH[i]])
        };
    }
    current
}

fn commit(budget_cap: Field, budget_salt: Field) -> Field {
    std::hash::pedersen_hash([budget_cap, budget_salt])
}

// Proves `amount` against a correctly committed `budget_cap`, as `RECIPIENT`.
fn prove_amount(amount: Field, budget_cap: Field, proof_type_id: Field) {
    main(
        root_for(RECIPIENT),
        commit(budget_cap, SALT),
        RECIPIENT,
        amount,
        proof_type_id,
        PATH,
        INDEX,
        budget_cap,
        SALT,
    );
}

#[test]
fn valid_inputs_are_accepted() {
    prove_amount(500000, CAP, 0);
}

#[test]
fn every_known_proof_type_is_accepted() {
    prove_amount(500000, CAP, 0);
    prove_amount(500000, CAP, 1);
    prove_amount(500000, CAP, 2);
}

#[test]
fn amount_equal_to_budget_cap_is_accepted() {
    prove_amount(CAP, CAP, 0);
}

#[test]
fn largest_u128_amount_and_cap_are_accepted() {
    prove_amount(TWO_POW_128 - 1, TWO_POW_128 - 1, 0);
}

// #17: `amount as u128` keeps only the low 128 bits, so 2^128 + 1 would
// compare as 1 and pass `<= CAP` without the assert_max_bit_size guard.
#[test(should_fail)]
fn amount_wrapping_past_u128_is_rejected() {
    prove_amount(TWO_POW_128 + 1, CAP, 0);
}

#[test(should_fail)]
fn amount_of_exactly_2_pow_128_is_rejected() {
    // Truncates to 0, which is <= any cap.
    prove_amount(TWO_POW_128, CAP, 0);
}

#[test(should_fail)]
fn budget_cap_wrapping_past_u128_is_rejected() {
    // A cap of 2^128 + 10 would truncate to 10 and still admit amount 5;
    // a huge cap must be rejected, not silently shrunk.
    prove_amount(5, TWO_POW_128 + 10, 0);
}

#[test(should_fail_with = "amount exceeds budget cap")]
fn amount_over_budget_cap_is_rejected() {
    prove_amount(CAP + 1, CAP, 0);
}

#[test(should_fail_with = "recipient not in allowlist")]
fn non_member_is_rejected() {
    // Same path, but the tree was built for RECIPIENT, not 43.
    main(root_for(RECIPIENT), commit(CAP, SALT), 43, 500000, 0, PATH, INDEX, CAP, SALT);
}

#[test(should_fail_with = "unknown proof_type_id")]
fn unknown_proof_type_is_rejected() {
    prove_amount(500000, CAP, 3);
}

#[test(should_fail_with = "budget commitment mismatch")]
fn wrong_salt_is_rejected() {
    main(root_for(RECIPIENT), commit(CAP, SALT), RECIPIENT, 500000, 0, PATH, INDEX, CAP, SALT + 1);
}

#[test(should_fail_with = "budget commitment mismatch")]
fn wrong_budget_cap_is_rejected() {
    // Claiming a bigger cap than the one committed to.
    main(root_for(RECIPIENT), commit(CAP, SALT), RECIPIENT, 2000000, 0, PATH, INDEX, 2000000, SALT);
}
