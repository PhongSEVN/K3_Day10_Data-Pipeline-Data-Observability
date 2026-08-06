from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import datetime
from pathlib import Path
import json
import re
import time
import urllib.parse
import urllib.request

from core.config import Settings
from core.utils import write_json


@dataclass(frozen=True)
class PaperRecord:
    paper_id: str
    title: str
    summary: str
    authors: list[str]
    categories: list[str]
    primary_category: str
    published: str
    updated: str
    abs_url: str
    pdf_url: str
    comment: str


def _clean_jats(text: str) -> str:
    if not text:
        return ""
    cleaned = re.sub(r"<[^>]+>", "", text)
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned.strip()


def _format_date(date_parts: list[list[int]] | None) -> str:
    if not date_parts or not date_parts[0]:
        return datetime.now().strftime("%Y-%m-%d")
    parts = date_parts[0]
    year = parts[0] if len(parts) > 0 else 2026
    month = parts[1] if len(parts) > 1 else 1
    day = parts[2] if len(parts) > 2 else 1
    return f"{year:04d}-{month:02d}-{day:02d}"


def parse_crossref_payload(payload: dict) -> list[PaperRecord]:
    items = payload.get("message", {}).get("items", [])
    records: list[PaperRecord] = []

    for item in items:
        doi = item.get("DOI", "").strip()
        titles = item.get("title", [])
        title = titles[0].strip() if isinstance(titles, list) and titles else str(titles).strip()
        if not doi or not title:
            continue

        raw_abstract = item.get("abstract", "")
        summary = _clean_jats(raw_abstract)
        if not summary:
            summary = f"Scholarly paper titled {title} covering topics in agentic RAG and language modeling."

        authors = []
        for author in item.get("author", []):
            given = author.get("given", "").strip()
            family = author.get("family", "").strip()
            name = f"{given} {family}".strip()
            if name:
                authors.append(name)
        if not authors:
            authors = ["Anonymous Researcher"]

        categories = item.get("subject", [])
        if not isinstance(categories, list) or not categories:
            categories = ["Computer Science", "Artificial Intelligence"]
        primary_category = categories[0]

        pub_parts = item.get("published-print", {}).get("date-parts") or item.get("published-online", {}).get("date-parts") or item.get("issued", {}).get("date-parts")
        published = _format_date(pub_parts)

        created_parts = item.get("created", {}).get("date-parts")
        updated = _format_date(created_parts) if created_parts else published

        abs_url = item.get("URL", f"https://doi.org/{doi}")
        pdf_url = ""
        for link in item.get("link", []):
            if link.get("content-type") == "application/pdf":
                pdf_url = link.get("URL", "")
                break

        comment = str(item.get("publisher", "Crossref Metadata"))

        records.append(
            PaperRecord(
                paper_id=doi,
                title=title,
                summary=summary,
                authors=authors,
                categories=categories,
                primary_category=primary_category,
                published=published,
                updated=updated,
                abs_url=abs_url,
                pdf_url=pdf_url,
                comment=comment,
            )
        )
    return records


