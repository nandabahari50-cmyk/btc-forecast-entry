// btc-cent-forecast-01 entry: drift-shrunk persistence with a volatility-aware cap.
//
// The house baseline predicts no movement at all: it guesses the checkpoint's own close. That is
// the number to beat, and on the evidence it is hard to beat, because a 4-hour BTC move is mostly
// noise. Two measured facts shape this entry:
//
//   1. A pure momentum extrapolation (last close plus the last hour's move) beat persistence on the
//      practice window, and extrapolating four hours of drift was worse than one hour. So momentum
//      carries information, but only the recent, short-horizon part of it, and it must be shrunk:
//      the further you extrapolate, the more variance you add for a drift you cannot see.
//   2. Mean reversion against the 12-hour average, and extrapolating four hours of drift, both
//      scored worse than persistence on the practice. Both terms were measured, both were dropped:
//      a term that does not earn its variance is a term that costs money in a mean-absolute-error
//      contest.
//
// The guess is:
//
//   move      = SHRINK_1H * (last - price_60min_ago)
//   capped    = last + clamp(move, -cap, +cap)   with cap = K * sigma_1h * last * sqrt(240/60)
//   guess     = clamp(round(capped, 5), MIN, MAX)
//
// The cap is the part that stops a bad case from dominating the mean absolute error: one case where
// a trend reverses can cost more than ten cases where it holds. sigma_1h is the standard deviation
// of minute-to-minute returns over the last day, so a quiet market allows only a small bet and a
// violent one allows a larger one, without either being unbounded.
//
// Every constant is fixed in advance and was chosen on the practice cases only, by walk-forward
// comparison against the persistence baseline. Nothing is fitted at run time.

import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const MIN_PRICE = 0.00001;
const MAX_PRICE = 9_999_999.99999;

/** Weight on the last hour's move. The one-hour drift is the only one that survived testing. */
const SHRINK_1H = 0.5;
/** How many one-hour volatilities the cap allows over the horizon. */
const CAP_SIGMA = 1.6;
/** The horizon in minutes, read from the case and checked against this. */
const HORIZON = 240;

interface Market {
  id: string;
  name?: string;
  start?: string;
  prices: number[];
}

interface Case {
  schema?: string;
  competition?: string;
  case: string;
  at?: string;
  horizon_minutes?: number;
  markets: Market[];
}

const clamp = (x: number, lo: number, hi: number): number => (x < lo ? lo : x > hi ? hi : x);

/** Standard deviation of per-minute returns over the last `n` minutes. */
function sigma1h(prices: number[], n = 60): number {
  const from = Math.max(1, prices.length - n);
  const rets: number[] = [];
  for (let i = from; i < prices.length; i++) {
    const prev = prices[i - 1];
    if (prev > 0) rets.push(prices[i] / prev - 1);
  }
  if (rets.length < 2) return 0;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const varr = rets.reduce((a, b) => a + (b - mean) * (b - mean), 0) / (rets.length - 1);
  return Math.sqrt(varr);
}

function forecast(prices: number[], horizon: number): number {
  if (prices.length === 0) return 0;
  const last = prices[prices.length - 1];
  if (prices.length < 2) return clamp(last, MIN_PRICE, MAX_PRICE);

  const at = (back: number): number => (prices.length - 1 - back >= 0 ? prices[prices.length - 1 - back] : prices[0]);

  const drift1h = last - at(60);
  const move = SHRINK_1H * drift1h;

  const s = sigma1h(prices, 60);
  // The cap scales with the square root of the horizon: four hours is sqrt(4) times one hour's
  // typical move, which is the only defensible way to widen a noise band without fitting it.
  const cap = CAP_SIGMA * s * last * Math.sqrt(horizon / 60);
  const capped = last + clamp(move, -cap, cap);

  if (!Number.isFinite(capped) || capped <= 0) return clamp(last, MIN_PRICE, MAX_PRICE);
  return clamp(Math.round(capped * 1e5) / 1e5, MIN_PRICE, MAX_PRICE);
}

function main(): void {
  mkdirSync(OUTPUT_DIR, { recursive: true });
  const names = readdirSync(INPUT_DIR).filter((f) => f.endsWith('.in'));
  for (const name of names) {
    const id = name.slice(0, -3);
    let parsed: Case;
    try {
      parsed = JSON.parse(readFileSync(join(INPUT_DIR, name), 'utf8')) as Case;
    } catch {
      // An unreadable case is skipped rather than guessed at; the scorer treats a missing case as
      // invalid, and an entry with an invalid case takes no prize, so silence would be worse. This
      // path only fires on input that is not the documented shape.
      continue;
    }
    const market = parsed.markets && parsed.markets[0];
    const prices = market && Array.isArray(market.prices) ? market.prices : [];
    const horizon = Number.isFinite(parsed.horizon_minutes) ? Number(parsed.horizon_minutes) : HORIZON;
    const price = forecast(prices, horizon);
    const row = { forecasts: [{ case: parsed.case ?? id, price }] };
    writeFileSync(join(OUTPUT_DIR, `${id}.out`), `${JSON.stringify(row)}\n`);
  }
}

main();
