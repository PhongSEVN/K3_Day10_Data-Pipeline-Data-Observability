# Data Corruption & Repair Comparison Report

## 1. Metrics Comparison

| Metric / Signal | Baseline | Corrupted | Repaired | Impact of Corruption | Repair Status |
| :--- | ---: | ---: | ---: | :--- | :--- |
| **Retrieval Hit Rate** | 1.0000 | 0.6667 | 1.0000 | Decreased | Recovered |
| **Mean Token F1** | 1.0000 | 0.7072 | 1.0000 | Decreased | Recovered |
| **Judge Accuracy** | 1.0000 | 0.6667 | 1.0000 | Decreased | Recovered |
| **Mean Judge Score** | 5.00 | 3.67 | 5.00 | Decreased | Recovered |
| **Quality Checks** | PASS | FAIL | PASS | Failed quality assertions | Restored to PASS |
| **Freshness Status** | Fresh | Stale | Fresh | Stale rows injected | Restored to Fresh |

## 2. Key Findings & Analysis
1. **Data Corruption Impact:** Corrupting metadata (blank summary, truncated title, noise, dropped rows) directly degrades semantic search vector matches, lowering retrieval hit rate and judge score.
2. **Data Pipeline Remediation:** Repairing the dataset by re-fetching and cleaning raw metadata snapshots from Crossref restores 100% of data quality checks and agent performance.
