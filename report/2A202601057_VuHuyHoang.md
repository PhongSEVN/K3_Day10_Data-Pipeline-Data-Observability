# Member Role Report — Day 10: Data Pipeline & Data Observability

## 1. Thông tin cá nhân

| Thông tin         | Nội dung                  |
| ------------------ | -------------------------- |
| Họ và tên       | Vũ Huy Hoàng             |
| MSSV               | 2A202601057                     |
| Khóa/Lớp         | K3                         |
| Tên nhóm         | A3                         |
| Vai trò chính    | Corruption & repair owner                 |
| Repository         | `https://github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability` |
| Ngày hoàn thành | 2026-08-06                 |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách | Input nhận vào | Output bàn giao  | Trạng thái                                 |
| ------------------ | --------------------- | ---------------- | ----------------- | -------------------------------------------- |
| Corruption & repair | `src/ingestion/corruption.py` | `data/clean/papers_clean.json` (baseline) | Corruption scenarios (xóa record, blank summary, noise, truncate title, stale date, duplicate) + dữ liệu repair hợp lệ | Hoàn thành |

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động                         | Thành viên/module được hỗ trợ | Kết quả                    |
| ------------------------------------ | ------------------------------------ | ---------------------------- |
| Tích hợp quy trình kiểm thử Corruption & Repair | Nguyễn Văn Phong (Pipeline integration) | Đảm bảo luồng `corruption_flow.py` chạy tự động end-to-end và tạo đủ kết quả so sánh |
| Đánh giá chỉ số Observability | Lê Thị Yến Nhi (Observability owner) | Kiểm chứng các rule data quality & freshness phản ánh chính xác các sự cố dữ liệu bị corrupt |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện | File/hàm/artifact liên quan | Kết quả bàn giao       | Cách xác minh         |
| --------------------------- | ----------------------------- | ------------------------- | ----------------------- |
| Xây dựng module biến đổi và giả lập 6 dạng corruption | `src/ingestion/corruption.py` (`corrupt_clean_dataframe`) | `data/results/corruption_log.json` | `python script/run_corruption_flow.py` |
| Đo lường tác động của dữ liệu nhiễu và kiểm chứng phục hồi từ nguồn | `src/pipelines/corruption_flow.py` | `data/results/corrupted_metrics.json`, `data/results/repaired_metrics.json` | `data/reports/corruption_report.md` |

Nêu một output cụ thể mà phần việc của bạn tạo ra hoặc giúp xác minh:

File log `data/results/corruption_log.json` lưu vết toàn bộ 6 hành động tác động dữ liệu (xóa 2 dòng mới nhất, làm trống 2 summary, chèn noise vào 2 summary, xén 5 ký tự title của 2 dòng, biến 2 dòng thành stale date 2020-01-01, và nhân bản 2 dòng). Kết quả đo lường ghi nhận `retrieval_hit_rate` sụt giảm từ 1.000 xuống 0.667 và phục hồi trở lại 1.000 sau khi chạy repair khôi phục từ snapshot raw Crossref.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Phần việc của tôi giải quyết vấn đề đánh giá tính bền vững (resilience) của RAG agent và khả năng phát hiện lỗi dữ liệu của Data Observability framework. Trong thực tế, dữ liệu nguồn có thể bị thiếu trường, bị méo mó text, lỗi thời hoặc lặp record. Module corruption giả lập các tình huống này để chứng minh rằng chất lượng dữ liệu rác làm sụt giảm trực tiếp hiệu năng của RAG agent, đồng thời chứng minh quy trình repair đúng chuẩn từ nguồn đáng tin cậy sẽ khôi phục 100% chất lượng hệ thống.

### Cách triển khai

