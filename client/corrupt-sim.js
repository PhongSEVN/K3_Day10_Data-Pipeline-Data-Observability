(() => {
  "use strict";

  // Each transform below reproduces one corruption type from
  // src/ingestion/corruption.py exactly (same field mutations, same constants).
  // Unlike the Python function (fixed pipeline, always all 6, index-based),
  // this lab randomly selects a subset (>= MIN_TYPES) each run so every run
  // looks different — each selected type still gets its own dedicated real
  // records from the pool, no overlap between types.
  const MIN_SUMMARY_CHARS = 20; // src/observability/quality.py
  const FRESHNESS_THRESHOLD_DAYS = 180; // src/core/config.py
  const NOISE_STR = " [CORRUPTED_NOISE_xyz123_invalid_garbled_data_stream] ";
  const MIN_TYPES = 3;

  const CORRUPTION_TYPES = [
    { key: "drop_latest_records", label: "Drop record" },
    { key: "blank_summary", label: "Blank summary" },
    { key: "inject_noise", label: "Inject noise" },
    { key: "truncate_title", label: "Truncate title" },
    { key: "stale_published_date", label: "Stale date" },
    { key: "add_duplicate_rows", label: "Duplicate rows" },
  ];

  const MOCK_BATCH = [
    { paper_id: "10.1000/mock-a", title: "Agentic RAG for Scientific Literature Retrieval", summary: "We propose an agentic RAG pipeline combining semantic retrieval with tool-augmented reasoning for multi-hop questions.", authors_joined: "A. Nguyen", categories_joined: "cs.AI", published: "2026-06-01", age_days: 20 },
    { paper_id: "10.1000/mock-b", title: "Freshness Monitoring for Continuous Ingestion Pipelines", summary: "Automated freshness detection tracks publication age and staleness thresholds across academic data streams.", authors_joined: "B. Tran", categories_joined: "cs.DB", published: "2026-05-20", age_days: 32 },
    { paper_id: "10.1000/mock-c", title: "Vector Index Resilience Against Corrupted Metadata", summary: "We evaluate how truncated titles and blank summaries impact semantic retrieval and answer quality.", authors_joined: "C. Le", categories_joined: "cs.IR", published: "2026-05-15", age_days: 37 },
    { paper_id: "10.1000/mock-d", title: "Data Quality Assertions for Production RAG Systems", summary: "A study on completeness, uniqueness, and validity checks applied to vector database ingestion.", authors_joined: "D. Pham", categories_joined: "cs.SE", published: "2026-05-10", age_days: 42 },
    { paper_id: "10.1000/mock-e", title: "Deduplication Strategies for Noise-Resilient Vector Stores", summary: "Preventing duplicated records from dominating top-k search results in vector database collections.", authors_joined: "E. Vo", categories_joined: "cs.IR", published: "2026-04-28", age_days: 54 },
    { paper_id: "10.1000/mock-f", title: "LLM-as-Judge Protocols for Answer Quality Assessment", summary: "Using structured LLM outputs to grade answer correctness before and after data pipeline remediation.", authors_joined: "F. Bui", categories_joined: "cs.CL", published: "2026-04-20", age_days: 62 },
    { paper_id: "10.1000/mock-g", title: "Lineage Tracking for Scholarly Vector Observability", summary: "Tracking raw records from source ingestion to embedding manifests and evaluation report metrics.", authors_joined: "G. Do", categories_joined: "cs.DB", published: "2026-04-10", age_days: 72 },
    { paper_id: "10.1000/mock-h", title: "Impact of Stale Publication Dates on Retrieval Trust", summary: "Analyzing how outdated documents affect freshness signals and downstream agent trustworthiness.", authors_joined: "H. Ngo", categories_joined: "cs.IR", published: "2026-03-30", age_days: 83 },
    { paper_id: "10.1000/mock-i", title: "Contrastive Fine-Tuning for Domain-Specific Retrieval", summary: "Contrastive objectives improve dense retrieval accuracy for narrow scientific domains with limited labeled data.", authors_joined: "I. Mai", categories_joined: "cs.CL", published: "2026-03-15", age_days: 98 },
    { paper_id: "10.1000/mock-j", title: "Reproducibility Standards for Agentic RAG Benchmarks", summary: "Proposing a checklist to make agentic RAG evaluation results comparable and reproducible across labs.", authors_joined: "J. Cao", categories_joined: "cs.SE", published: "2026-03-01", age_days: 112 },
    { paper_id: "10.1000/mock-k", title: "Multi-Hop Question Answering Over Scientific Corpora", summary: "Evaluating multi-hop reasoning chains for question answering over scholarly document collections.", authors_joined: "K. Ha", categories_joined: "cs.CL", published: "2026-02-20", age_days: 121 },
    { paper_id: "10.1000/mock-l", title: "Cost-Aware LLM Routing for Production RAG Pipelines", summary: "Routing queries between cheap and expensive LLMs based on estimated question difficulty to control cost.", authors_joined: "L. Duong", categories_joined: "cs.DC", published: "2026-02-05", age_days: 136 },
  ];

  function normalizeWhitespace(s) {
    return String(s || "").replace(/\s+/g, " ").trim();
  }

  function tokenF1(reference, prediction) {
    const refTokens = normalizeWhitespace(reference).toLowerCase().split(" ").filter(Boolean);
    const predTokens = normalizeWhitespace(prediction).toLowerCase().split(" ").filter(Boolean);
    if (!refTokens.length || !predTokens.length) return 0;
    const refSet = new Set(refTokens);
    const predSet = new Set(predTokens);
    const overlap = [...refSet].filter((t) => predSet.has(t)).length;
    if (overlap === 0) return 0;
    const precision = overlap / predSet.size;
    const recall = overlap / refSet.size;
    return (2 * precision * recall) / (precision + recall);
  }

  function textForEmbedding(row) {
    return `Title: ${row.title}\nAuthors: ${row.authors_joined}\nCategories: ${row.categories_joined}\nPublished: ${row.published}\nSummary: ${row.summary}`;
  }

  async function fetchJson(path) {
    const res = await fetch(path, { cache: "no-store" });
    if (!res.ok) throw new Error(`${path} -> ${res.status}`);
    return res.json();
  }

  async function loadPool() {
    try {
      const clean = await fetchJson("../data/clean/papers_clean.json");
      if (Array.isArray(clean) && clean.length >= 2) {
        return { rows: clean.map((r) => ({ ...r })), isMock: false };
      }
      throw new Error("empty");
    } catch (err) {
      return { rows: MOCK_BATCH.map((r) => ({ ...r })), isMock: true };
    }
  }

  async function loadTestSet() {
    try {
      const testSet = await fetchJson("../data/eval/test_set.json");
      return Array.isArray(testSet) ? testSet : [];
    } catch (err) {
      return [];
    }
  }

  function shuffled(arr) {
    const copy = arr.slice();
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  function pickCorruptionTypes() {
    const maxCount = CORRUPTION_TYPES.length;
    const count = MIN_TYPES + Math.floor(Math.random() * (maxCount - MIN_TYPES + 1)); // MIN_TYPES..6
    return shuffled(CORRUPTION_TYPES).slice(0, count);
  }

  // ---------- run a random subset of corruption.py's 6 transforms ----------
  function runCorruption(pool) {
    let selected = pickCorruptionTypes();
    let neededRows = selected.length * 2;

    if (pool.length < neededRows) {
      const maxTypesForPool = Math.max(MIN_TYPES, Math.floor(pool.length / 2));
      selected = shuffled(selected).slice(0, Math.min(selected.length, maxTypesForPool));
      neededRows = selected.length * 2;
    }

    const orderedSelected = CORRUPTION_TYPES.filter((t) => selected.some((s) => s.key === t.key));
    const shuffledPool = shuffled(pool);
    let cursor = 0;
    const reserved = {};
    const originals = {}; // paper_id -> pristine clone, captured before any mutation
    orderedSelected.forEach((t) => {
      reserved[t.key] = shuffledPool.slice(cursor, cursor + 2).map((r) => ({ ...r }));
      reserved[t.key].forEach((r) => { originals[r.paper_id] = { ...r }; });
      cursor += 2;
    });

    const log = { actions: [], applied_types: orderedSelected.map((t) => t.key), original_row_count: neededRows };
    let working = [];

    orderedSelected.forEach((t) => {
      const rows = reserved[t.key];
      switch (t.key) {
        case "drop_latest_records":
          log.actions.push({ type: "drop_latest_records", count: rows.length, dropped_paper_ids: rows.map((r) => r.paper_id) });
          break;
        case "blank_summary":
          rows.forEach((r) => { r.summary = ""; r.summary_chars = 0; });
          log.actions.push({ type: "blank_summary", paper_ids: rows.map((r) => r.paper_id) });
          working.push(...rows);
          break;
        case "inject_noise":
          rows.forEach((r) => {
            const orig = r.summary;
            r.summary = `${NOISE_STR} ${orig.slice(0, 30)} ${NOISE_STR}`;
            r.summary_chars = r.summary.length;
          });
          log.actions.push({ type: "inject_noise", paper_ids: rows.map((r) => r.paper_id) });
          working.push(...rows);
          break;
        case "truncate_title":
          rows.forEach((r) => { r.original_title = r.title; r.title = r.title.slice(0, 5); });
          log.actions.push({ type: "truncate_title", paper_ids: rows.map((r) => r.paper_id) });
          working.push(...rows);
          break;
        case "stale_published_date":
          rows.forEach((r) => { r.published = "2020-01-01"; r.age_days = 2400; });
          log.actions.push({ type: "stale_published_date", paper_ids: rows.map((r) => r.paper_id) });
          working.push(...rows);
          break;
        case "add_duplicate_rows": {
          working.push(...rows);
          const dup = rows.map((r) => ({ ...r }));
          working.push(...dup);
          log.actions.push({ type: "add_duplicate_rows", count: rows.length, duplicated_paper_ids: rows.map((r) => r.paper_id) });
          break;
        }
      }
    });

    working = working.map((r) => ({ ...r, text_for_embedding: textForEmbedding(r) }));
    log.final_row_count = working.length;

    const untouched = CORRUPTION_TYPES.filter((t) => !orderedSelected.some((s) => s.key === t.key));
    return { rows: working, log, untouched, originals };
  }

  // Mirrors qa.py's _extract_answer — which metadata field actually answers each
  // question_type. Comparing ground_truth against the wrong field (e.g. the whole
  // text_for_embedding block) makes token_f1 meaningless across question types.
  function answerFieldFor(row, questionType) {
    switch (questionType) {
      case "summary": return row.summary || "";
      case "authors": return row.authors_joined || "";
      case "date": return row.published || "";
      case "categories": return row.categories_joined || "";
      default: return textForEmbedding(row);
    }
  }

  // ---------- quality checks, mirrors src/observability/quality.py ----------
  function runQualityChecks(rows) {
    const rowCount = rows.length;
    const checks = [];

    checks.push({ name: "row_count", dimension: "completeness", passed: rowCount > 0, detail: { row_count: rowCount } });

    const missingIds = rows.filter((r) => !r.paper_id).length;
    const counts = {};
    rows.forEach((r) => { counts[r.paper_id] = (counts[r.paper_id] || 0) + 1; });
    const duplicates = Object.values(counts).reduce((sum, c) => sum + Math.max(0, c - 1), 0);
    checks.push({ name: "paper_id_not_null_unique", dimension: "uniqueness", passed: missingIds === 0 && duplicates === 0, detail: { missing: missingIds, duplicates } });

    const titleMissing = rows.filter((r) => !r.title || !String(r.title).trim()).length;
    checks.push({ name: "title_not_null", dimension: "completeness", passed: titleMissing === 0, detail: { missing: titleMissing } });

    const tooShort = rows.filter((r) => String(r.summary || "").length < MIN_SUMMARY_CHARS).length;
    checks.push({ name: "summary_length", dimension: "validity", passed: tooShort === 0, detail: { below_min_chars: tooShort, min_chars: MIN_SUMMARY_CHARS } });

    const stale = rows.filter((r) => Number(r.age_days ?? 0) > FRESHNESS_THRESHOLD_DAYS).length;
    checks.push({ name: "freshness", dimension: "freshness", passed: stale === 0, detail: { stale_rows: stale, threshold_days: FRESHNESS_THRESHOLD_DAYS } });

    return { checks, passed: checks.every((c) => c.passed) };
  }

  function statusBadge(passed) {
    const badge = document.createElement("span");
    badge.className = `status-badge ${passed ? "pass" : "fail"}`;
    const dot = document.createElement("span");
    dot.className = "status-dot";
    dot.style.background = passed ? "var(--status-good)" : "var(--status-critical)";
    const label = document.createElement("span");
    label.textContent = passed ? "PASS" : "FAIL";
    badge.append(dot, label);
    return badge;
  }

  function renderQuality(container, before, after, repaired) {
    container.innerHTML = "";
    const cards = [
      { label: "Trước corruption (record được chọn)", result: before },
      { label: "Sau corruption (lỗi đã áp dụng)", result: after },
    ];
    if (repaired) cards.push({ label: "Sau repair (rebuild từ nguồn gốc)", result: repaired });
    cards.forEach(({ label, result }) => {
      const card = document.createElement("div");
      card.className = "state-card";
      const header = document.createElement("div");
      header.className = "state-card-header";
      const h3 = document.createElement("h3");
      h3.textContent = label;
      header.appendChild(h3);
      header.appendChild(statusBadge(result.passed));
      card.appendChild(header);

      const list = document.createElement("ul");
      list.className = "check-list";
      result.checks.forEach((check) => {
        const li = document.createElement("li");
        const dot = document.createElement("span");
        dot.className = "check-dot";
        dot.style.background = check.passed ? "var(--status-good)" : "var(--status-critical)";
        const text = document.createElement("span");
        text.textContent = `${check.name} (${check.dimension}): ${check.passed ? "pass" : "fail"} — ${JSON.stringify(check.detail)}`;
        li.append(dot, text);
        list.appendChild(li);
      });
      card.appendChild(list);
      container.appendChild(card);
    });
  }

  function renderAppliedTypes(container, log, untouched) {
    const line = document.createElement("p");
    line.className = "story-note";
    const appliedLabels = log.applied_types.map((key) => CORRUPTION_TYPES.find((t) => t.key === key).label);
    const untouchedLabels = untouched.map((t) => t.label);
    line.innerHTML = `<strong>${appliedLabels.length}/6 loại lỗi áp dụng lần này:</strong> ${appliedLabels.join(", ")}.` +
      (untouchedLabels.length ? ` <em>Không áp dụng: ${untouchedLabels.join(", ")}.</em>` : "");
    container.appendChild(line);
  }

  // Which question_type actually gets hurt by each corruption type — matches
  // qa.py's _extract_answer routing (summary -> summary field, authors ->
  // authors_joined, date -> published, categories -> categories_joined).
  // truncate_title touches none of those fields; its damage is at the
  // retrieval/title-lookup layer, not the extracted-answer text, so it gets a
  // textual explanation instead of a token_f1 number that would misleadingly
  // look "unchanged".
  const RELEVANT_QUESTION_TYPE = {
    blank_summary: "summary",
    inject_noise: "summary",
    stale_published_date: "date",
  };

  function renderImpact(container, corruptedRows, log, testSet, originals, repaired) {
    container.innerHTML = "";
    renderAppliedTypes(container, log, []);

    Object.entries(RELEVANT_QUESTION_TYPE).forEach(([actionType, relevantType]) => {
      const action = log.actions.find((a) => a.type === actionType);
      if (!action) return;

      action.paper_ids.forEach((paperId) => {
        const corruptedRow = corruptedRows.find((r) => r.paper_id === paperId);
        const originalRow = originals[paperId];
        if (!corruptedRow || !originalRow) return;

        const questions = testSet.filter(
          (q) => (q.ground_truth_doc_ids || []).includes(paperId) && q.question_type === relevantType
        );
        const row = document.createElement("div");
        row.className = "impact-row";
        const title = document.createElement("div");
        title.className = "impact-title";
        title.innerHTML = `<code>${actionType}</code> — paper_id <code>${paperId}</code> — chỉ ảnh hưởng câu hỏi loại <code>${relevantType}</code>`;
        row.appendChild(title);

        if (!questions.length) {
          const note = document.createElement("p");
          note.className = "story-note";
          note.textContent = `Không có câu hỏi loại "${relevantType}" trong test_set.json tham chiếu record này để đo.`;
          row.appendChild(note);
          container.appendChild(row);
          return;
        }

        questions.forEach((q) => {
          const before = tokenF1(q.ground_truth, answerFieldFor(originalRow, q.question_type));
          const after = tokenF1(q.ground_truth, answerFieldFor(corruptedRow, q.question_type));
          const delta = after - before;
          const line = document.createElement("div");
          line.className = "impact-score-line";
          let scoreHtml = `token_f1: ${before.toFixed(3)} → ${after.toFixed(3)} <strong class="${delta < -0.05 ? "impact-down" : "impact-flat"}">${delta < -0.05 ? "↓" : "="} ${delta.toFixed(3)}</strong>`;
          if (repaired) {
            const repairedRow = repaired.find((r) => r.paper_id === paperId) || originalRow;
            const repairedScore = tokenF1(q.ground_truth, answerFieldFor(repairedRow, q.question_type));
            scoreHtml += ` → repair <strong class="impact-up">${repairedScore.toFixed(3)}</strong>`;
          }
          line.innerHTML = `<span class="impact-q">"${q.question.slice(0, 70)}${q.question.length > 70 ? "…" : ""}"</span>
            <span class="impact-score">${scoreHtml}</span>`;
          row.appendChild(line);
        });

        container.appendChild(row);
      });
    });

    const truncateAction = log.actions.find((a) => a.type === "truncate_title");
    if (truncateAction) {
      const row = document.createElement("div");
      row.className = "impact-row";
      row.innerHTML = `<div class="impact-title"><code>truncate_title</code> — paper_id ${truncateAction.paper_ids.join(", ")}</div>
        <p class="story-note">Không có câu hỏi nào hỏi trực tiếp về title nên token_f1 của summary/authors/date không đổi.
        Tác động thật nằm ở chỗ khác: <code>text_for_embedding</code> đổi dòng <code>Title: ...</code> nên vector embedding lệch,
        và câu hỏi trích title gốc trong dấu <code>'...'</code> để lookup chính xác (<code>qa.py</code> regex) sẽ không match nữa —
        agent phải rơi về semantic search, dễ trật ground truth doc hơn.${repaired ? " Sau repair, title trả về đúng bản gốc, exact-lookup hoạt động lại bình thường." : ""}</p>`;
      container.appendChild(row);
    }

    const dropAction = log.actions.find((a) => a.type === "drop_latest_records");
    if (dropAction) {
      const row = document.createElement("div");
      row.className = "impact-row";
      row.innerHTML = `<div class="impact-title"><code>drop_latest_records</code> — ${dropAction.dropped_paper_ids.length} record biến mất khỏi index</div>
        <p class="story-note">Nếu test set có câu hỏi ground-truth trỏ vào <code>${dropAction.dropped_paper_ids.join(", ")}</code>, câu đó sẽ hit_rate = 0 tuyệt đối — không tài liệu nào để tìm.${repaired ? " Sau repair, record được đưa trở lại index — vì rebuild lấy toàn bộ record từ raw source, không phải chỉ vá phần bị xóa." : ""}</p>`;
      container.appendChild(row);
    }

    const dupAction = log.actions.find((a) => a.type === "add_duplicate_rows");
    if (dupAction) {
      const row = document.createElement("div");
      row.className = "impact-row";
      row.innerHTML = `<div class="impact-title"><code>add_duplicate_rows</code> — ${dupAction.duplicated_paper_ids.length} record bị nhân đôi trong index</div>
        <p class="story-note">paper_id <code>${dupAction.duplicated_paper_ids.join(", ")}</code> giờ chiếm 2 slot trong top-k thay vì 1 — làm giảm cơ hội tài liệu khác được retrieve.${repaired ? " Sau repair, record chỉ còn đúng 1 bản — rebuild dedupe theo paper_id như cleaning.py thật làm." : ""}</p>`;
      container.appendChild(row);
    }
  }

  async function init() {
    const runBtn = document.getElementById("lab-run");
    const repairBtn = document.getElementById("lab-repair");
    const resetBtn = document.getElementById("lab-reset");
    const statusEl = document.getElementById("lab-status");
    const qualityEl = document.getElementById("lab-quality");
    const impactEl = document.getElementById("lab-impact");
    const repairStatusEl = document.getElementById("lab-repair-status");
    const repairQualityEl = document.getElementById("lab-repair-quality");
    const repairImpactEl = document.getElementById("lab-repair-impact");
    if (!runBtn) return; // only present on story.html

    const [{ rows: pool, isMock }, testSet] = await Promise.all([loadPool(), loadTestSet()]);

    let lastRun = null; // { before, corrupted, after, log, originals }

    const readyText = () =>
      isMock
        ? `Sẵn sàng — pool ${pool.length} record mock (không fetch được data/clean/papers_clean.json thật, chạy qua http server để dùng data thật). Mỗi lần "Chạy" sẽ random tối thiểu ${MIN_TYPES}/6 loại lỗi.`
        : `Sẵn sàng — pool ${pool.length} record thật từ data/clean/papers_clean.json. Mỗi lần "Chạy" sẽ random tối thiểu ${MIN_TYPES}/6 loại lỗi.`;

    statusEl.textContent = readyText();

    function reset() {
      lastRun = null;
      repairBtn.disabled = true;
      qualityEl.innerHTML = "";
      impactEl.innerHTML = "";
      repairQualityEl.innerHTML = "";
      repairImpactEl.innerHTML = "";
      statusEl.textContent = readyText();
      repairStatusEl.textContent = "Chưa repair — chạy mô phỏng ở mục 07b trước.";
    }

    runBtn.addEventListener("click", () => {
      const { rows: corrupted, log, originals } = runCorruption(pool);
      // Compare against the pristine version of the SAME batch that got
      // touched, not the whole 24-record pool — otherwise row_count alone
      // (24 vs 6-12) makes the diff look broken instead of showing what
      // corruption actually changed.
      const before = runQualityChecks(Object.values(originals));
      const after = runQualityChecks(corrupted);
      lastRun = { before, corrupted, after, log, originals };
      repairBtn.disabled = false;
      repairQualityEl.innerHTML = "";
      repairImpactEl.innerHTML = "";

      statusEl.textContent = `Chạy xong: ${log.applied_types.length}/6 loại lỗi, ${log.original_row_count} → ${log.final_row_count} record bị chạm. Cuộn xuống mục 09 để repair đúng batch này.`;
      repairStatusEl.textContent = "Sẵn sàng repair batch vừa chạy — bấm nút bên trên.";
      renderQuality(qualityEl, before, after);
      renderImpact(impactEl, corrupted, log, testSet, originals);
    });

    repairBtn.addEventListener("click", () => {
      if (!lastRun) return;
      // Repair = rebuild from the trusted pristine originals (mirrors
      // corruption_flow.py rebuilding clean_dataframe from crossref_records.json)
      // rather than patching whatever corruption did in place.
      const repairedRows = Object.values(lastRun.originals);
      const repairedQuality = runQualityChecks(repairedRows);

      repairStatusEl.textContent = `Repair xong: ${repairedRows.length} record rebuild từ bản gốc, thay vì vá bản đã hỏng.`;
      renderQuality(repairQualityEl, lastRun.before, lastRun.after, repairedQuality);
      renderImpact(repairImpactEl, lastRun.corrupted, lastRun.log, testSet, lastRun.originals, repairedRows);
    });

    resetBtn.addEventListener("click", reset);
  }

  init();
})();
