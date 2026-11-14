// btc-cent-forecast-01 entry: shrink toward a robust 6-hour anchor.
//
// The task is to name BTC's price four hours ahead. The metric is the mean absolute error over
// twelve cases, and the house baseline predicts no movement: it guesses the checkpoint's own close.
//
// The naive way to beat that baseline is to extrapolate momentum, and on this data it does not work.
// What was measured, on ~20,000 four-hour windows cut from the practice recording:
//
//   * Return autocorrelation over ~25,900 minute-pairs: -0.032 at one minute, -0.046 at five,
//     -0.003 at fifteen, +0.031 at sixty, -0.014 at four hours. There is no exploitable drift at the
//     four-hour horizon; the only real signal is a one-to-five minute bounce, far too short to reach
//     a four-hour target.
//   * Every momentum extrapolation lost to doing nothing: drift over 5 minutes at weight 0.5 lost
//     0.6%, over 15 minutes 1.5%, over 60 minutes 3.2%, over 240 minutes 6.8%.
//
// So the information is not "where is it going" but "where is it relative to where it recently sat".
// The guess is:
//
//   anchor = median of the last 6 hours of closes   (360 minutes, robust to spikes)
//   guess  = last + PULL * (anchor - last)
//
// Two things were tuned, and both were checked twice, because a single test lies on a sample this
// small:
//
//   1. On the five scored practice checkpoints: window 360 and pull 0.30 beat persistence by 2.9%.
//   2. On non-overlapping four-hour blocks across all five files (so no window is counted twice):
//      the same setting beat persistence by 2.3%.
//
// Nearby settings (300 to 420 minutes, pull 0.25 to 0.40) all stayed on the winning side of both
// tests, which is the only evidence of stability available here. A 24-hour anchor was also tested: it
// wins on the dense overlapping sample, but it loses on the five checkpoints that actually pay,
// because the practice window is a sustained downtrend and a long anchor lags it. The shorter anchor
// follows a trend instead of fighting it.
//
// The median, not the mean: one 150-dollar spike inside the window must not move the anchor.
// Both constants are fixed. Nothing is fitted at run time.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MIN_PRICE = 0.00001;
const MAX_PRICE = 9_999_999.99999;

/** The anchor's window: six hours of minute closes. */
const ANCHOR_MINUTES = 360;
/** How far toward the anchor the guess moves. */
const PULL = 0.3;

interface Market {
  id: string;
  name?: string;
  start?: string;
  prices: number[];
}

interface CaseFile {
  schema?: string;
  competition?: string;
  case: string;
  at?: string;
  horizon_minutes?: number;
  markets: Market[];
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** The median of one window of the series. */
function medianOf(arr: number[], from: number, to: number): number {
  const w = arr.slice(from, to).sort((a: number, b: number) => a - b);
  const n = w.length;
  if (n === 0) return 0;
  return n % 2 === 1 ? w[(n - 1) / 2]! : (w[n / 2 - 1]! + w[n / 2]!) / 2;
}

function forecast(prices: number[]): number {
  if (prices.length === 0) return 0;
  const last = prices[prices.length - 1]!;
  if (prices.length < 3) return clamp(Math.round(last * 1e5) / 1e5, MIN_PRICE, MAX_PRICE);

  const from = Math.max(0, prices.length - ANCHOR_MINUTES);
  const anchor = medianOf(prices, from, prices.length);

  const guess = last + PULL * (anchor - last);
  if (!Number.isFinite(guess) || guess <= 0) return clamp(last, MIN_PRICE, MAX_PRICE);
  return clamp(Math.round(guess * 1e5) / 1e5, MIN_PRICE, MAX_PRICE);
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const name of readdirSync(INPUT_DIR)) {
    if (!name.endsWith('.in')) continue;
    const id = name.slice(0, -3);
    let parsed: CaseFile;
    try {
      parsed = JSON.parse(readFileSync(join(INPUT_DIR, name), 'utf8')) as CaseFile;
    } catch {
      // An unreadable case is skipped rather than guessed at: the scorer treats a missing case as
      // invalid, and this path only fires on input that is not the documented shape.
      continue;
    }
    const prices = parsed.markets?.[0]?.prices;
    if (!Array.isArray(prices)) continue;
    const price = forecast(prices);
    writeFileSync(
      join(OUTPUT_DIR, `${id}.out`),
      `${JSON.stringify({ forecasts: [{ case: parsed.case ?? id, price }] })}\n`,
    );
  }
}

main();
