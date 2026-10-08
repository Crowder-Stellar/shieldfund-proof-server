// Runs at most `max` tasks at once; the rest wait in FIFO order. A finishing
// task hands its slot straight to the next waiter, so a newcomer can never
// slip in between and push the count over `max`.
function createLimiter(max) {
  let active = 0;
  const waiting = [];
  return async function limit(fn) {
    if (active < max) active++;
    else await new Promise((resolve) => waiting.push(resolve));
    try {
      return await fn();
    } finally {
      const next = waiting.shift();
      if (next) next();
      else active--;
    }
  };
}

module.exports = { createLimiter };
