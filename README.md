# BTC 4-hour forecast, 12 cases

Reads the last three days of BTC/USDC minute closes and writes one number: where the price will be
four hours later. Entry for make.fun's `btc-cent-forecast-01`.

## Run it

```
mkdir -p out
MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

The grader runs it offline, one case at a time, with `/input` and `/output` unset in its container.

## The guess

```
anchor = median of the last 6 hours of closes   (360 minutes)
guess  = last + 0.30 * (anchor - last)
```

The claim: a four-hour BTC move is mostly noise, so the honest guess starts at the current price and
moves only toward where the price has recently sat. The median is used, not the mean, so a single
spike inside the window cannot drag the anchor.

## What was measured, and what was thrown away

The house baseline predicts no movement. Extrapolating momentum, which is the obvious thing to try,
loses to it every time on this data:

| model | MAE |
|---|---|
| persistence (the baseline) | 47,055 cents |
| extrapolate 4 hours of drift | 55,532 cents |
| mean-revert to the 24-hour mean | 47,657 cents |
| EWMA over 24 hours | 55,674 cents |
| **shrink to a 6-hour median** | **45,700 cents** |

Return autocorrelation over ~25,900 minute-pairs is -0.03 at one minute and ~0 at four hours: there
is a short bounce, not a trend, so anything that extrapolates a four-hour drift adds variance without
adding information.

## How the two constants were chosen

Both were tested on two different samples, because one test on five checkpoints proves nothing:

- **the five scored checkpoints**: 6-hour window at pull 0.30 beats the baseline by 2.9%
- **non-overlapping four-hour blocks** across all five files (so no window is counted twice): the
  same setting beats it by 2.3%

Settings from 300 to 420 minutes and pull 0.25 to 0.40 all stayed on the winning side of both tests.
That agreement is the only stability evidence available on a sample this small, and it is why the
chosen values sit in the middle of the band rather than at its edge.

A 24-hour anchor was also tested and rejected: it wins on the dense overlapping sample but loses on
the five checkpoints that actually pay, because the practice window is a sustained downtrend and a
long anchor lags it. The shorter anchor follows a trend instead of fighting it.

A six-parameter regression fits the practice perfectly (MAE 0.00) and loses in every walk-forward
test, predicting worse than the baseline on each held-out case. That is why this entry has two
constants instead of six.

## What this entry does not claim

The final's cases are recorded after the deadline; nothing here knows them. Two of the five practice
checkpoints are lost, not won. The margin is 2.9% on five cases, which is well inside the noise of a
sample this size: a single regime change can move the mean by tens of thousands of cents. The honest
statement is that this entry is built to lose less than persistence on average, with the reasoning
and the evidence written down, not that it will win.

## Licence

MIT.
