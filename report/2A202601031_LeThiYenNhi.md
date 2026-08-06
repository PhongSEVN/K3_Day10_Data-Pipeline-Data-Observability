# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin         | Nội dung                  |
| ------------------ | -------------------------- |
| Họ và tên       | Lê Thị Yến Nhi          |
| MSSV               | 2A202601031                |
| Khóa/Lớp         | K3                         |
| Tên nhóm         | A3                         |
| Vai trò chính    | Observability owner        |
| Repository         | `https://github.com/PhongSEVN/DAY10_2A202601241_NguyenVanPhong` |
| Ngày hoàn thành | 2026-08-06                  |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable  | File/hàm phụ trách              | Input nhận vào                   | Output bàn giao                                   | Trạng thái                                 |
| ------------------- | ---------------------------------- | ---------------------------------- | -------------------------------------------------- | -------------------------------------------- |
| Data quality checks | `src/observability/quality.py` (`run_data_quality_checks`, `build_freshness_report`) | cleaned dataframe (`data/clean/`), `Settings` | `data/quality/{baseline,corrupted,repaired}.json`, `data/quality/freshness_report*.json` | Hoàn thành |
| Reporting           | `src/observability/reporting.py` (`generate_phase1_report`, `generate_corruption_report`) | metrics/quality/freshness dict từ pipeline | `data/reports/phase1_report.md`, `data/reports/corruption_report.md` | Hoàn thành |

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động                  | Thành viên/module được hỗ trợ | Kết quả                    |
| ----------------------------- | ------------------------------------ | ---------------------------- |
| Xây dashboard demo tĩnh (`client/`) đọc trực tiếp artifact `data/results/`, `data/quality/` | Cả nhóm — dùng để demo trực quan thay vì đọc JSON thô | Dashboard chạy bằng `python -m http.server`, tự phát hiện artifact thật hay fallback mock; đã verify khớp 100% với số liệu pipeline thật |
| Chạy lại `run_phase1.py` + `run_corruption_flow.py` với `LLM_PROVIDER=openai` sau khi có API key | Nguyễn Văn Phong (Pipeline integration) | Xác nhận `phase1.py`/`corruption_flow.py` hoạt động đúng với provider khác Gemini, không hard-code theo provider |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao       | Cách xác minh  |
| --------------------------- | ----------------------------- | ------------------------- | ---------------- |
| Viết 5 check trong `run_data_quality_checks`: row_count, paper_id not-null/unique, title not-null, summary_length, freshness | `src/observability/quality.py` | `data/quality/baseline.json` (PASS), `data/quality/corrupted.json` (FAIL), `data/quality/repaired.json` (PASS) | `python script/run_phase1.py` + `python script/run_corruption_flow.py` |
| Viết `build_freshness_report` tính `age_days`/`stale_rows` từ `published` so với `freshness_threshold_days` | `src/observability/quality.py` | `freshness_report.json` (`is_fresh=true`, `stale_rows=0`), `freshness_report_corrupted.json` (`is_fresh=false`, `stale_rows=2`) | Đọc trực tiếp file JSON trong `data/quality/` |
| Viết markdown report cho baseline và so sánh 3 trạng thái | `src/observability/reporting.py` | `data/reports/phase1_report.md`, `data/reports/corruption_report.md` | Mở file, đối chiếu bảng metric với `data/results/*.json` |

Output cụ thể: `data/quality/corrupted.json` cho thấy đúng 3/5 check FAIL (`paper_id_not_null_unique`: 2 duplicate, `summary_length`: 4 record dưới 20 ký tự, `freshness`: 2 record stale) — khớp chính xác với 6 kịch bản corruption Hoàng tạo ra (blank/noise summary, stale date, duplicate rows), chứng minh check bắt đúng loại lỗi được inject.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Sau khi baseline/corrupted/repaired dataset được tạo ra, cần một lớp kiểm tra độc lập với business logic của agent để tự động phát hiện dữ liệu có vấn đề (thiếu, trùng, rỗng, cũ) **trước khi** nó ảnh hưởng đến câu trả lời của agent, và tổng hợp kết quả thành report con người đọc được — thay vì chỉ nhìn vào số liệu retrieval/judge để đoán dữ liệu có lỗi hay không.

