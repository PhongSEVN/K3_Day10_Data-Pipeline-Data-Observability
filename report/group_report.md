# Group Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin bài nộp

| Thông tin         | Nội dung                                                                                                              |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| Khóa/Lớp         | K3                                                                                                                     |
| Tên nhóm         | A3                                                                                                                     |
| Repository         | [github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability](https://github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability) |
| Ngày hoàn thành | 2026-08-06                                                                                                             |

### Thành viên và phân công

| STT | Họ và tên        | MSSV        | Vai trò chính                       | Module/deliverable sở hữu                                                                                |
| --: | ------------------- | ----------- | ------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
|   1 | Phạm Khánh Linh   | 2A202601507 | Source owner                          | `src/ingestion/crossref.py` — raw response/records trong `data/raw/`                                  |
|   2 | Nguyễn Thanh Phúc | 2A202601345 | Cleaning & test-set owner             | `src/ingestion/cleaning.py`, `src/evaluation/testset.py` — `data/clean/`, `data/eval/`            |
|   3 | Lê Thị Yến Nhi   | 2A202601031 | Observability owner                   | `src/observability/quality.py`, `src/observability/reporting.py` — `data/quality/`                  |
|   4 | Vũ Huy Hoàng      | 2A202601057 | Corruption & repair owner             | `src/ingestion/corruption.py` — corruption log, corrupted/repaired data                                 |
|   5 | Nguyễn Văn Phong  | 2A202601241 | Pipeline integration & evidence owner | `src/pipelines/phase1.py`, `src/pipelines/corruption_flow.py` — full flow, metrics, comparison report |

## 2. Tóm tắt kết quả

Nhóm đã hoàn thành toàn bộ pipeline end-to-end trên cả hai pha: baseline (`run_phase1.py`) và corruption flow (`run_corruption_flow.py`). Baseline pipeline tạo đủ artifact bắt buộc — raw response/records từ Crossref (24 record thật), cleaned dataset, embedding index trong ChromaDB, evaluation set 72 câu hỏi, baseline metrics, data quality/freshness report và báo cáo markdown. Trong 6 loại corruption mô phỏng (drop record, blank summary, inject noise, truncate title, stale date, duplicate rows), nhóm ghi nhận `stale_published_date` và `add_duplicate_rows` ảnh hưởng rõ nhất tới data quality (freshness check FAIL với 2 record vượt ngưỡng 180 ngày, uniqueness check FAIL với 2 duplicate), trong khi tổ hợp toàn bộ 6 lỗi làm `retrieval_hit_rate` giảm từ 1.0 xuống 0.9167 và `mean_token_f1` giảm từ 0.4263 xuống 0.348. Repair — build lại từ `crossref_records.json` gốc thay vì vá dữ liệu đã hỏng — phục hồi toàn bộ metric về đúng giá trị baseline (`retrieval_hit_rate` quay lại 1.0, quality checks PASS cả 5/5, freshness fresh trở lại). Blocker lớn nhất nhóm gặp phải và đã xử lý: sau khi merge PR của các thành viên, `data/eval/test_set.json` cũ (build từ dữ liệu giả trong lúc code độc lập) bị merge lẫn vào và không khớp với `data/clean/papers_clean.json` mới (DOI thật từ Crossref), khiến `retrieval_hit_rate` và `judge_accuracy` ra 0 dù pipeline chạy không lỗi — đã xác định nguyên nhân và xóa để build lại test set khớp dữ liệu thật. Giới hạn còn lại: chưa bật Ragas (`RUN_RAGAS` không set), và `judge_accuracy`/`mean_judge_score` ở mức trung bình do LLM judge chấm khắt khe với answer rule-based hiện tại.

## 3. Kiến trúc và luồng dữ liệu

### Luồng end-to-end

```text
Crossref API
    -> raw response/raw records
    -> cleaning và data modeling
    -> embedding + ChromaDB index
    -> evaluation baseline
    -> quality/freshness reports
    -> corruption
    -> re-index và re-evaluate
    -> repair từ dữ liệu nguồn
    -> comparison report
```

Đây là kiến trúc **ETL** (Extract → Transform → Load): transform (cleaning, chuẩn hóa, tạo `text_for_embedding`) chạy hoàn toàn trước khi load vào ChromaDB. `data/raw/` chỉ là landing zone để truy vết nguồn gốc, không phải nơi transform diễn ra.

### Trách nhiệm của từng khối

| Khối             | Input                               | Xử lý chính                                                                                                              | Output/artifact                                                          | Owner               |
| ----------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------- |
| Ingestion         | Crossref API (`CROSSREF_API_URL`) | Fetch với retry/backoff cho status 429/503, parse response thành record schema                                             | `data/raw/` (raw response + raw records)                               | Phạm Khánh Linh   |
| Cleaning          | `data/raw/`                       | Remove record thiếu `paper_id`/`title`/`summary`, chuẩn hóa whitespace, dedupe theo `paper_id`, tạo `text_for_embedding`, tính `age_days` | `data/clean/`                                                          | Nguyễn Thanh Phúc |
| Embedding/index   | `data/clean/`                     | `sentence-transformers/all-MiniLM-L6-v2` + ChromaDB collection (cosine similarity)                                        | `data/embeddings/`                                                     | Nguyễn Văn Phong  |
| Evaluation        | `data/clean/`                     | Tạo test set 72 câu hỏi (`summary`/`authors`/`date`) và tính metrics                                               | `data/eval/`, `data/results/baseline_metrics.json`                   | Nguyễn Thanh Phúc |
| Observability     | `data/clean/`, `data/results/`  | 5 data quality check + freshness monitoring                                                                                 | `data/quality/`                                                        | Lê Thị Yến Nhi   |
| Corruption/repair | `data/clean/` (baseline)          | Drop record, blank summary, inject noise, truncate title, stale date, duplicate rows; repair lại từ raw                  | `data/results/corruption_log.json`, corrupted/repaired dataset         | Vũ Huy Hoàng      |
| Orchestration     | Tất cả module trên               | Ghép `phase1.py` + `corruption_flow.py`, chạy end-to-end, so sánh baseline/corrupted/repaired                          | `data/reports/phase1_report.md`, `data/reports/corruption_report.md` | Nguyễn Văn Phong  |

## 4. Cách tái hiện kết quả

### Cấu hình không chứa secret

| Biến/cấu hình             | Giá trị sử dụng |
| ---------------------------- | ------------------- |
| `LLM_PROVIDER`             | openai             |
| `LLM_MODEL`                 | gpt-4o-mini         |
| Embedding model              | sentence-transformers/all-MiniLM-L6-v2 |
| Số lượng Crossref records | 24 (max_results=24) |
| Retrieval `top_k`           | 4                   |
| Freshness threshold          | 180 ngày           |
| Random seed, nếu có        | Không set (Crossref là nguồn sống, số liệu có thể đổi theo thời điểm chạy) |

Không dán nội dung API key hoặc file `.env` vào báo cáo.

### Lệnh cài đặt

```bash
uv sync
```

Hoặc:

```bash
python -m pip install -e .
```

### Lệnh chạy

Baseline:

```bash
python script/run_phase1.py
```

Corruption flow:

```bash
python script/run_corruption_flow.py
```

### Kết quả tái hiện

| Lệnh             | Trạng thái | Thời điểm chạy gần nhất | Bằng chứng                         |
| ----------------- | ----------- | ----------------------------- | ------------------------------------ |
| Baseline pipeline | Thành công | 2026-08-06 04:05 UTC          | `data/results/baseline_metrics.json`, `data/reports/phase1_report.md` |
| Corruption flow   | Thành công | 2026-08-06 04:07 UTC          | `data/results/corruption_log.json`, `data/reports/corruption_report.md` |

## 5. Ingestion, cleaning và data contract

### Nguồn dữ liệu

| Thuộc tính                | Giá trị                             |
| --------------------------- | ------------------------------------- |
| Source                      | Crossref REST API (`https://api.crossref.org/works`) |
| Query/filter                | `query.bibliographic="agentic retrieval augmented generation large language model"`, `filter=from-pub-date:<180 ngày trước>,has-abstract:true` |
| Thời điểm lấy dữ liệu | 2026-08-06 |
| Số record nhận được    | 24 |
| Cơ chế retry/backoff      | Retry theo exponential backoff (`BACKOFF_BASE_SECONDS=2.0`, tối đa 5 lần) cho status 429/503 |

### Raw và clean schema

| Trường        | Kiểu dữ liệu | Bắt buộc?  | Ý nghĩa   | Xử lý khi thiếu/sai |
| --------------- | --------------- | ------------ | ----------- | ---------------------- |
| `paper_id`    | str (DOI)       | Có         | Khóa chính, dùng xuyên suốt pipeline | Reject record |
| `title`       | str             | Có         | Tiêu đề bài báo | Reject record |
| `summary`     | str             | Có         | Abstract, nguồn chính cho `text_for_embedding` | Reject record |
| `authors`, `categories` | list[str] | Không    | Metadata phụ | Giữ record, để rỗng `[]` |
| `published`, `updated` | str (ISO date) | Không | Tính `age_days`, freshness | Giữ record, `age_days=None` nếu parse lỗi |
| `abs_url`, `pdf_url`, `comment` | str | Không | Metadata phụ | Giữ record, để rỗng `""` |

### Quy tắc cleaning

| Quy tắc                                 | Quality dimension liên quan | Số record bị tác động | Cách xác minh      |
| ---------------------------------------- | ---------------------------- | -------------------------: | -------------------- |
| Loại record thiếu `paper_id`/`title`/`summary` | Completeness  |              0 (24 raw → 24 clean, không rớt record nào lần chạy này) | `data/clean/papers_clean.json` |
| Dedupe theo `paper_id` (giữ bản đầu tiên) | Uniqueness                  |              0 (không có duplicate trong raw) | `data/quality/baseline.json` — `paper_id_not_null_unique: pass` |

Cách tạo `text_for_embedding`, document ID và `age_days`: `paper_id` dùng trực tiếp DOI từ Crossref làm document ID, ổn định qua các lần chạy. `text_for_embedding` ghép `Title + Summary + Authors + Categories` thành một đoạn text duy nhất trước khi đưa vào MiniLM encode. `age_days` tính bằng số ngày từ `published` đến ngày chạy pipeline (`run_date`), dùng cho freshness check với ngưỡng 180 ngày.

## 6. Evaluation setup

| Thành phần                             | Cấu hình thực tế          |
| ---------------------------------------- | ----------------------------- |
| Số câu hỏi                            | 72 (24 paper × 3 loại: `summary`, `authors`, `date`) |
| Các `question_type`                    | `summary` (24), `authors` (24), `date` (24) |
| Ground-truth document ID                 | `ground_truth_doc_ids = [paper_id]` gán trực tiếp từ record nguồn của câu hỏi |
| Embedding model                          | sentence-transformers/all-MiniLM-L6-v2 |
| Vector store/collection                  | ChromaDB, collection `papers-baseline`/`papers-corrupted`/`papers-repaired`, cosine similarity |
| Retrieval `top_k`                       | 4 |
| LLM provider/model                       | openai / gpt-4o-mini |
| Test set dùng chung cho ba trạng thái | `data/eval/test_set.json` (72 câu, dùng lại nguyên vẹn cho cả 3 lần evaluate) |

Test set được giữ nguyên khi đánh giá baseline, corrupted và repaired vì đây là biến kiểm soát (control variable) của thí nghiệm — nếu đổi câu hỏi giữa các lần đo thì chênh lệch metric có thể đến từ việc câu hỏi khác nhau, không phải từ chất lượng dữ liệu thay đổi, khiến so sánh mất ý nghĩa.

## 7. Kết quả baseline

### Artifact checklist

| Artifact                 | Đường dẫn thực tế                | Trạng thái | Ghi chú   |
| ------------------------ | -------------------------------------- | ------------ | ---------- |
| Raw response/records     | `data/raw/`                          | Có | `crossref_response.json` + `crossref_records.json`, 24 record |
| Cleaned dataset          | `data/clean/`                        | Có | `papers_clean.csv` + `.json`, 24 dòng |
| Embedding manifest/index | `data/embeddings/`                   | Có | `papers_embeddings.json`, collection `papers-baseline` |
| Evaluation set           | `data/eval/`                         | Có | `test_set.json`, 72 câu |
| Baseline metrics         | `data/results/baseline_metrics.json` | Có | Xem bảng bên dưới |
| Quality/freshness        | `data/quality/`                      | Có | `baseline.json` PASS 5/5, `freshness_report.json` fresh |
| Baseline report          | `data/reports/phase1_report.md`      | Có | Markdown tổng hợp |

### Baseline metrics

| Metric                 |       Giá trị | Diễn giải                             |
| ---------------------- | --------------: | --------------------------------------- |
| `retrieval_hit_rate` |           1.0000 | 100% câu hỏi (72/72) tìm đúng document ground truth trong top-4 |
| `mean_token_f1`      |           0.4263 | Overlap từ vựng giữa answer rule-based và ground truth — thấp vì answer chỉ trích 1 field (vd. `authors_joined`) so với ground truth đầy đủ câu |
| `judge_accuracy`     |           0.3472 | 34.72% câu (25/72) được LLM judge chấm là "materially correct" |
| `mean_judge_score`   |           2.3611 | Điểm trung bình LLM judge (thang 1-5) |
| Ragas                 | N/A | Không chạy — `RUN_RAGAS` chưa được set trong `.env` |

## 8. Data quality và freshness

### Quality checks

| Check        | Quality dimension | Ngưỡng/kỳ vọng | Kết quả baseline      | Bằng chứng |
| ------------ | ----------------- | ------------------ | ----------------------- | ------------ |
| `row_count` | Completeness | `row_count > 0` | PASS — 24 record | `data/quality/baseline.json` |
| `paper_id_not_null_unique` | Uniqueness | Không null, không trùng | PASS — 0 missing, 0 duplicate | `data/quality/baseline.json` |
| `title_not_null` | Completeness | Title không rỗng | PASS — 0 missing | `data/quality/baseline.json` |
| `summary_length` | Validity | `len(summary) >= 20` ký tự | PASS — 0 dưới ngưỡng | `data/quality/baseline.json` |
| `freshness` | Freshness | `age_days <= 180` | PASS — 0 stale row | `data/quality/baseline.json` |

### Freshness

| Thuộc tính               | Giá trị                           |
| -------------------------- | ----------------------------------- |
| Freshness được đo tại | `data/clean/papers_clean.json` (baseline) |
| Timestamp mới nhất       | `latest_published = 2026-08-01` |
| Ngưỡng freshness         | 180 ngày (`oldest_published = 2026-02-12`, trong ngưỡng) |
| Trạng thái baseline      | Fresh (`is_fresh: true`, `stale_rows: 0`) |
| Lý do                     | Toàn bộ 24 record có `age_days <= 180` do filter `from-pub-date` khi fetch đã giới hạn sẵn |

## 9. Corruption scenarios và repair

| Corruption         | Cách tạo | Record bị tác động | Quality signal kỳ vọng | Tác động thực tế | Cách repair   |
| ------------------ | ---------- | ---------------------: | ------------------------ | --------------------- | -------------- |
| Drop latest records | Xóa 2 record đầu batch | 2 | Completeness giảm gián tiếp (record biến mất khỏi index) | Không tự thấy trong quality check (row_count vẫn > 0 vì có bù duplicate), nhưng câu hỏi ground-truth trỏ vào 2 record này sẽ miss hoàn toàn | Rebuild từ raw, record xuất hiện lại |
| Blank summary | Set `summary=""` trên 2 dòng | 2 | `summary_length` FAIL | Góp phần vào `below_min_chars: 4` (cùng nhóm với inject_noise) trong `quality/corrupted.json` | Rebuild lấy lại summary gốc |
| Inject noise | Chèn chuỗi `[CORRUPTED_NOISE_...]` bao quanh 30 ký tự đầu summary | 2 | Validity giảm (text nhiễu dù đủ độ dài) | `text_for_embedding` lệch nghĩa, kéo `mean_token_f1`/`retrieval` xuống | Rebuild lấy lại summary gốc |
| Truncate title | Cắt title còn 5 ký tự (`"SafeRAG..."` → `"SafeR"`) | 2 | Không FAIL check hiện có (title vẫn non-empty) — giới hạn thật của `title_not_null` | Exact-title lookup trong `qa.py` (regex trích title trong dấu `'...'`) không match nữa, agent rơi về semantic search | Rebuild lấy lại title gốc |
| Stale published date | Set `published="2020-01-01"`, `age_days=2400` | 2 | `freshness` FAIL | `stale_rows: 2` trong `quality/corrupted.json` và `freshness_report_corrupted.json` (`is_fresh: false`) | Rebuild lấy lại `published` gốc |
| Add duplicate rows | Nhân đôi 2 record đã bị corrupt | 2 | `paper_id_not_null_unique` FAIL | `duplicates: 2` trong `quality/corrupted.json` | Rebuild dedupe lại theo `paper_id` |

Corruption log:

- Đường dẫn: `data/results/corruption_log.json`
- Trạng thái: Có
- Nhận xét: Log đầy đủ 6 loại corruption, mỗi action ghi rõ `paper_id`/`target_index` bị tác động, cùng giá trị cụ thể trước/sau (vd. `original_title`/`truncated_title`, `new_published`/`new_age_days`) — đủ để truy vết chính xác record nào bị lỗi gì.

Cách repair đảm bảo dữ liệu được phục hồi từ nguồn đáng tin cậy: `corruption_flow.py` không sửa trực tiếp trên `papers_clean_corrupted.*`, mà gọi lại `load_raw_records()` để đọc `crossref_records.json` gốc rồi chạy lại `build_clean_dataframe()` từ đầu — tức là build lại toàn bộ dataset sạch từ raw source độc lập với những gì corruption đã làm, không phải "vá" field bị lỗi. Đây là lý do repaired metrics khớp chính xác baseline metrics (không phải gần đúng).

## 10. So sánh baseline, corrupted và repaired

| Metric/signal            |  Baseline | Corrupted |  Repaired | Thay đổi do corruption | Mức phục hồi | Nhận xét   |
| ------------------------ | -------: | --------: | -------: | -----------------------: | --------------: | ------------ |
| `retrieval_hit_rate`   |   1.0000 |    0.9167 |   1.0000 |                  -0.0833 |             100% | Giảm do drop record + truncate title làm lệch embedding |
| `mean_token_f1`        |   0.4263 |    0.3480 |   0.4263 |                  -0.0783 |             100% | Giảm do blank/noise summary làm answer rule-based lệch |
| `judge_accuracy`       |   0.3472 |    0.2778 |   0.3472 |                  -0.0694 |             100% | Giảm theo cùng hướng với token_f1 |
| `mean_judge_score`     |   2.3611 |    2.1111 |   2.3611 |                  -0.2500 |             100% | LLM judge chấm thấp hơn khi context nhiễu/thiếu |
| Quality checks pass/fail |  PASS 5/5 |  FAIL (PASS 2/5) |  PASS 5/5 |         3 check FAIL (uniqueness, validity, freshness) |             100% | `row_count` và `title_not_null` không bắt được lỗi (giới hạn thật, ghi ở mục 12) |
| Freshness status         |    Fresh |     Stale |     Fresh |         `stale_rows` 0→2 |             100% | Do action `stale_published_date` đẩy 2 record về 2020-01-01 |

Hai kết luận nhân quả có bằng chứng:

1. Corruption (`truncate_title` + `inject_noise` làm nhiễu `text_for_embedding`, `drop_latest_records` loại record khỏi index) → `retrieval_hit_rate` giảm từ 1.0000 xuống 0.9167 — retrieval bỏ lỡ ground truth doc vì vector embedding lệch nghĩa hoặc document không còn trong index.
2. Repair (rebuild `clean_dataframe` từ `crossref_records.json` gốc, không vá field lỗi) → `data/quality/repaired.json` PASS lại 5/5 và `freshness_report_repaired.json` fresh trở lại → `retrieval_hit_rate`/`mean_token_f1`/`judge_accuracy`/`mean_judge_score` phục hồi về đúng giá trị baseline (không phải giá trị gần đúng), chứng minh repair lấy lại đúng dữ liệu gốc chứ không chỉ che triệu chứng.

## 11. Vấn đề tích hợp quan trọng

- **Triệu chứng:** Sau khi merge PR của các thành viên vào `main`, chạy `run_phase1.py` cho ra `retrieval_hit_rate = 0.0` và `judge_accuracy = 0.0` dù pipeline không báo lỗi (exit code 0).
- **Nguyên nhân:** `data/eval/test_set.json` bị dính theo lúc merge là bản cũ, được build từ dữ liệu Crossref giả (`_generate_fallback_records`) mà một thành viên tự tạo để test độc lập trước khi các module khác merge xong — `ground_truth_doc_ids` trong test set trỏ tới DOI giả (vd. `10.1016/j.artint.2025.104210`) không tồn tại trong `data/clean/papers_clean.json` thật (DOI Crossref thật, vd. `10.2118/234689-pa`). `phase1.py` chỉ build test set mới khi file chưa tồn tại, nên tái sử dụng nhầm bản cũ.
- **Cách xử lý:** Xóa `data/eval/test_set.json` cũ, chạy lại `run_phase1.py` để `testset.py` build test set mới khớp đúng `papers_clean.json` hiện tại.
- **Cách xác minh:** Chạy `python script/run_phase1.py` sau khi xóa, kiểm tra `data/results/baseline_metrics.json` — `retrieval_hit_rate` trở lại 1.0000 như bảng ở mục 7.

## 12. Giới hạn và hướng cải thiện

| Giới hạn hiện tại | Ảnh hưởng   | Hướng cải thiện có thể kiểm chứng |
| --------------------- | -------------- | ----------------------------------------- |
| `title_not_null` check không phát hiện được `truncate_title` (title bị cắt còn 5 ký tự vẫn non-empty nên PASS) | Corruption làm hỏng title thật nhưng quality report vẫn báo PASS ở check này, dễ gây chủ quan | Thêm check độ dài tối thiểu cho title (tương tự `MIN_SUMMARY_CHARS`), đo bằng cách chạy lại `run_data_quality_checks` trên `papers_clean_corrupted.json` và kiểm tra check mới FAIL |
| `judge_accuracy` (~0.35) và `mean_token_f1` (~0.43) ở mức thấp dù `retrieval_hit_rate` = 1.0 | Answer rule-based trong `qa.py` chỉ trích 1 field đơn giản (vd. `authors_joined`) nên không khớp sát ground truth dạng câu văn | Cải thiện `_extract_answer` hoặc để LLM sinh câu trả lời tự nhiên từ context thay vì trích field thô, đo lại `mean_token_f1`/`judge_accuracy` trên cùng test set |
| Ragas chưa chạy (`RUN_RAGAS` không set) | Thiếu chỉ số `answer_relevancy`/`context_precision`/`context_recall`/`faithfulness` để đối chiếu | Set `RUN_RAGAS=1` khi chạy `run_phase1.py`, so sánh thời gian chạy và kết quả trong `baseline_metrics.json["ragas"]` |

## 13. Checklist trước khi nộp

- [x] Thông tin nhóm và repository chính xác.
- [x] Phân công khớp với module, artifact và kết quả thực tế.
- [x] Lệnh tái hiện đã được chạy lại trên phiên bản dùng để nộp.
- [x] Baseline, corrupted và repaired dùng cùng evaluation set.
- [x] Bảng metrics khớp với các file trong `data/results/`.
- [x] Quality/freshness conclusions khớp với `data/quality/`.
- [x] Các đường dẫn báo cáo và artifact truy cập được.
- [x] Mỗi thành viên đã hoàn thành báo cáo vai trò riêng.
- [x] Không có `.env`, API key, token hoặc secret trong source, report, log hay ảnh.
