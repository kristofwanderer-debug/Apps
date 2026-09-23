// Small self-contained stats helpers - no external dependency needed for a
// binomial upper-tail test on a modest number of practice sessions.

function logGamma(x) {
  // Lanczos approximation
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
  ];
  if (x < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * x)) - logGamma(1 - x);
  }
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}

function logChoose(n, k) {
  if (k < 0 || k > n) return -Infinity;
  return logGamma(n + 1) - logGamma(k + 1) - logGamma(n - k + 1);
}

// P(X >= k) for X ~ Binomial(n, p)
export function binomialUpperTailPValue(n, k, p) {
  if (n <= 0) return 1;
  if (p <= 0) return k <= 0 ? 1 : 0;
  if (p >= 1) return k <= n ? 1 : 0;
  let sum = 0;
  for (let i = Math.max(0, k); i <= n; i++) {
    const logTerm = logChoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p);
    sum += Math.exp(logTerm);
  }
  return Math.min(1, Math.max(0, sum));
}

export function rollingAverage(values, window) {
  const out = [];
  for (let i = 0; i < values.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = values.slice(start, i + 1);
    out.push(slice.reduce((a, b) => a + b, 0) / slice.length);
  }
  return out;
}