Viết hàm `corrupt_clean_dataframe(df: pd.DataFrame, output_log_path)` thực hiện chuỗi kịch bản biến đổi dữ liệu:
1. **Drop latest records:** Xóa 2 bản ghi mới nhất nhằm giả lập sự cố mất mát dữ liệu mới.
2. **Blank summary:** Đưa `summary` về chuỗi rỗng trên 2 bản ghi để mô phỏng lỗi trích xuất văn bản.
3. **Inject noise:** Thêm các chuỗi nhiễu không có ý nghĩa (`[CORRUPTED_NOISE_xyz123...]`) vào summary trên 2 bản ghi nhằm làm sai lệch vector không gian.
4. **Truncate title:** Xén tiêu đề chỉ còn 5 ký tự trên 2 bản ghi nhằm phá hỏng exact match và semantic match của tiêu đề.
5. **Stale date:** Đổi ngày xuất bản thành `2020-01-01` (`age_days` = 2400 ngày) trên 2 bản ghi nhằm kích hoạt cảnh báo staleness.
6. **Add duplicate rows:** Nhân bản 2 bản ghi nhằm mô phỏng dữ liệu bị lặp lại trong database.
7. **Rebuild embedding text:** Tự động tạo lại cột `text_for_embedding` dựa trên thông tin đã bị biến đổi cho toàn bộ dataframe trước khi đưa vào ChromaDB index.
8. **Export audit log:** Xuất file JSON ghi lại thời gian, danh sách hành động và thông tin từng record bị tác động.

### Input, output và contract

| Thành phần                   | Mô tả                                     |
| ------------------------------ | ------------------------------------------- |
| Input                          | `baseline_df` (`pd.DataFrame`) và đường dẫn `output_log_path` |
| Output                         | `corrupted_df` (`pd.DataFrame`) và file `corruption_log.json` |
| Module phụ thuộc             | `core.utils` (`now_utc`, `write_json`), `pandas` |
| Module sử dụng output        | `src/pipelines/corruption_flow.py`, `src/retrieval/index.py`, `src/observability/quality.py` |
| Điều kiện lỗi cần xử lý | Xử lý dataframe rỗng, cập nhật đồng bộ chiều dài chuỗi `summary_chars` và tái tạo `text_for_embedding` |

### Cách xác minh

```bash
python script/run_corruption_flow.py
```

- **Kết quả mong đợi:** Tái tạo thành công dữ liệu nhiễu, log file ghi đủ chi tiết, chất lượng dữ liệu báo `FAIL`, `retrieval_hit_rate` sụt giảm, và sau đó được khôi phục về 1.000 ở bước repair.
- **Kết quả thực tế:** `baseline_hit_rate` = 1.000, `corrupted_hit_rate` = 0.667, `repaired_hit_rate` = 1.000. Data quality chuyển từ PASS sang FAIL rồi trở lại PASS.
- **Artifact/log:** `data/results/corruption_log.json`, `data/results/corrupted_metrics.json`, `data/reports/corruption_report.md`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** Cần quyết định cách cập nhật trường `text_for_embedding` sau khi áp dụng các kịch bản biến đổi dữ liệu (blank summary, truncate title, noise).
- **Các phương án đã cân nhắc:**
  1. Chỉ cập nhật các cột thuộc tính độc lập (`title`, `summary`) mà không tái tạo lại cột `text_for_embedding`.
  2. Tự động tính toán và xây dựng lại cột `text_for_embedding` cho toàn bộ các dòng ngay trong hàm `corrupt_clean_dataframe`.
- **Phương án đã chọn:** Phương án 2 (Xây dựng lại `text_for_embedding` ngay trong quy trình corrupt).
- **Lý do:** ChromaDB vector index được tạo dựa trên nội dung của cột `text_for_embedding`. Nếu không rebuild cột này, embedding vectors trong ChromaDB vẫn mang ngữ nghĩa của dữ liệu sạch ban đầu, làm vô hiệu hóa tác động của kịch bản corruption lên kết quả retrieval.
- **Bằng chứng quyết định phù hợp:** Việc rebuild `text_for_embedding` khiến `retrieval_hit_rate` sụt giảm rõ rệt 33.3% (từ 1.000 xuống 0.667), thể hiện đúng bản chất của sự cố dữ liệu đối với mô hình Dense Retrieval.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** `NameError: name 'json' is not defined. Did you forget to import 'json'?` tại `src/ingestion/crossref.py` khi nạp dữ liệu snapshot raw records.
- **Lệnh hoặc bước tái hiện:** `python script/run_corruption_flow.py`
- **Nguyên nhân gốc:** File `src/ingestion/crossref.py` có gọi hàm `json.loads()` trong `load_raw_records` nhưng thiếu câu lệnh `import json` ở phần đầu file.
- **Cách xử lý:** Bổ sung `import json` vào đầu file `src/ingestion/crossref.py`.
- **Cách xác minh sau khi sửa:** Chạy lại `python script/run_corruption_flow.py`, chương trình thực thi thành công 100% không phát sinh lỗi.
- **Điều học được:** Luôn rà soát đầy đủ các module thuộc thư viện chuẩn của Python (standard library) khi thực hiện serialize/deserialize dữ liệu JSON.

