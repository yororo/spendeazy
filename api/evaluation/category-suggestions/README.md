# Category suggestion evaluation

`set.json` contains 28 manually labeled, fully synthetic descriptions and
category histories. It spans personal and shared Spaces, credit-card and
e-wallet profiles, sparse history, local-language text, vague merchants, and
descriptions that should have no supported Category. It contains no customer,
bank, or statement data.

The evaluation pins TypeSafe Jev `jev-1.13.0`. To reproduce the offline
threshold search, run from `api/`:

```bash
npm exec -- ts-node evaluation/category-suggestions/evaluate.ts
```

The capture script makes paid external calls only when passed `--capture-live`.
It uses the synthetic descriptions and profiles in `set.json`, writes only
model response distributions and aggregate usage metadata, and never includes
real user data. The checked-in set has 27 recordings; the remaining case did
not return within the 15-second evaluation limit. The evaluator models all 28
cases as the application sees them: captured responses over 2.5 seconds and
the unrecorded case produce no suggestions, matching the application's
2.5-second request timeout.

## Calibration method

The evaluator applies the same pure ranking policy as the application. It
searches 8,045 threshold combinations that can mathematically admit three
results; 11,667 combinations that make three impossible are excluded. A
candidate first has to meet these targets:

- At least 95% top-one accuracy when a result is shown.
- At least 80% suppression of unsupported descriptions.
- At least 80% precision across displayed suggestion items.
- At least 50% coverage of supported descriptions.

Among candidates that meet the targets, the evaluator prefers top-three
accuracy, shown top-one accuracy, lower wrong-item rate, suppression,
item-level precision, and coverage, in that order. The selected application
thresholds are:

| Outcome                    | Minimum probability | Minimum margin over `none_of_the_above` |
| -------------------------- | ------------------: | --------------------------------------: |
| First suggestion           |                0.50 |                                    0.10 |
| Each additional suggestion |                0.25 |                                    0.20 |

The service returns the first eligible result and then up to two additional
eligible Categories in descending probability order. It returns no results if
the model selects `none_of_the_above`, or the first result fails its threshold.

## Recorded results and application outcomes

The set has 28 labeled cases (22 supported and 6 unsupported), with 27 model
recordings. Four captured responses exceeded the application's timeout; the
unrecorded case also produces an empty application result. The output metrics
below include all 28 cases and count those five outcomes as no suggestions.

| Measure                                              |                                   Result |
| ---------------------------------------------------- | ---------------------------------------: |
| Top-one accuracy (all supported cases)               |                           77.27% (17/22) |
| Top-one accuracy when shown                          |                             100% (17/17) |
| Top-three accuracy (all supported cases)             |                           77.27% (17/22) |
| Supported-case suggestion coverage                   |                           77.27% (17/22) |
| Unsupported-case suppression                         |                              83.3% (5/6) |
| Wrong displayed item rate                            |                             5.56% (1/18) |
| Displayed item precision                             |                           94.44% (17/18) |
| Result counts                                        |                 0: 10, 1: 18, 2: 0, 3: 0 |
| Application latency, mean / median / p95             |                 985.4 / 486.2 / 2,500 ms |
| Captured model response latency, mean / median / p95 | 1,944.7 / 486.2 / 12,684.2 ms (27 calls) |
| Input / output tokens                                |                           24,677 / 2,503 |
| Estimated cost                                       |                          $0.00103643 USD |

The sample meets all four calibration targets, but is small and synthetic.
Five supported cases produce no result because four model calls exceeded the
product timeout and one case had no model recording at the 15-second capture
limit. One unsupported, sparse-history prompt still received a confident 0.99
probability for Groceries, so the thresholds do not eliminate confident model
errors. Only one of the six unsupported cases remains unsuppressed. Treat
these numbers as an initial calibration, not as a population-level quality
claim. Refresh the labeled set before materially changing thresholds or the
pinned model.

The model's probabilities are used only for ranking and suppression. They are
not persisted as user feedback, and a displayed result never changes a
transaction until the user selects and saves a Category.