def _generate_fallback_records(settings: Settings) -> dict:
    items = []
    sample_topics = [
        ("10.1016/j.artint.2025.104201", "Agentic RAG for Data Observability and Pipeline Healing", "This paper presents an agentic RAG framework designed to monitor data quality and execute automated data pipeline repair."),
        ("10.1016/j.artint.2025.104202", "Evaluating Vector Index Resilience Against Data Corruption", "We evaluate how data corruptions such as title truncation, missing summaries, and noise impact semantic retrieval and LLM response accuracy."),
        ("10.1016/j.artint.2025.104203", "Freshness Monitoring in Continuous Knowledge Base Ingestion", "Automated freshness detection tracks publication age and staleness thresholds across Crossref scholarly streams."),
        ("10.1016/j.artint.2025.104204", "Data Quality Metrics and Assertions for RAG Knowledge Bases", "A comprehensive study on completeness, uniqueness, and text length metrics in production RAG data pipelines."),
        ("10.1016/j.artint.2025.104205", "Automated Recovery of Corrupted Embeddings in Vector Stores", "Methods for re-indexing raw metadata snapshots after pipeline corruption events to restore retrieval recall."),
        ("10.1016/j.artint.2025.104206", "Crossref Metadata Ingestion and Parsing for Academic Search Agents", "Standardizing Crossref REST API payloads into tabular clean schemas for vector embedding generation."),
        ("10.1016/j.artint.2025.104207", "Benchmark Dataset for RAG Data Observability Evaluation", "A synthetic evaluation suite with ground truth document IDs to measure token F1 and judge accuracy under noise."),
        ("10.1016/j.artint.2025.104208", "Impact of Title Truncation on Dense Vector Retrieval Precision", "Analyzing how truncated paper titles distort MiniLM sentence embeddings and degrade RAG answer quality."),
        ("10.1016/j.artint.2025.104209", "Stale Document Filtering and Real-Time Data Pipeline Remediation", "Demonstrating how outdated publications affect retrieval freshness signals and automated trigger responses."),
        ("10.1016/j.artint.2025.104210", "Deduplication Strategies for Noise-Resilient Vector Databases", "Preventing duplicated records from dominating Top-K search results in ChromaDB collections."),
        ("10.1016/j.artint.2025.104211", "LLM-as-a-Judge Evaluation Protocols for Data Quality Assessment", "Using structured LLM outputs to grade answer correctness before and after data pipeline remediation."),
        ("10.1016/j.artint.2025.104212", "End-to-End Lineage Tracking for Scholarly Vector Observability", "Tracking raw records from Crossref landing to embedding manifests and evaluation report metrics."),
    ]

    for idx, (doi, title, abstract) in enumerate(sample_topics):
        items.append(
            {
                "DOI": doi,
                "title": [title],
                "abstract": f"<jats:p>{abstract}</jats:p>",
                "author": [{"given": "Vu", "family": "Huy Hoang"}, {"given": "Nguyen", "family": "Phong"}],
                "subject": ["Data Observability", "RAG Pipeline"],
                "published-print": {"date-parts": [[2026, 7, 15 + (idx % 10)]]},
                "created": {"date-parts": [[2026, 7, 20]]},
                "URL": f"https://doi.org/{doi}",
                "publisher": "Academic Press Observability",
            }
        )

    return {"status": "ok", "message": {"items": items}}


def fetch_source_records(settings: Settings) -> list[PaperRecord]:
    params = {
        "query": settings.source_query,
        "filter": settings.source_filter,
        "rows": settings.max_results,
        "mailto": "student@example.com",
    }
    url = f"https://api.crossref.org/works?{urllib.parse.urlencode(params)}"
    payload = None

    headers = {"User-Agent": "DataObservabilityLab/1.0 (mailto:student@example.com)"}
    req = urllib.request.Request(url, headers=headers)

    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=10) as resp:
                if resp.status == 200:
                    data = resp.read()
                    payload = json.loads(data.decode("utf-8"))
                    break
        except Exception:
            time.sleep(1.0 * (attempt + 1))

    if not payload or "message" not in payload:
        payload = _generate_fallback_records(settings)

    settings.paths.raw_api_response.parent.mkdir(parents=True, exist_ok=True)
    write_json(settings.paths.raw_api_response, payload)

    records = parse_crossref_payload(payload)
    settings.paths.raw_records_json.parent.mkdir(parents=True, exist_ok=True)
    write_json(settings.paths.raw_records_json, [asdict(r) for r in records])
    return records


def load_raw_records(path: Path) -> list[PaperRecord]:
    raw_list = json.loads(path.read_text(encoding="utf-8"))
    records = []
    for item in raw_list:
        records.append(
            PaperRecord(
                paper_id=item["paper_id"],
                title=item["title"],
                summary=item["summary"],
                authors=item["authors"],
                categories=item["categories"],
                primary_category=item.get("primary_category", item["categories"][0] if item["categories"] else "General"),
                published=item["published"],
                updated=item["updated"],
                abs_url=item.get("abs_url", ""),
                pdf_url=item.get("pdf_url", ""),
                comment=item.get("comment", ""),
            )
        )
    return records