## 7. Hiểu biết về luồng end-to-end

**Câu trả lời:**

1. **Dữ liệu đi từ Crossref đến vector index như thế nào?**
   Dữ liệu raw được fetch qua Crossref REST API -> lưu snapshot JSON tại `data/raw/` -> qua module cleaning để chuẩn hóa schema, tính `age_days` và tạo chuỗi `text_for_embedding` -> đưa qua model `sentence-transformers/all-MiniLM-L6-v2` để sinh vector embeddings -> lưu trữ và index trong ChromaDB persistent collection.

2. **Evaluation set và ground-truth document IDs dùng để đo retrieval/answer quality ra sao?**
   Evaluation set chứa các câu hỏi chuẩn được tạo từ tập dữ liệu sạch, mỗi câu hỏi có `ground_truth` đáp án và `ground_truth_doc_ids`. Khi đánh giá, agent truy vấn vector index để lấy top-k document context. Nếu `ground_truth_doc_ids` xuất hiện trong danh sách retrieved doc IDs thì `retrieval_hit` = True. Token F1 và LLM/Heuristic Judge sử dụng `ground_truth` để chấm điểm độ chính xác của câu trả lời.

3. **Quality checks khác freshness monitoring ở điểm nào trong bài lab?**
   Quality checks tập trung vào tính toàn vẹn và hợp lệ tĩnh của dữ liệu (schema validation, non-null `paper_id`, độ dài tối thiểu của `title` và `summary`, tính duy nhất không trùng lặp). Freshness monitoring tập trung vào thuộc tính động theo thời gian (đo `age_days` so với ngưỡng 180 ngày) để cảnh báo dữ liệu bị lỗi thời/stale.

4. **Vì sao phải dùng cùng test set cho baseline, corrupted và repaired?**
   Việc giữ nguyên test set cố định tạo ra một benchmark kiểm thử khách quan. Nhờ đó, mọi sự biến động của chỉ số (Hit Rate, Token F1, Judge Score) giữa 3 trạng thái chỉ phụ thuộc duy nhất vào sự thay đổi chất lượng dữ liệu và vector index, không bị ảnh hưởng bởi biến số độ khó của câu hỏi.

5. **Repair được xem là thành công dựa trên artifact và metric nào?**
   Repair thành công khi dữ liệu sạch được khôi phục lại từ raw snapshot: `overall_status` của quality checks trở lại `PASS`, status của freshness trở lại `Fresh`, chỉ số `retrieval_hit_rate` phục hồi từ 0.667 lên 1.000, và `mean_judge_score` phục hồi từ 3.67 lên 5.00 trong file `data/results/repaired_metrics.json` và `data/reports/corruption_report.md`.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal          | Baseline | Corrupted | Repaired | Nhận xét của cá nhân |