### Cách triển khai

`run_data_quality_checks(df, settings, report_name)` chạy 5 check độc lập trên dataframe, mỗi check trả về `{name, dimension, passed, detail}`; `report_name` (`"baseline"`/`"corrupted"`/`"repaired"`) dùng làm tên file để hàm dùng chung được cho cả 3 trạng thái thay vì viết 3 hàm riêng. `build_freshness_report` tách riêng khỏi quality checks vì freshness cần logic khác (parse ngày, tính latest/oldest) và được gọi ở nhiều điểm khác nhau trong pipeline (baseline, corrupted, repaired — mỗi lần ghi ra path riêng).

`reporting.py` không hard-code từng dòng markdown mà build từ list `checks`/dict `metrics` nên khi thêm check mới ở `quality.py` thì report tự in thêm dòng, không cần sửa `reporting.py`.

### Input, output và contract

| Thành phần                   | Mô tả                                     |
| ------------------------------ | ------------------------------------------- |
| Input                          | `pd.DataFrame` đã clean (cột `paper_id`, `title`, `summary`, `published`, `age_days`), `Settings.freshness_threshold_days` |
| Output                         | dict `{report_name, generated_at, row_count, checks, passed}` + file JSON ghi qua `write_json` |
| Module phụ thuộc             | `core.config.Settings`, `core.utils.write_json`/`write_text` |
| Module sử dụng output        | `src/pipelines/phase1.py`, `src/pipelines/corruption_flow.py` (truyền `quality`/`freshness` vào `generate_*_report`) |
| Điều kiện lỗi cần xử lý | Cột thiếu trong dataframe (fallback: coi như toàn bộ record fail check đó thay vì crash `KeyError`) |

### Cách xác minh

```bash
python script/run_phase1.py
python script/run_corruption_flow.py
```

- **Kết quả mong đợi:** baseline PASS toàn bộ check, corrupted FAIL ở uniqueness/validity/freshness, repaired PASS lại; `retrieval_hit_rate` giảm rồi phục hồi.
- **Kết quả thực tế:** chạy thành công với `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-4o-mini`. `baseline_hit_rate=1.000`, `corrupted_hit_rate=0.667`, `repaired_hit_rate=1.000`. `data/quality/corrupted.json` có `"passed": false` với 3 check fail đúng dự kiến; `data/quality/baseline.json` và `repaired.json` đều `"passed": true`.
- **Artifact/log:** `data/results/baseline_metrics.json`, `data/results/corrupted_metrics.json`, `data/results/repaired_metrics.json`, `data/quality/*.json`, `data/reports/phase1_report.md`, `data/reports/corruption_report.md`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Cần quyết định cấu trúc dữ liệu trả về của từng quality check — trả về boolean đơn giản hay object có ngữ cảnh.
- **Các phương án đã cân nhắc:**
  1. Mỗi check chỉ trả `True`/`False`, ghi thẳng vào report.
  2. Mỗi check trả `{name, dimension, passed, detail}` — `detail` chứa số liệu cụ thể (vd. `missing`, `duplicates`, `stale_rows`).
- **Phương án đã chọn:** Phương án 2.
- **Lý do:** Chỉ có `True/False` thì report chỉ nói "fail" mà không nói fail bao nhiêu record, vì lý do gì — không đủ để debug hay để `client/` dashboard sinh giải thích cụ thể theo từng giá trị.
- **Bằng chứng quyết định phù hợp:** `data/quality/corrupted.json` in ra `"paper_id_not_null_unique": {"missing": 0, "duplicates": 2}` — nhìn vào biết ngay đúng 2 record bị duplicate chứ không chỉ biết "có lỗi uniqueness".

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** `AttributeError: 'str' object has no attribute 'parent'` tại `core/utils.py` dòng `ensure_parent(path)`.
- **Lệnh hoặc bước tái hiện:** Gọi `generate_phase1_report('scratch_phase1_report.md', ...)` (truyền string) trong lúc smoke-test `reporting.py` bằng dataframe giả trước khi pipeline thật chạy được.
- **Nguyên nhân gốc:** `write_text`/`write_json` gọi `path.parent` giả định `path` luôn là `pathlib.Path`, nhưng test script truyền thẳng string.
- **Cách xử lý:** Sửa script test để bọc `Path(...)` quanh mọi đường dẫn truyền vào — không sửa `reporting.py`/`quality.py` vì contract (`report_path: Path`) đúng với cách `phase1.py`/`corruption_flow.py` gọi thật (luôn truyền `settings.paths.*`, vốn đã là `Path`).
- **Cách xác minh sau khi sửa:** Chạy lại smoke test với `Path('scratch_phase1_report.md')` — ghi file thành công, không lỗi.
- **Điều học được:** Type hint (`report_path` không annotate) không tự bảo vệ khỏi lỗi runtime — cần test với đúng kiểu dữ liệu caller thật sự truyền vào, không phải kiểu tiện tay nhất khi viết test.

