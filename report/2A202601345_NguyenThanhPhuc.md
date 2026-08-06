# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin | Nội dung |
|---|---|
| Họ và tên | Nguyễn Thanh Phúc |
| MSSV | 2A202601345 |
| Khóa/Lớp | K3 |
| Tên nhóm | A3 |
| Vai trò chính | Cleaning & test-set owner |
| Repository | K3_Day10_Data-Pipeline-Data-Observability |
| Ngày hoàn thành | 2026-08-06 |

## 2. Vai trò và phạm vi công việc

| Module/deliverable | File/hàm phụ trách | Input | Output | Trạng thái |
|---|---|---|---|---|
| Cleaning & data modeling | `src/ingestion/cleaning.py::build_clean_dataframe` | `data/raw/crossref_records.json` | `data/clean/papers_clean.csv`, `papers_clean.json` | Hoàn thành |
| Evaluation set | `src/evaluation/testset.py::build_test_set` | Cleaned DataFrame | `data/eval/test_set.json` | Hoàn thành |

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Module được hỗ trợ | Kết quả |
|---|---|---|
| Không có | N/A | Không nhận ownership ngoài cleaning và evaluation set |

## 3. Kết quả theo vai trò

| Nhiệm vụ | File/artifact | Kết quả | Cách xác minh |
|---|---|---|---|
| Chuẩn hóa và lọc dữ liệu Crossref | `src/ingestion/cleaning.py`, `data/clean/` | Tạo 24 cleaned records với `text_for_embedding`, `age_days` và schema downstream | `pytest`, kiểm tra số dòng trong JSON/CSV |
| Tạo evaluation set tái lập | `src/evaluation/testset.py`, `data/eval/test_set.json` | Tạo 72 evaluation items, gồm summary/authors/date; categories không có vì raw records không có category | Kiểm tra JSON schema và question types |

Output cụ thể: `data/clean/papers_clean.json` có 24 records; `data/eval/test_set.json` có 72 câu hỏi; `data/quality/baseline.json` có tất cả quality checks PASS.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Raw records từ Crossref cần được chuẩn hóa thành dữ liệu ổn định để embedding, retrieval, quality checks và evaluation dùng chung. Pipeline cũng cần một evaluation set cố định để so sánh baseline, corrupted và repaired công bằng.

### Cách triển khai

`build_clean_dataframe` chuẩn hóa whitespace, authors, categories, title và summary; loại record thiếu `paper_id`, title hoặc summary; loại duplicate theo `paper_id`; chuẩn hóa ngày; tính `age_days`; tạo `authors_joined`, `categories_joined`, `summary_chars` và `text_for_embedding`.

`build_test_set` sắp xếp document theo `paper_id`, chọn tối đa 24 document, tạo câu hỏi deterministic cho summary, authors, date và categories khi dữ liệu có giá trị, đồng thời ghi các document ID nguồn vào `ground_truth_doc_ids`.

### Input, output và contract

| Thành phần | Mô tả |
|---|---|
| Input | `PaperRecord` từ `data/raw/crossref_records.json` |
| Output cleaning | DataFrame có `paper_id`, `title`, `summary`, `authors_joined`, `categories_joined`, `published`, `age_days`, `text_for_embedding` và các trường nguồn |
| Output evaluation | JSON records gồm `id`, `question_type`, `question`, `ground_truth`, `ground_truth_doc_ids` |
| Module phụ thuộc | `src/ingestion/crossref.py`, `src/core/utils.py`, pandas |
| Module sử dụng output | `src/retrieval/index.py`, `src/evaluation/metrics.py`, `src/observability/quality.py`, corruption flow |
| Điều kiện lỗi | Bỏ record thiếu ID/title/summary; `ValueError` nếu evaluation DataFrame thiếu required columns |

### Cách xác minh

```bash
PYTHONPATH=src uv run --no-sync pytest -q tests/test_cleaning.py tests/test_testset.py
```

