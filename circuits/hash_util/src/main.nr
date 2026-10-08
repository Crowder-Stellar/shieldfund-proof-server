// Two-input Pedersen hash, exposed as its own circuit purely so the JS side
// (proof-server) can execute it with noir_js to build the allowlist Merkle
// tree off-chain using the exact same hash the payroll_compliance circuit
// uses internally. Never proven — only executed for its return value.
// Serves both leaves (called as (LEAF_DOMAIN, recipient_id)) and internal
// nodes (called as (left, right)); see src/merkle.js.
fn main(a: pub Field, b: pub Field) -> pub Field {
    std::hash::pedersen_hash([a, b])
}
