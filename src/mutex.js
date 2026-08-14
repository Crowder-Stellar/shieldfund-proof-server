// nargo/bb both operate by reading/writing files (Prover.toml, target/*) inside
// a fixed circuit directory, so concurrent requests can't share one circuit
// dir safely. This serializes access per circuit dir instead of copying the
// whole toolchain workspace around for every request.
function createMutex() {
  let queue = Promise.resolve();
  return function withLock(fn) {
    const result = queue.then(() => fn());
    queue = result.catch(() => {});
    return result;
  };
}

module.exports = { createMutex };