| ---------------------- | -------: | --------: | -------: | ------------------------- |
| `retrieval_hit_rate` |    1.0000 |    0.6667 |   1.0000 | Corruption làm giảm 33.3% khả năng truy xuất đúng tài liệu; repair khôi phục 100%. |
| `mean_token_f1`      |    1.0000 |    0.7072 |   1.0000 | Độ trùng khớp từ ngữ sụt giảm nghiêm trọng khi summary bị làm rỗng hoặc chèn nhiễu. |
| `judge_accuracy`     |    1.0000 |    0.6667 |   1.0000 | Tỷ lệ trả lời đúng của agent giảm tương ứng với retrieval hit rate. |
| `mean_judge_score`   |    5.0000 |    3.6667 |   5.0000 | Điểm chất lượng câu trả lời giảm từ 5.0 xuống 3.67 dưới tác động của dữ liệu hỏng. |
| Quality checks         |     PASS |      FAIL |     PASS | Hệ thống observability phát hiện chính xác các vi phạm tính duy nhất, độ dài và tươi mới. |
| Freshness status       |    Fresh |     Stale |    Fresh | Phát hiện chính xác 2 bản ghi bị lùi ngày xuất bản về 2020-01-01 (`age_days` = 2400). |

### Kết luận từ số liệu

Hoàn thành hai chuỗi nguyên nhân–bằng chứng sau:

1. **[Data corruption: Truncate title, Blank summary, Stale date, Add duplicate]** → **[Quality checks chuyển sang FAIL (2 duplicates, 4 invalid summaries/titles), Freshness is_fresh=False]** → **[Retrieval hit rate giảm từ 1.000 xuống 0.667, Mean judge score giảm từ 5.00 xuống 3.67]**.
2. **[Repair action: Nạp lại snapshot Crossref raw & làm sạch lại dữ liệu]** → **[Quality checks trở lại PASS, Freshness is_fresh=True]** → **[Retrieval hit rate phục hồi hoàn toàn về 1.000, Mean judge score phục hồi về 5.00]**.

Corruption nào ảnh hưởng rõ nhất và vì sao?

**Truncate title** và **Blank summary** ảnh hưởng rõ nhất tới hiệu năng retrieval. Lý do là các mô hình Dense Embedding như MiniLM phụ thuộc vào ngữ nghĩa toàn vẹn của văn bản. Khi summary bị rỗng hoặc tiêu đề bị cắt ngắn còn 5 ký tự, thông tin ngữ nghĩa bị phá hủy hoàn toàn khiến vector embedding bị lệch khoảng cách cosine similarity trong ChromaDB.

Kết quả nào khác với kỳ vọng ban đầu?

Số lượng dòng dữ liệu sau corruption tăng từ 10 lên 12 do kịch bản duplicate rows nhưng `retrieval_hit_rate` không tăng mà lại giảm. Giả thuyết: Việc nhân bản các dòng dữ liệu nhiễu khiến ChromaDB trả về các kết quả trùng lặp không hữu ích trong Top-K, lấn chiếm không gian của các tài liệu chính xác khác.

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. **Về Data Pipeline:** Pipeline không chỉ đơn thuần là đẩy dữ liệu từ nguồn vào DB mà phải có cơ chế Data Contract và Schema Validation nghiêm ngặt ở từng chặng.
2. **Về Data Observability:** Data Quality assertions và Freshness monitoring là tuyến phòng thủ bắt buộc để chủ động phát hiện sự cố dữ liệu trước khi ảnh hưởng đến sản phẩm cuối.
3. **Về ảnh hưởng của Data đến RAG Agent:** "Garbage in, Garbage out" — chất lượng của Vector Search và RAG Agent phụ thuộc trực tiếp 100% vào độ sạch và độ toàn vẹn của dữ liệu đầu vào.

### Nếu có thêm thời gian

Tôi sẽ tích hợp công cụ kiểm thử dữ liệu tự động Great Expectations (GX) vào ngay chặng Ingestion để tự động chặn (halt pipeline) và gửi cảnh báo khi phát hiện bất kỳ trường dữ liệu nào vi phạm schema trước khi ghi vào ChromaDB vector store.

## 10. Cam kết của thành viên

Đánh dấu sau khi tự kiểm tra:

- [x] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [x] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [x] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [x] Tôi không ghi "đã chạy thành công" cho phần chưa được kiểm chứng.
- [x] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [x] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Vũ Huy Hoàng  
**Ngày xác nhận:** 2026-08-06