- **Kết quả mong đợi:** Các test cleaning và test-set đều pass.
- **Kết quả thực tế:** `4 passed`.
- **Artifact:** `data/clean/papers_clean.json`, `data/clean/papers_clean.csv`, `data/eval/test_set.json`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Test set phải ổn định giữa baseline, corrupted và repaired.
- **Các phương án:** Tạo ngẫu nhiên mỗi lần chạy; dùng toàn bộ record không giới hạn; chọn tối đa 24 record theo thứ tự deterministic.
- **Phương án đã chọn:** Sắp xếp theo `paper_id` và chọn tối đa 24 record, tạo câu hỏi theo thứ tự cố định.
- **Lý do:** Kết quả có thể tái lập và thay đổi metric phản ánh trạng thái dữ liệu thay vì thay đổi bộ câu hỏi.
- **Bằng chứng:** Hai lần gọi `build_test_set` trên cùng DataFrame tạo payload giống nhau; artifact có 72 items.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng:** Chạy test `testset.py` bị lỗi import `langchain` dù test chỉ cần pandas và JSON.
- **Nguyên nhân gốc:** `src/evaluation/__init__.py` import `metrics.py` ngay khi import package; metrics kéo theo retrieval và LangChain.
- **Cách xử lý:** Điều chỉnh import package để test riêng `testset.py` không phải tải toàn bộ RAG/LLM stack. Đây là xử lý tích hợp phục vụ việc xác minh module, không phải ownership riêng.
- **Cách xác minh:** `PYTHONPATH=src uv run --no-sync pytest -q tests/test_cleaning.py tests/test_testset.py` cho kết quả `4 passed`.
- **Điều học được:** Package-level eager import làm tăng dependency không cần thiết và gây khó khăn cho test theo module.

## 7. Hiểu biết về luồng end-to-end

1. Crossref trả raw response và records; cleaning chuẩn hóa records vào `data/clean/`; embedding/index tạo vector index từ `text_for_embedding`; agent dùng index để retrieval và trả lời.
2. Evaluation set chứa câu hỏi, đáp án chuẩn và document IDs chuẩn. Retrieval được xem là hit khi kết quả tìm được chứa một ID trong `ground_truth_doc_ids`; answer quality được đo bằng token F1 và judge metrics.
3. Quality checks kiểm tra tính đầy đủ, duy nhất, hợp lệ của dữ liệu; freshness monitoring kiểm tra tuổi dữ liệu dựa trên `published` và `age_days`.
4. Dùng cùng test set giúp so sánh baseline, corrupted và repaired mà không trộn lẫn ảnh hưởng của việc thay đổi câu hỏi.
5. Repair chỉ được xem là thành công khi artifact repaired được tạo từ nguồn đáng tin cậy, quality/freshness phục hồi và các metrics agent cải thiện hoặc quay về gần baseline.

## 8. Phân tích kết quả

Full RAG pipeline chưa được chạy vì môi trường kiểm thử chỉ cài dependency tối thiểu cho cleaning/evaluation. Do đó chưa ghi các metric agent khi chưa có artifact hợp lệ.

| Metric/signal | Baseline | Corrupted | Repaired | Nhận xét |
|---|---:|---:|---:|---|
| `retrieval_hit_rate` | N/A | N/A | N/A | Chưa chạy embedding/retrieval |
| `mean_token_f1` | N/A | N/A | N/A | Chưa chạy answer evaluation |
| `judge_accuracy` | N/A | N/A | N/A | Chưa chạy judge |
| `mean_judge_score` | N/A | N/A | N/A | Chưa chạy judge |
| Quality checks | PASS | N/A | N/A | Baseline: 5/5 checks PASS |
| Freshness status | Fresh | N/A | N/A | Baseline: `stale_rows=0` |

Kết quả đã xác minh: `quality_passed=True`, `freshness=True`, `stale_rows=0`. Corruption và repair chưa được kết luận vì chưa chạy corruption flow.

## 9. Điều học được và hướng cải thiện

1. Data pipeline cần data contract rõ ràng giữa raw, clean, embedding và evaluation.
2. Quality checks và freshness là hai tín hiệu khác nhau nhưng đều cần trường dữ liệu được chuẩn hóa như `paper_id`, `summary` và `age_days`.
3. Evaluation set cố định là điều kiện cần để liên hệ thay đổi dữ liệu với thay đổi chất lượng RAG.

### Nếu có thêm thời gian

Chạy full baseline/corruption flow với embedding và LLM dependencies, sau đó điền các metric retrieval/answer và đối chiếu với `data/quality/` và `data/reports/`. Có thể bổ sung categories vào raw parsing để evaluation set bao phủ đủ bốn question types.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đã ghi đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi “đã chạy thành công” cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Nguyễn Thanh Phúc  
**Ngày xác nhận:** 2026-08-06
