# Corruption Comparison Report

Generated at: 2026-08-06T04:07:25.280837+00:00

## Metrics comparison

| Metric | Baseline | Corrupted | Repaired |
| --- | ---: | ---: | ---: |
| `retrieval_hit_rate` | 1.0000 | 0.9167 | 1.0000 |
| `mean_token_f1` | 0.4263 | 0.3480 | 0.4263 |
| `judge_accuracy` | 0.3472 | 0.2778 | 0.3472 |
| `mean_judge_score` | 2.3611 | 2.1111 | 2.3611 |

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