## 7. Hiểu biết về luồng end-to-end

**Câu trả lời:**

1. **Dữ liệu đi từ Crossref đến vector index như thế nào?** `crossref.py` gọi API, lưu raw response + parse thành `PaperRecord` (`data/raw/`) → `cleaning.py` chuẩn hóa thành dataframe với cột `text_for_embedding`, `age_days` (`data/clean/`) → `retrieval/index.py` dùng MiniLM encode `text_for_embedding` rồi nạp vào ChromaDB collection.
2. **Evaluation set và ground-truth document IDs dùng để đo retrieval/answer quality ra sao?** `testset.py` sinh câu hỏi kèm `ground_truth_doc_ids` từ chính cleaned dataset; khi evaluate, `retrieval_hit_rate` so `retrieved_doc_ids` của agent với `ground_truth_doc_ids` — hit nếu trùng ít nhất 1 ID, còn `judge_accuracy`/`mean_judge_score` do LLM chấm câu trả lời so với `ground_truth`.
3. **Quality checks khác freshness monitoring ở điểm nào?** Quality checks (`run_data_quality_checks`) đánh giá tính toàn vẹn/hợp lệ của dữ liệu tại một thời điểm (đủ trường, không trùng, đủ dài) — trạng thái tĩnh. Freshness (`build_freshness_report`) đánh giá dữ liệu có "cũ" so với hiện tại hay không dựa trên `age_days` — phụ thuộc thời gian, cùng một dataset có thể pass quality nhưng vẫn stale nếu chạy lại sau nhiều tháng.
4. **Vì sao phải dùng cùng test set cho baseline, corrupted và repaired?** Vì test set khác nhau (câu hỏi/ground-truth khác) sẽ làm số liệu không so sánh được — không biết chênh lệch metric là do corruption hay do câu hỏi khác nhau. Dùng chung `data/eval/test_set.json` đảm bảo biến duy nhất thay đổi giữa 3 lần chạy là chất lượng dữ liệu.
5. **Repair được xem là thành công dựa trên artifact/metric nào?** `data/quality/repaired.json` có `passed: true` (không còn fail nào so với corrupted), `freshness_report_repaired.json` có `is_fresh: true, stale_rows: 0`, và `repaired_metrics.json` quay lại đúng bằng `baseline_metrics.json` (`retrieval_hit_rate=1.000`, `mean_judge_score=4.167`) — cả 3 nguồn bằng chứng đều khớp nhau.

## 8. Phân tích kết quả

### Metrics chính

Chạy thật với `LLM_PROVIDER=openai`, `LLM_MODEL=gpt-4o-mini`, `embedding_model=sentence-transformers/all-MiniLM-L6-v2`, 24 record, 24 câu hỏi eval.

