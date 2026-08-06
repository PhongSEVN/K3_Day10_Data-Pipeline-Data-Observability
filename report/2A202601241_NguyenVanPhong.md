# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin         | Nội dung                                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------- |
| Họ và tên       | Nguyễn Văn Phong                                                                                                    |
| MSSV               | 2A202601241                                                                                                           |
| Khóa/Lớp         | K3                                                                                                                    |
| Tên nhóm         | A3                                                                                                                    |
| Vai trò chính    | Pipeline integration & evidence owner                                                                                 |
| Repository         | [github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability](https://github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability) |
| Ngày hoàn thành | 2026-08-06                                                                                                            |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable            | File/hàm phụ trách                | Input nhận vào                               | Output bàn giao                                                                    | Trạng thái   |
| ----------------------------- | ------------------------------------ | ---------------------------------------------- | ----------------------------------------------------------------------------------- | -------------- |
| Baseline orchestration        | `src/pipelines/phase1.py`          | Raw records, clean dataframe, test set, index từ các module khác | Baseline metrics, `data/reports/phase1_report.md` và đầy đủ artifact pha 1 | Hoàn thành |
| Corruption flow orchestration | `src/pipelines/corruption_flow.py` | Cleaned baseline (`papers_clean.json`) + `corrupt_clean_dataframe` từ module corruption | Corrupted/repaired metrics, `data/reports/corruption_report.md`, comparison report | Hoàn thành |

Chỉ nhận ownership cho `phase1.py` và `corruption_flow.py` — các hàm bên trong `crossref.py`, `cleaning.py`, `testset.py`, `quality.py`, `reporting.py`, `corruption.py` do các thành viên khác trực tiếp implement, tôi chỉ gọi đúng contract (chữ ký hàm) của họ, không sửa logic bên trong.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động                  | Thành viên/module được hỗ trợ | Kết quả                    |
| ----------------------------- | ------------------------------------ | ---------------------------- |
| Resolve merge conflict giữa `main` và branch `hoang` | Vũ Huy Hoàng (`corruption.py`, và bản trùng lặp `crossref.py`/`quality.py`/`reporting.py` do code độc lập trước khi sync) | Giữ đúng bản chính (Linh/Nhi) cho 3 file trùng, giữ bản Hoàng cho `corruption.py`, verify chạy lại cả 2 flow thành công |
| Resolve merge conflict giữa `main` và branch `phuc` | Nguyễn Thanh Phúc (`cleaning.py`, `testset.py` bị conflict với bản tạm của Hoàng) | Giữ bản Phúc (có validate cột, type hint, sort ổn định) cho 2 file thuộc quyền anh, verify lại pipeline |
| Debug blocker `retrieval_hit_rate = 0` sau merge | Toàn nhóm | Xác định nguyên nhân là `test_set.json` cũ dính từ merge, không khớp DOI thật — xóa và build lại, khôi phục metrics đúng |
| Xây dashboard quan sát (`client/`) | Toàn nhóm, phục vụ demo | Dashboard tĩnh (`index.html`) + trang scrollytelling giải thích pipeline (`story.html`) + lab mô phỏng corruption/repair tương tác (`corrupt-sim.js`), đọc trực tiếp artifact thật trong `data/` |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao       | Cách xác minh  |
| --------------------------- | ----------------------------- | ------------------------- | ---------------- |
| Viết `main()` trong `phase1.py`: load/fetch raw → clean → save → build index → build/load test set → evaluate → quality+freshness → report → demo agent | `src/pipelines/phase1.py` | `data/results/baseline_metrics.json` (`retrieval_hit_rate=1.0`, 72 mẫu), `data/reports/phase1_report.md` | `python script/run_phase1.py`, exit code 0 |
| Viết `main()` trong `corruption_flow.py`: guard baseline tồn tại → corrupt → save+evaluate corrupted → quality+freshness corrupted → repair từ raw → save+evaluate repaired → comparison report | `src/pipelines/corruption_flow.py` | `data/results/corruption_log.json`, `corrupted_metrics.json`, `repaired_metrics.json`, `data/reports/corruption_report.md` | `python script/run_corruption_flow.py`, exit code 0 |
| Debug và fix blocker `test_set.json` lỗi thời sau merge | `data/eval/test_set.json` | `retrieval_hit_rate` khôi phục từ 0.0 lên 1.0000 | So sánh `baseline_metrics.json` trước/sau khi xóa và build lại test set |

Output cụ thể nhất mà phần việc của tôi tạo ra: `data/reports/corruption_report.md` — bảng so sánh 4 metric + quality + freshness giữa baseline/corrupted/repaired trong cùng 1 file, là bằng chứng trực tiếp cho luận điểm "data quality quyết định chất lượng RAG" mà cả nhóm cần chứng minh.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Từng module (ingestion, cleaning, evaluation, observability, corruption) chạy độc lập không tạo ra giá trị nếu không có thứ tự gọi đúng và không lưu đúng artifact ở đúng path để module sau đọc được. Việc của tôi là ghép các hàm rời rạc đó thành 2 flow chạy được từ đầu đến cuối, đúng thứ tự phụ thuộc (ingestion → cleaning → embedding → eval → quality → report), và đảm bảo baseline/corrupted/repaired dùng chung 1 evaluation set để so sánh có ý nghĩa.

### Cách triển khai

`phase1.py` tách thành các hàm nhỏ (`_load_records`, `_load_or_build_test_set`, `_save_clean_dataset`, `_demo_agent_answers`) thay vì 1 hàm `main()` dài, để mỗi bước độc lập test được và dễ đọc. Logic "chỉ fetch lại raw/test set khi chưa có file hoặc có flag `REFRESH_SOURCE`/`REFRESH_TEST_SET`" giúp chạy lại pipeline nhiều lần trong lúc debug mà không tốn API call/tạo test set mới mỗi lần.

`corruption_flow.py` có bước guard (`_require_baseline`) chặn chạy sớm nếu chưa có `baseline_metrics.json`/`papers_clean.json`, đúng theo cảnh báo trong README ("Chạy corruption flow nhưng thiếu baseline artifact"). Điểm quan trọng nhất về mặt thiết kế: bước repair không sửa `papers_clean_corrupted.json`, mà gọi lại `load_raw_records()` + `build_clean_dataframe()` từ `crossref_records.json` gốc để tạo `papers_clean_repaired.json` — tức là build lại từ đầu, không phải patch. Freshness report cho corrupted/repaired dùng path riêng (`data/quality/freshness_report_corrupted.json`, `_repaired.json`) vì `Paths` trong `core/config.py` chỉ định nghĩa sẵn 1 path cho baseline.

### Input, output và contract

| Thành phần                   | Mô tả                                     |
| ------------------------------ | ------------------------------------------- |
| Input                          | `Settings` (từ `load_settings()`), các hàm contract của module khác (`fetch_source_records`, `build_clean_dataframe`, `build_test_set`, `run_data_quality_checks`, `build_freshness_report`, `generate_phase1_report`, `corrupt_clean_dataframe`, `generate_corruption_report`) |
| Output                         | File JSON/CSV/Markdown trong `data/clean/`, `data/embeddings/`, `data/results/`, `data/quality/`, `data/reports/` theo đúng path định nghĩa trong `Settings.paths` |
| Module phụ thuộc             | `core.config`, `core.utils`, `ingestion.*`, `evaluation.*`, `observability.*`, `retrieval.*` |
| Module sử dụng output        | Không có module Python nào dùng lại output của `phase1.py`/`corruption_flow.py` — đây là entrypoint cuối; `client/` dashboard đọc trực tiếp JSON output qua `fetch()` để hiển thị |
| Điều kiện lỗi cần xử lý | Chạy `corruption_flow.py` trước `phase1.py` (guard raise `RuntimeError` rõ ràng thay vì lỗi mơ hồ) |

### Cách xác minh

```bash
python script/run_phase1.py
python script/run_corruption_flow.py
```

- **Kết quả mong đợi:** cả 2 lệnh exit code 0, sinh đủ file trong `data/results/`, `data/quality/`, `data/reports/`.
- **Kết quả thực tế:** đúng như mong đợi; `baseline_metrics.json` → `retrieval_hit_rate=1.0`, `corrupted_metrics.json` → `0.9167`, `repaired_metrics.json` → `1.0` (khớp lại baseline).
- **Artifact/log:** `data/results/*.json`, `data/reports/*.md` (không chứa secret, chỉ chứa metric số và text bài báo công khai từ Crossref).

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Freshness report cho trạng thái corrupted/repaired cần ghi ra file riêng để không đè lên `freshness_report.json` của baseline, nhưng `core/config.py` (`Paths`) chỉ định nghĩa sẵn 1 field `freshness_report` dùng cho baseline.
- **Các phương án đã cân nhắc:** (1) Sửa `Paths` trong `core/config.py` để thêm 2 field mới `corrupted_freshness_report`/`repaired_freshness_report`; (2) Tự tạo path ngay trong `corruption_flow.py` bằng `settings.paths.quality_dir / "freshness_report_corrupted.json"` mà không đụng vào `config.py`.
- **Phương án đã chọn:** (2) — tự tạo path cục bộ trong `corruption_flow.py`.
- **Lý do:** `core/config.py` không thuộc phần việc tôi sở hữu và các module khác (`quality.py`) đã import `Settings` từ đó; sửa `Paths` (1 dataclass `frozen=True` dùng chung toàn dự án) có nguy cơ tạo conflict với các nhánh khác đang code song song, trong khi `build_freshness_report()` vốn đã nhận `report_path` là tham số tự do, không bắt buộc phải lấy từ `settings.paths`.
- **Bằng chứng quyết định phù hợp:** Pipeline chạy hết không lỗi, `data/quality/freshness_report_corrupted.json` và `freshness_report_repaired.json` được tạo đúng, tách biệt khỏi `freshness_report.json` baseline, không cần merge lại `core/config.py` khi các nhánh khác (Hoàng, Phúc) push code.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** Sau khi merge PR `hoang` và `phuc` vào `main`, chạy `python script/run_phase1.py` xong (exit code 0) nhưng `data/results/baseline_metrics.json` cho `"retrieval_hit_rate": 0.0` và `"judge_accuracy": 0.0`.
- **Lệnh hoặc bước tái hiện:** `python script/run_phase1.py` trên `main` ngay sau khi merge PR #3 (`hoang`).
- **Nguyên nhân gốc:** `data/eval/test_set.json` không tồn tại trong `main` trước đó, nhưng lần merge PR Hoàng mang theo 1 bản `test_set.json` được Hoàng tự sinh lúc code độc lập, dựa trên dữ liệu Crossref giả (`_generate_fallback_records` trong bản `crossref.py` cũ của anh — đã bị loại khi resolve conflict, nhưng file `test_set.json` do bản đó tạo ra vẫn còn nằm trong git). `ground_truth_doc_ids` trong file này trỏ tới DOI giả (`10.1016/j.artint.2025.104210`...) không khớp `paper_id` thật trong `papers_clean.json` (DOI Crossref thật). Logic trong `phase1.py` (`_load_or_build_test_set`) chỉ build test set mới khi file **chưa tồn tại**, nên đã tái sử dụng nhầm file cũ thay vì phát hiện nó lỗi thời.
- **Cách xử lý:** Xóa `data/eval/test_set.json`, chạy lại `run_phase1.py` để `testset.build_test_set()` sinh lại test set mới, khớp đúng `paper_id` trong `papers_clean.json` hiện tại.
- **Cách xác minh sau khi sửa:** Chạy lại `run_phase1.py`, đọc `baseline_metrics.json` → `retrieval_hit_rate=1.0`, `judge_accuracy=0.3472` — không còn 0.
- **Điều học được:** Logic "chỉ build lại khi file chưa tồn tại" tiện cho việc tái sử dụng artifact giữa các lần chạy, nhưng không an toàn khi artifact đó có thể đến từ nguồn không nhất quán (ví dụ merge từ branch khác). Nếu làm lại, tôi sẽ thêm 1 bước validate nhẹ (kiểm tra `ground_truth_doc_ids` trong test set có nằm trong tập `paper_id` của `papers_clean.json` hiện tại không) trước khi quyết định tái sử dụng file cũ.

## 7. Hiểu biết về luồng end-to-end

1. **Crossref → vector index:** `crossref.py` gọi API, lưu raw response + parse thành `PaperRecord`. `cleaning.py` lọc record thiếu field bắt buộc, chuẩn hóa, tạo `text_for_embedding`. `retrieval/index.py` encode `text_for_embedding` bằng MiniLM rồi nạp vào ChromaDB collection tương ứng (baseline/corrupted/repaired).
2. **Evaluation set và ground-truth doc IDs:** `testset.py` sinh câu hỏi kèm sẵn `ground_truth` (đáp án đúng) và `ground_truth_doc_ids` (paper_id chứa đáp án đó). Khi evaluate, agent search top-k rồi so `retrieved_doc_ids` với `ground_truth_doc_ids` để tính `retrieval_hit_rate` (đo tìm đúng chỗ không), và so `answer` với `ground_truth` bằng token F1 + LLM judge (đo trả lời có đúng không).
3. **Quality checks khác freshness monitoring ở chỗ:** quality checks (`row_count`, `paper_id_not_null_unique`, `title_not_null`, `summary_length`, `freshness`) là tập hợp assertion PASS/FAIL độc lập trên toàn bộ dataframe, trả về 1 báo cáo `passed: true/false` tổng hợp. Freshness monitoring (`build_freshness_report`) là 1 report riêng, không PASS/FAIL từng dòng mà tổng hợp thống kê (`latest_published`, `oldest_published`, `stale_rows`) và 1 cờ `is_fresh` duy nhất — freshness vừa là 1 trong 5 quality check, vừa có báo cáo chi tiết riêng.
4. **Vì sao dùng cùng test set:** vì đây là biến kiểm soát của thí nghiệm — nếu đổi câu hỏi giữa 3 lần đo, chênh lệch metric có thể do câu hỏi khác nhau chứ không phải do chất lượng dữ liệu thay đổi, làm mất ý nghĩa so sánh nhân quả.
5. **Repair được xem là thành công dựa trên:** `data/quality/repaired.json` (`passed: true`, PASS cả 5/5 check) và `data/quality/freshness_report_repaired.json` (`is_fresh: true`) khớp lại đúng baseline; đồng thời `repaired_metrics.json` có `retrieval_hit_rate`/`mean_token_f1`/`judge_accuracy`/`mean_judge_score` bằng đúng (không phải gần đúng) giá trị trong `baseline_metrics.json` — chứng minh repair lấy lại đúng dữ liệu gốc, không phải một bản "tạm ổn".

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal          | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| ---------------------- | -------: | --------: | -------: | ------------------------- |
| `retrieval_hit_rate` |   1.0000 |    0.9167 |   1.0000 | Giảm ít (8.33%) vì chỉ 2/24 record bị drop/truncate đủ nặng để miss retrieval, phần lớn record khác vẫn nguyên vẹn |
| `mean_token_f1`      |   0.4263 |    0.3480 |   0.4263 | Baseline vốn đã không cao (0.43) vì answer rule-based chỉ trích 1 field, nên corruption làm giảm thêm rõ rệt theo tỷ lệ tương đối |
| `judge_accuracy`     |   0.3472 |    0.2778 |   0.3472 | Giảm cùng hướng token_f1, xác nhận LLM judge và token overlap đồng thuận |
| `mean_judge_score`   |   2.3611 |    2.1111 |   2.3611 | Điểm tuyệt đối thấp (thang 1-5) phản ánh giới hạn của answer rule-based hơn là lỗi do corruption riêng lẻ |
| Quality checks         | PASS 5/5 | FAIL (2/5 fail: uniqueness, validity, freshness) | PASS 5/5 | Repair phục hồi tuyệt đối, không có check nào còn FAIL |
| Freshness status       |    Fresh |     Stale (`stale_rows=2`) |     Fresh | `stale_published_date` là action duy nhất chạm tới freshness, đúng 1:1 với 2 record bị stale |

### Kết luận từ số liệu

1. Data corruption (`stale_published_date` đẩy 2 record về `2020-01-01`) → freshness signal đổi từ `is_fresh: true` sang `false` (`stale_rows: 0 → 2`) → không trực tiếp làm giảm `retrieval_hit_rate` (embedding vẫn đúng nghĩa, chỉ sai metadata ngày) nhưng là tín hiệu observability độc lập, bắt được lỗi mà agent metric không thấy.
2. Repair action (rebuild từ `crossref_records.json` gốc) → quality/freshness signal phục hồi hoàn toàn (`passed: true`, `is_fresh: true`) → agent metric phục hồi đúng giá trị baseline tuyệt đối, không phải "cải thiện gần bằng".

Corruption ảnh hưởng rõ nhất: `add_duplicate_rows` + `paper_id_not_null_unique` — vì đây là check duy nhất phản ứng ngay với 1 action đơn lẻ (duplicates: 0→2), dễ quy trách nhiệm nhân quả 1:1 nhất trong số 6 loại lỗi.

Kết quả khác kỳ vọng ban đầu: `title_not_null` vẫn PASS dù `truncate_title` đã cắt title xuống 5 ký tự — ban đầu nhóm kỳ vọng check này sẽ FAIL. Đã kiểm tra lại logic trong `quality.py`: check chỉ xét title rỗng/null, không xét độ dài tối thiểu, nên title "SafeR" (5 ký tự, non-empty) vẫn hợp lệ theo đúng định nghĩa hiện tại — đây là giới hạn thật của bộ check, không phải bug, đã ghi vào mục giới hạn của group report.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Về data pipeline: orchestration không chỉ là "gọi hàm đúng thứ tự" — thứ tự phụ thuộc giữa raw → clean → index → eval phải khớp với đúng những gì mỗi module thực sự ghi ra file, và phải có guard rõ ràng (như `_require_baseline`) khi 1 flow phụ thuộc artifact của flow trước.
2. Về data quality/observability: một bộ check PASS hết không đồng nghĩa dữ liệu hoàn hảo — `title_not_null` PASS dù title đã bị cắt hỏng cho thấy check chỉ tốt bằng đúng những gì nó thật sự đo (non-null/non-empty), không tự suy rộng ra "hợp lý".
3. Về ảnh hưởng của data tới RAG agent: retrieval và answer quality không giảm đều nhau theo cùng nguyên nhân — `retrieval_hit_rate` chỉ giảm khi corruption đủ nặng để lệch embedding hoặc mất document khỏi index, trong khi `mean_token_f1`/`judge_accuracy` nhạy hơn với nội dung text bị hỏng trực tiếp (blank/noise summary).

### Nếu có thêm thời gian

Sẽ thêm check độ dài tối thiểu cho `title` (tương tự `MIN_SUMMARY_CHARS` cho summary) trong `quality.py`, đo cải thiện bằng cách chạy lại `run_data_quality_checks` trên `papers_clean_corrupted.json` hiện có và xác nhận check mới chuyển từ PASS sang FAIL đúng như kỳ vọng ban đầu của nhóm.

## 10. Cam kết của thành viên

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi "đã chạy thành công" cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Nguyễn Văn Phong
**Ngày xác nhận:** 2026-08-06
