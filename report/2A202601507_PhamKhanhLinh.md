# Member Role Report — Day 10: Data Pipeline & Data Observability

> Mỗi thành viên trong nhóm tự hoàn thành mẫu này để báo cáo đúng vai trò, phần việc và mức hiểu của mình. Không sao chép nguyên báo cáo chung hoặc báo cáo của thành viên khác. Thay nội dung trong dấu `[ ]` và xóa các dòng hướng dẫn không cần thiết trước khi nộp.

## 1. Thông tin cá nhân

| Thông tin         | Nội dung                                                              |
| ------------------ | ---------------------------------------------------------------------- |
| Họ và tên       | Phạm Khánh Linh                                                      |
| MSSV               | 2A202601507                                                            |
| Khóa/Lớp         | K3                                                                     |
| Tên nhóm         | A3                                                                     |
| Vai trò chính    | Source owner                                                           |
| Repository         | https://github.com/PhongSEVN/K3_Day10_Data-Pipeline-Data-Observability |
| Ngày hoàn thành | 2026-08-06                                                             |

## 2. Vai trò và phạm vi công việc

### Phần việc sở hữu

| Module/deliverable | File/hàm phụ trách                                                                                      | Input nhận vào                                                                 | Output bàn giao                              | Trạng thái |
| ------------------ | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | --------------------------------------------- | ------------ |
| Raw ingestion      | `src/ingestion/crossref.py` (`fetch_source_records`, `parse_crossref_payload`, `load_raw_records`) | Crossref API (`https://api.crossref.org/works`), query/filter từ `Settings` | Raw response + raw records trong`data/raw/` | Hoàn thành |

Module tiếp theo trong pipeline (`src/ingestion/cleaning.py`, owner Nguyễn Thanh Phúc) nhận trực tiếp `data/raw/crossref_records.json` làm input; module repair trong `src/pipelines/corruption_flow.py` (owner Nguyễn Văn Phong) cũng đọc lại đúng file này để phục hồi dữ liệu ở Pha 2 — nên schema `PaperRecord` phải giữ ổn định trong suốt quá trình tích hợp.

### Việc hỗ trợ ngoài phạm vi chính

| Hoạt động | Thành viên/module được hỗ trợ | Kết quả |
| ------------ | ------------------------------------ | --------- |
| Không có   | —                                   | —        |

## 3. Kết quả theo vai trò

| Nhiệm vụ đã thực hiện                                                                                         | File/hàm/artifact liên quan                               | Kết quả bàn giao                                                                                                                                                                                  | Cách xác minh                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Implement`fetch_source_records`, `parse_crossref_payload`, `load_raw_records`                                 | `src/ingestion/crossref.py`                               | `data/raw/crossref_response.json` (raw response gốc, ~290 KB), `data/raw/crossref_records.json` (24 `PaperRecord` đã parse, ~58 KB)                                                         | Chạy`fetch_source_records(load_settings())` trực tiếp, nhận 24 record thật từ Crossref                                                       |
| Retry/backoff cho lỗi tạm thời                                                                                   | `_request_with_retry` trong `src/ingestion/crossref.py` | Tự động chờ 2s→4s→8s→16s→32s và thử lại khi gặp HTTP 429/503, tối đa 5 lần                                                                                                            | Unit test mock`requests.get` trả 429 hai lần rồi 200 lần thứ ba — xác nhận hàm gọi lại đúng 3 lần và trả về response thành công |
| Xác minh lại sau khi nhóm merge 5 PR (`nhi-observability`, `lin`, `hoang`, `phuc`, `client-dashboard`) | `src/ingestion/crossref.py`                               | Chạy lại`load_raw_records` + `load_settings()`, xác nhận vẫn đọc đúng 24 record, config (`max_results=24`, `top_k=4`, `freshness_threshold_days=180`) không bị đổi bởi merge | `python -m py_compile` pass, script kiểm tra chạy lại thành công                                                                              |

Output cụ thể phần việc của bạn tạo ra:

