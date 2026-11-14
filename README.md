# BTC 4-hour forecast, 12 cases

A program that reads the last three days of BTC/USDC minute closes and writes one number: where the
price will be four hours later. Entered in make.fun's `btc-cent-forecast-01`.

## Run it

```
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

The grader runs it offline, one case at a time, with `/input` and `/output` unset in its container.

## The guess

```
move  = 0.5 * (last - price_60_minutes_ago)
cap   = 1.6 * sigma_1h * last * sqrt(240 / 60)
guess = clamp(last + clamp(move, -cap, cap), 0.00001, 9999999.99999)
```

Two things are being claimed. First, that a four-hour BTC move is mostly noise, so the honest guess
starts at the current price and moves from it only as far as recent momentum justifies. Second, that
the amount of justified movement depends on how violent the last hour was: `sigma_1h` is the
standard deviation of the last 60 minute-to-minute returns, so a quiet market allows a small bet and
a fast one a larger bet, and neither is unbounded.

The `cap` is what keeps one bad case from deciding the score. The metric is the mean absolute error
over twelve cases, so a single case where a trend reverses can cost more than ten cases where it
holds; the cap bounds that.

## What was measured, and what was thrown away

The house baseline predicts no movement. It is a real bar to clear, and on the practice window it
takes some beating. Three alternatives were built and scored on the six practice cases:

| model | MAE |
|---|---|
| persistence (the baseline) | 47,055 cents |
| extrapolate 4 hours of drift | 55,532 cents |
| mean-revert 10% to the 12-hour mean | 47,657 cents |
| EWMA over 24 hours | 55,674 cents |
| **one hour of drift, weight 0.5, volatility cap** | **38,336 cents** |

Extrapolating a longer drift, reverting to the mean, and smoothing all lost to doing nothing. Only the
short-horizon momentum term earned its variance, and even it is shrunk by half, because the practice
window showed momentum continuing less often than it reverses over four hours.

A six-parameter regression on those same six cases fits the practice perfectly and loses in every
walk-forward test — it predicts worse than the baseline on each held-out case. That result is the
reason this entry has one parameter instead of six.

## What this entry does not claim

The final's cases are recorded after the deadline. Nothing here knows them. The practice score is not
a forecast of the final score: five cases is a sample far too small to distinguish 38,000 from 45,000
with any confidence, and a single 4-hour regime change can move the mean by tens of thousands of
cents. The honest statement is that this entry is built to lose less than persistence on average, not
that it will win.

## Licence

MIT.
