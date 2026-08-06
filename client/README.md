# Client — Observability Dashboard

Dashboard tĩnh, không cần build tool hay backend. So sánh `retrieval_hit_rate`,
`mean_token_f1`, `judge_accuracy`, `mean_judge_score` và data quality/freshness
giữa baseline, corrupted, repaired.

## Chạy

Từ thư mục gốc project:

```bash
python -m http.server 8000
```

Mở `http://localhost:8000/client/`.

> Mở trực tiếp `index.html` bằng file:// sẽ không fetch được artifact (CORS) —
> dashboard tự fallback sang mock data, nhưng để thấy số liệu thật phải serve qua HTTP.

## Nguồn dữ liệu

Đọc trực tiếp (không cần build lại):

- `data/results/baseline_metrics.json`, `corrupted_metrics.json`, `repaired_metrics.json`
- `data/quality/baseline.json`, `corrupted.json`, `repaired.json`
- `data/quality/freshness_report.json`, `freshness_report_corrupted.json`, `freshness_report_repaired.json`

Nếu file nào chưa tồn tại (pipeline chưa chạy xong), dashboard tự chuyển sang
mock data mẫu và hiện banner cảnh báo — không tự bịa là dữ liệu thật.

## File

- `index.html` — layout
- `styles.css` — theme tokens (light/dark), palette theo `dataviz` skill
- `app.js` — fetch + fallback mock, render SVG bar chart, quality/freshness cards