Chạy `fetch_source_records` với query mặc định (`agentic retrieval augmented generation large language model`, filter `from-pub-date:2026-02-07,has-abstract:true`, `rows=24`) trả về đúng 24 bản ghi hợp lệ. Ví dụ record đầu tiên: `paper_id=10.3390/buildings16132637`, `title="An Agentic AI System for Roof Design Compliance Using Computer Vision, Retrieval-Augmented Generation and Large Language Models"`, `authors=["Nawari O. Nawari", "Oluwatoyin O. Lawal"]`, `published=2026-07-02`. Đây là toàn bộ nguồn dữ liệu nuôi cả pipeline: cleaning, embedding/index, evaluation, quality/freshness và cả bước repair ở Pha 2 đều bắt nguồn từ 24 record này.

## 4. Giải thích phần kỹ thuật đã thực hiện

### Vấn đề cần giải quyết

Lấy metadata bài báo khoa học có DOI từ Crossref (API công khai) và chuẩn hóa về một schema record phẳng (`PaperRecord`) dùng chung cho toàn pipeline, đồng thời vẫn giữ lại response gốc để có thể audit ngược lại nguồn dữ liệu khi cần.

### Cách triển khai

- Gọi `GET https://api.crossref.org/works` với `query.bibliographic` (từ khóa tìm kiếm), `filter` (ràng buộc ngày xuất bản + bắt buộc có abstract) và `rows` (số lượng) lấy từ `Settings`.
- Bọc request trong `_request_with_retry`: nếu HTTP trả về 429 (rate limit) hoặc 503 (tạm thời không khả dụng) thì chờ theo cấp số nhân (2s, 4s, 8s, 16s, 32s) rồi thử lại, tối đa 5 lần; các mã lỗi khác raise ngay.
- Parse từng item trong `payload["message"]["items"]`:
  - Bỏ thẻ XML/JATS (`<jats:p>`, `<b>`...) khỏi `title`/`abstract` bằng regex.
  - Gộp `given` + `family` thành một chuỗi tên cho mỗi tác giả (Crossref lưu tên tác giả dưới dạng dict tách rời).
  - Chọn trường ngày xuất bản theo thứ tự ưu tiên `published` → `published-print` → `published-online` → `issued` vì không phải venue nào cũng có cùng một key.
  - Map `subject` (nếu có) thành `categories`; nhiều publisher không cung cấp trường này nên danh sách có thể rỗng hợp lệ.
  - Tìm link có `content-type == application/pdf` trong danh sách `link` để lấy `pdf_url` (có thể rỗng nếu bài bị khóa paywall).
  - Loại bản ghi thiếu DOI, thiếu title, hoặc abstract rỗng.
- Ghi hai artifact riêng biệt: response thô (để audit) và danh sách `PaperRecord` đã parse (để `cleaning.py` dùng tiếp).

### Input, output và contract

| Thành phần                   | Mô tả                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Input                          | `Settings` (query, filter, max_results, đường dẫn output) từ `core/config.py`                                                            |
| Output                         | `list[PaperRecord]`; đồng thời ghi `data/raw/crossref_response.json` và `data/raw/crossref_records.json`                                |
| Module phụ thuộc             | `core/config.py` (Settings, Paths), `core/utils.py` (`read_json`/`write_json`/`normalize_whitespace`)                                   |
| Module sử dụng output        | `src/ingestion/cleaning.py` (`build_clean_dataframe`), và `src/pipelines/corruption_flow.py` (đọc lại `raw_records_json` để repair) |
| Điều kiện lỗi cần xử lý | HTTP 429/503 (retry), item thiếu DOI/title/abstract (bỏ qua, không raise)                                                                      |

### Cách xác minh

```bash
python -c "
import sys; sys.path.insert(0, 'src')
from core.config import load_settings
from ingestion.crossref import fetch_source_records
records = fetch_source_records(load_settings())
print(len(records))
"
```

