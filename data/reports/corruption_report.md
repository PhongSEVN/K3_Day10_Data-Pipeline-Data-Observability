# Corruption Comparison Report

Generated at: 2026-08-06T03:33:51.522989+00:00

## Metrics comparison

| Metric | Baseline | Corrupted | Repaired |
| --- | ---: | ---: | ---: |
| `retrieval_hit_rate` | 1.0000 | 0.6667 | 1.0000 |
| `mean_token_f1` | 0.8264 | 0.5919 | 0.8264 |
| `judge_accuracy` | 0.7917 | 0.5833 | 0.7917 |
| `mean_judge_score` | 4.0833 | 3.3333 | 4.0833 |

## Data quality comparison

| State | Passed |
| --- | --- |
| Corrupted | False |
| Repaired | True |

## Freshness comparison

| State | is_fresh | stale_rows |
| --- | --- | --- |
| Corrupted | False | 2 |
| Repaired | True | 0 |
