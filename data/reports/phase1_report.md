# Phase 1 Baseline Report

Generated at: 2026-08-06T03:39:13.576134+00:00

## Source summary

- **source_api**: Crossref REST API
- **query**: agentic retrieval augmented generation large language model
- **filter**: from-pub-date:2026-02-07,has-abstract:true
- **record_count**: 24
- **clean_row_count**: 24

## Evaluation metrics

| Metric | Value |
| --- | ---: |
| `retrieval_hit_rate` | 1.0000 |
| `mean_token_f1` | 0.4263 |
| `judge_accuracy` | 0.3472 |
| `mean_judge_score` | 2.3611 |
| samples | 72 |

## Data quality

Overall: **PASS**

| Check | Dimension | Status | Detail |
| --- | --- | --- | --- |
| row_count | completeness | PASS | {'row_count': 24} |
| paper_id_not_null_unique | uniqueness | PASS | {'missing': 0, 'duplicates': 0} |
| title_not_null | completeness | PASS | {'missing': 0} |
| summary_length | validity | PASS | {'below_min_chars': 0, 'min_chars': 20} |
| freshness | freshness | PASS | {'stale_rows': 0, 'threshold_days': 180} |

## Freshness

- **latest_published**: 2026-08-01
- **oldest_published**: 2026-02-12
- **stale_rows**: 0
- **total_rows**: 24
- **is_fresh**: True
- **freshness_threshold_days**: 180