- **Kết quả mong đợi:** trả về danh sách `PaperRecord`, ghi được 2 file raw artifact.
- **Kết quả thực tế:** trả về 24 record; `data/raw/crossref_response.json` (~290 KB) và `data/raw/crossref_records.json` (~58 KB) được tạo đúng schema. Đã xác minh lại sau khi merge 5 PR của nhóm — kết quả không đổi.
- **Artifact/log:** `data/raw/crossref_response.json`, `data/raw/crossref_records.json`.

## 5. Một quyết định kỹ thuật quan trọng

- **Bối cảnh:** `PaperRecord.comment` vốn được thiết kế theo schema kiểu arXiv (ghi chú của tác giả), nhưng Crossref không có trường tương đương.
- **Các phương án đã cân nhắc:** (1) để `comment` luôn rỗng cho mọi record lấy từ Crossref; (2) tái sử dụng trường này để chứa `container-title` (tên tạp chí/nhà xuất bản).
- **Phương án đã chọn:** (2) — dùng `container-title` làm giá trị `comment`.
- **Lý do:** không phá vỡ contract `PaperRecord` mà các module khác (cleaning, index, quality) đang dùng chung; đồng thời không lãng phí một trường sẵn có trong schema khi Crossref thực tế có cung cấp thông tin tạp chí.
- **Bằng chứng quyết định phù hợp:** record `10.3390/buildings16132637` có `comment="Buildings"`, đúng tên tạp chí xuất bản bài báo đó, xác minh thủ công bằng cách đối chiếu `container-title` trong raw response.

## 6. Một lỗi hoặc blocker đã xử lý

- **Triệu chứng/lỗi nguyên văn:** `ssl.SSLCertVerificationError: [SSL: CERTIFICATE_VERIFY_FAILED] certificate verify failed: unable to get local issuer certificate` khi gọi `requests.get` tới `api.crossref.org`.
- **Lệnh hoặc bước tái hiện:** chạy `fetch_source_records(settings)` trong `.venv` vừa tạo trên máy Windows.
- **Nguyên nhân gốc:** Avast Antivirus bật SSL/TLS scanning (man-in-the-middle), tự phát hành cert riêng (`Avast Web/Mail Shield Root`) cho mọi kết nối HTTPS. Windows tin cert này (đã cài vào Certificate Store của hệ điều hành), nhưng Python dùng bundle `certifi` riêng (chỉ chứa CA công khai) nên không nhận diện được cert do Avast phát hành → xác minh SSL thất bại.
- **Cách xử lý:** cài `pip-system-certs` vào `.venv` để Python dùng Windows Certificate Store thay vì bundle `certifi` mặc định.
- **Cách xác minh sau khi sửa:** chạy lại `fetch_source_records`, nhận thành công 24 record từ Crossref, không còn lỗi SSL.
- **Điều học được:** lỗi SSL khi gọi API không phải lúc nào cũng là lỗi logic trong code — cần kiểm tra chuỗi chứng chỉ thực tế (`ssl.getpeercert()`) trước khi nghi ngờ phần request/retry. Đây cũng là vấn đề chung ảnh hưởng mọi HTTPS call trong venv (kể cả gọi LLM API), nên fix một lần ở tầng môi trường thay vì từng module. Đánh đổi cần lưu ý: `pip-system-certs` khiến Python tin mọi root cert mà Windows tin, phù hợp cho máy cá nhân, không nên dùng mù quáng trong môi trường production.

## 7. Hiểu biết về luồng end-to-end

Giải thích ngắn gọn bằng lời của bạn:

