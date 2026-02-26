// Minimal ULID (Crockford base32) generator.
// We use a monotonic variant so IDs remain sortable even within the same millisecond.

const ENCODING = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const TIME_LEN = 10;
const RAND_LEN = 16;

function encodeTime(timeMs: number): string {
  if (!Number.isFinite(timeMs) || timeMs < 0) {
    throw new Error('invalid ULID time');
  }

  let time = Math.floor(timeMs);
  let out = '';
  for (let i = 0; i < TIME_LEN; i += 1) {
    const mod = time % 32;
    out = ENCODING[mod] + out;
    time = Math.floor(time / 32);
  }
  return out;
}

function random32Values(len: number): number[] {
  const buf = new Uint8Array(len);
  crypto.getRandomValues(buf);
  return Array.from(buf, (b) => b & 31);
}

function encodeRandom(values: number[]): string {
  if (values.length !== RAND_LEN) {
    throw new Error('invalid ULID random length');
  }
  let out = '';
  for (const v of values) {
    out += ENCODING[v] ?? ENCODING[0];
  }
  return out;
}

let lastTime = -1;
let lastRandom: number[] | null = null;

function incrementBase32(values: number[]): number[] {
  const next = [...values];
  for (let i = next.length - 1; i >= 0; i -= 1) {
    const v = next[i] ?? 0;
    if (v < 31) {
      next[i] = v + 1;
      return next;
    }
    next[i] = 0;
  }
  // Overflow (extremely unlikely). Caller should advance time.
  return next;
}

export function ulid(nowMs: number = Date.now()): string {
  let time = Math.floor(nowMs);

  if (time !== lastTime) {
    lastTime = time;
    lastRandom = random32Values(RAND_LEN);
    return encodeTime(time) + encodeRandom(lastRandom);
  }

  // Same millisecond: increment randomness to preserve ordering.
  if (!lastRandom) {
    lastRandom = random32Values(RAND_LEN);
  } else {
    const inc = incrementBase32(lastRandom);
    // If we overflowed back to all zeros, bump time by 1ms.
    if (inc.every((v) => v === 0)) {
      time += 1;
      lastTime = time;
      lastRandom = random32Values(RAND_LEN);
      return encodeTime(time) + encodeRandom(lastRandom);
    }
    lastRandom = inc;
  }

  return encodeTime(time) + encodeRandom(lastRandom);
}