| Metric/signal          | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| ---------------------- | -------: | --------: | -------: | ------------------------- |
| `retrieval_hit_rate` |    1.000 |     0.667 |    1.000 | Giảm mạnh nhất (-33.3%) — corruption (duplicate + stale + noise summary) làm lệch vector embedding, agent retrieve nhầm context |
| `mean_token_f1`      |    0.826 |     0.592 |    0.826 | Giảm theo do câu trả lời dựa trên context sai lệch |
| `judge_accuracy`     |    0.750 |     0.708 |    0.750 | Giảm ít hơn (-5.6%) vì chỉ 4-6/24 record bị corrupt trực tiếp, phần lớn câu hỏi vẫn answer đúng |
| `mean_judge_score`   |    4.167 |     3.833 |    4.167 | Điểm trung bình judge giảm nhẹ, phản ánh câu trả lời "gần đúng nhưng thiếu chi tiết" nhiều hơn là sai hoàn toàn |
| Quality checks         |     PASS |      FAIL |     PASS | Corrupted fail đúng 3 check: uniqueness (2 duplicate), validity (4 summary < 20 ký tự), freshness (2 stale) |
| Freshness status       |    FRESH |     STALE |    FRESH | `stale_rows` 0 → 2 → 0 |

### Kết luận từ số liệu

1. Corruption (duplicate paper_id x2, blank/noise summary trên 4 record, stale date x2) → `data/quality/corrupted.json` fail 3/5 check + `freshness_report_corrupted.json` báo `is_fresh=false` → `retrieval_hit_rate` giảm từ 1.000 xuống 0.667, vì embedding rebuild trên dữ liệu nhiễu/duplicate làm ChromaDB trả về context sai cho một phần câu hỏi.
2. Repair (rebuild lại từ `data/raw/crossref_records.json` gốc thay vì vá dữ liệu đã hỏng) → quality checks PASS lại toàn bộ 5/5, freshness `is_fresh=true` → toàn bộ 4 metric agent quay lại **đúng bằng** baseline, không chỉ "gần bằng" — vì repair dùng lại chính xác raw record gốc và LLM judge chạy `temperature=0.0` nên deterministic.

Corruption ảnh hưởng rõ nhất ở `retrieval_hit_rate` (không phải `judge_accuracy`) vì retrieval là bước đầu tiên trong chuỗi — nếu ChromaDB trả context sai, agent gần như không có cách nào trả lời đúng bất kể LLM giỏi thế nào; các câu hỏi vẫn retrieve đúng thì judge vẫn chấm điểm cao bình thường, nên `judge_accuracy` giảm ít hơn tỷ lệ tương ứng với số record bị corrupt.

Kết quả khác kỳ vọng ban đầu: khi mới thiết kế, tôi nghĩ repaired sẽ chỉ "gần" bằng baseline (LLM judge có thể ra điểm khác lần chạy khác do model không hoàn toàn deterministic). Thực tế repaired **bằng chính xác** baseline ở cả 4 chỉ số — đã kiểm tra lại và xác nhận do `temperature=0.0` ở `_judge_answer` (`src/evaluation/metrics.py`) cộng với việc raw source (`crossref_records.json`) không đổi giữa 2 lần build, nên toàn chuỗi retrieval → answer → judge lặp lại y hệt.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Data pipeline: mỗi bước (raw → clean → embed → eval) cần artifact trung gian ghi ra đĩa, không chỉ giữ trong biến — nếu không sẽ không debug được bước nào gây ra số liệu bất thường.
2. Data quality/observability: check càng cụ thể (trả `detail` thay vì chỉ pass/fail) thì report và các công cụ downstream (như dashboard `client/`) mới giải thích được *tại sao* fail, không chỉ *có* fail.
3. Ảnh hưởng của data đến RAG agent: lỗi ở tầng retrieval (embedding/index) tác động agent nặng hơn nhiều so với lỗi ở tầng answer — vì nếu context sai ngay từ đầu thì LLM giỏi đến đâu cũng không cứu được.

### Nếu có thêm thời gian

Thêm check `duplicate_text_for_embedding` (2 record khác `paper_id` nhưng summary gần như giống hệt) — hiện `paper_id_not_null_unique` chỉ bắt trùng theo ID, không bắt được duplicate nội dung do lỗi nguồn dữ liệu (không phải do corruption cố ý). Đo cải thiện bằng cách tạo thêm 1 corruption scenario "near-duplicate content, khác paper_id" và xác nhận check mới bắt được.

## 10. Cam kết của thành viên

Đánh dấu sau khi tự kiểm tra:

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi "đã chạy thành công" cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Lê Thị Yến Nhi
**Ngày xác nhận:** 2026-08-06