1. **Dữ liệu đi từ Crossref đến vector index như thế nào?** `crossref.py` gọi API lấy raw response, parse thành `PaperRecord` phẳng, lưu vào `data/raw/`. `cleaning.py` đọc các record này, chuẩn hóa text/ngày tháng, tính `age_days`, tạo cột `text_for_embedding`, dedupe theo `paper_id`, lưu vào `data/clean/`. `retrieval/index.py` đọc cleaned dataframe, dùng `MiniLMEmbeddings` (`sentence-transformers/all-MiniLM-L6-v2`) để encode `text_for_embedding` thành vector, rồi nạp vào một collection trong ChromaDB cùng metadata (title, authors, published...). Đây chính là mô hình ETL: Extract (`crossref.py`) → Transform (`cleaning.py`) → Load (`retrieval/index.py`), transform luôn chạy trước khi dữ liệu chạm vào ChromaDB.
2. **Evaluation set và ground-truth document IDs dùng để đo retrieval/answer quality ra sao?** `testset.py` sinh câu hỏi (summary/authors/date/categories) từ cleaned dataset, mỗi câu có `ground_truth` (đáp án đúng) và `ground_truth_doc_ids` (paper_id đúng lẽ ra phải được retrieve). Khi evaluate, hệ thống so `retrieved_doc_ids` của agent với `ground_truth_doc_ids` để tính `retrieval_hit_rate`, và so `answer` với `ground_truth` để tính `token_f1`/điểm giám khảo LLM.
3. **Quality checks khác freshness monitoring ở điểm nào?** Quality checks (`run_data_quality_checks`) kiểm tra tính toàn vẹn/hợp lệ của dữ liệu tại một thời điểm (row count, `paper_id` unique/not-null, độ dài `summary`...). Freshness monitoring (`build_freshness_report`) đo tính "mới" của dữ liệu theo thời gian, dựa trên `age_days`/`published` so với ngưỡng `freshness_threshold_days=180` để xác định dữ liệu có bị cũ (stale) hay không.
4. **Vì sao phải dùng cùng test set cho baseline, corrupted và repaired?** Để phép so sánh có ý nghĩa — nếu đổi câu hỏi giữa các lần đánh giá thì sự thay đổi metric có thể do câu hỏi khác nhau chứ không phải do chất lượng dữ liệu thay đổi. Giữ nguyên test set giúp cô lập biến duy nhất là trạng thái dữ liệu (sạch/lỗi/đã sửa). Trong code, `corruption_flow.py` luôn truyền cùng `settings.paths.eval_testset` cho cả 2 lần evaluate (corrupted và repaired).
5. **Repair được xem là thành công dựa trên artifact và metric nào?** Repair trong `corruption_flow.py` không sửa từ bản corrupted, mà đọc lại `data/raw/crossref_records.json` gốc và chạy lại `build_clean_dataframe` từ đầu — đây chính là lý do `repaired_metrics.json` khớp tuyệt đối với `baseline_metrics.json`. Repair coi là thành công khi metrics quay lại đúng baseline và quality/freshness report pass lại các check đã fail ở bản corrupted.

## 8. Phân tích kết quả

### Metrics chính

| Metric/signal                        |                   Baseline |                        Corrupted |                   Repaired | Nhận xét của cá nhân                                                                                                                                                                                      |
| ------------------------------------ | -------------------------: | -------------------------------: | -------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `retrieval_hit_rate`               |                      1.000 |                            0.917 |                      1.000 | Corruption (xóa 2 record mới nhất + duplicate) làm giảm khả năng retrieve đúng tài liệu; repair phục hồi hoàn toàn vì dựng lại đúng từ raw records mà bước ingestion của em đã lưu |
| `mean_token_f1`                    |                      0.426 |                            0.348 |                      0.426 | Giảm khi summary bị blank/nhiễu (2 record blank, 2 record noise) làm câu trả lời rule-based trong`qa.py` sai lệch                                                                                    |
| `judge_accuracy`                   |                      0.347 |                            0.278 |                      0.347 | Cùng xu hướng giảm với`token_f1`; điểm giám khảo LLM cũng phản ánh chất lượng câu trả lời kém đi khi dữ liệu lỗi                                                                      |
| `mean_judge_score`                 |                      2.361 |                            2.111 |                      2.361 | Nhất quán với 3 metric trên                                                                                                                                                                                |
| Quality checks (`paper_id` unique) |                       Pass |                             Fail |                       Pass | Corrupted có duplicate rows nên check`paper_id_not_null_unique` fail; repair dựng lại từ raw (đã dedupe trong `cleaning.py`) nên pass lại                                                         |
| Freshness status                     | `is_fresh=true`, 0 stale | `is_fresh=false`, 2 stale rows | `is_fresh=true`, 0 stale | Corruption cố tình đặt`published=2020-01-01` cho 2 record, vượt ngưỡng 180 ngày; repair khôi phục đúng ngày gốc                                                                               |

### Kết luận từ số liệu

1. **Data corruption → quality/freshness signal thay đổi → agent metric thay đổi:** corruption (drop 2 record, blank/nhiễu summary, cắt title, làm stale ngày, duplicate) khiến check `paper_id_not_null_unique` fail và `is_fresh` chuyển `false` (2 stale rows) → kéo theo `retrieval_hit_rate` giảm từ 1.0 xuống 0.917, `mean_token_f1`/`judge_accuracy`/`mean_judge_score` đều giảm.
2. **Repair action → quality/freshness signal phục hồi → agent metric phục hồi:** repair đọc lại raw records gốc (không sửa trên bản corrupted) và chạy lại `build_clean_dataframe` → mọi quality check pass lại, `is_fresh=true`, và cả 4 metric agent quay về **chính xác** giá trị baseline.

Corruption ảnh hưởng rõ nhất: **xóa record + duplicate + blank/nhiễu summary**, vì đây là các thay đổi tác động trực tiếp đến nội dung dùng để embedding (`text_for_embedding`), làm sai lệch cả bước retrieval lẫn bước trả lời.

Kết quả khác kỳ vọng ban đầu: không có — mức phục hồi 100% (repaired = baseline tuyệt đối) khớp đúng kỳ vọng vì pipeline không có yếu tố ngẫu nhiên (embedding model deterministic, LLM judge chạy `temperature=0.0`).

## 9. Điều học được và hướng cải thiện

### Ba điều quan trọng nhất

1. Nguồn dữ liệu bên thứ ba (Crossref) không đảm bảo đầy đủ mọi trường mong muốn (ví dụ `subject`/category thường bị thiếu ở toàn bộ 24/24 record, `pdf_url` chỉ có ở bài open access) — pipeline phải xử lý dữ liệu thiếu như một trường hợp bình thường, không phải lỗi.
2. Lưu raw response gốc tách biệt với record đã parse rất quan trọng cho observability và cả cho repair: bước repair ở Pha 2 hoàn toàn phụ thuộc vào việc `data/raw/crossref_records.json` còn nguyên vẹn — nếu ingestion lưu sai, cả bước repair sẽ hỏng theo.
3. Lỗi môi trường (SSL do antivirus chặn) có thể trông giống lỗi logic trong code nếu không kiểm tra kỹ tầng network trước — cần phân biệt rõ lỗi setup máy với lỗi thật trong implementation.

### Nếu có thêm thời gian

Thêm header `mailto` (polite pool) khi gọi Crossref API để được ưu tiên rate-limit tốt hơn, và lưu thêm timestamp lúc fetch vào raw artifact để việc audit nguồn dữ liệu chính xác hơn (hiện đang dùng mtime của file làm proxy). Ngoài ra có thể thêm dedupe theo `paper_id` ngay ở bước parse để phòng trường hợp Crossref trả về item trùng DOI.

## 10. Cam kết của thành viên

Đánh dấu sau khi tự kiểm tra:

- [X] Nội dung báo cáo phản ánh đúng phần việc và mức hiểu của tôi.
- [X] Tôi có thể giải thích luồng end-to-end, không chỉ module mình phụ trách.
- [X] Mọi kết luận về kết quả đều có artifact hoặc metric để đối chiếu.
- [X] Tôi không ghi "đã chạy thành công" cho phần chưa được kiểm chứng.
- [X] Báo cáo không chứa `.env`, API key, token hoặc secret.
- [X] Báo cáo này không phải bản sao nguyên văn của báo cáo nhóm hoặc báo cáo thành viên khác.

**Họ và tên:** Phạm Khánh Linh
**Ngày xác nhận:** [2026-08-06]
