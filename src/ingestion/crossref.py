from __future__ import annotations

from dataclasses import asdict, dataclass
from pathlib import Path
import re
import time

import requests

from core.config import Settings
from core.utils import normalize_whitespace, read_json, write_json

CROSSREF_API_URL = "https://api.crossref.org/works"
RETRYABLE_STATUS_CODES = {429, 503}
MAX_RETRIES = 5
BACKOFF_BASE_SECONDS = 2.0

_TAG_RE = re.compile(r"<[^>]+>")


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


def _strip_tags(text: str) -> str:
    return normalize_whitespace(_TAG_RE.sub(" ", text))


def _format_date_parts(date_field: dict | None) -> str:
    if not date_field:
        return ""
    parts = date_field.get("date-parts", [[]])[0]
    if not parts:
        return ""
    year = parts[0]
    month = parts[1] if len(parts) > 1 else 1
    day = parts[2] if len(parts) > 2 else 1
    return f"{year:04d}-{month:02d}-{day:02d}"


def _format_datetime_field(date_field: dict | None) -> str:
    if not date_field:
        return ""
    if date_field.get("date-time"):
        return str(date_field["date-time"])[:10]
    return _format_date_parts(date_field)


def _extract_authors(item: dict) -> list[str]:
    authors = []
    for author in item.get("author", []):
        given = author.get("given", "").strip()
        family = author.get("family", "").strip()
        name = normalize_whitespace(f"{given} {family}")
        if name:
            authors.append(name)
    return authors


def _extract_pdf_url(item: dict) -> str:
    for link in item.get("link", []):
        if link.get("content-type") == "application/pdf":
            return link.get("URL", "")
    return ""


def _parse_item(item: dict) -> PaperRecord | None:
    paper_id = item.get("DOI", "").strip()
    titles = item.get("title") or []
    title = _strip_tags(titles[0]) if titles else ""
    summary = _strip_tags(item.get("abstract", ""))
    if not paper_id or not title:
        return None

    published_field = (
        item.get("published")
        or item.get("published-print")
        or item.get("published-online")
        or item.get("issued")
    )
    updated_field = item.get("deposited") or item.get("indexed") or item.get("created")

    categories = [subject for subject in item.get("subject", []) if subject]

    return PaperRecord(
        paper_id=paper_id,
        title=title,
        summary=summary,
        authors=_extract_authors(item),
        categories=categories,
        primary_category=categories[0] if categories else "",
        published=_format_date_parts(published_field),
        updated=_format_datetime_field(updated_field),
        abs_url=item.get("URL", ""),
        pdf_url=_extract_pdf_url(item),
        comment=_strip_tags(item.get("container-title", [""])[0]) if item.get("container-title") else "",
    )


def parse_crossref_payload(payload: dict) -> list[PaperRecord]:
    items = payload.get("message", {}).get("items", [])
    records: list[PaperRecord] = []
    for item in items:
        record = _parse_item(item)
        if record is None:
            continue
        if len(record.summary) < 1:
            continue
        records.append(record)
    return records


def _request_with_retry(params: dict) -> requests.Response:
    last_response: requests.Response | None = None
    for attempt in range(MAX_RETRIES):
        response = requests.get(CROSSREF_API_URL, params=params, timeout=30)
        if response.status_code not in RETRYABLE_STATUS_CODES:
            response.raise_for_status()
            return response
        last_response = response
        wait_seconds = BACKOFF_BASE_SECONDS * (2**attempt)
        time.sleep(wait_seconds)
    assert last_response is not None
    last_response.raise_for_status()
    return last_response


def fetch_source_records(settings: Settings) -> list[PaperRecord]:
    params = {
        "query.bibliographic": settings.source_query,
        "filter": settings.source_filter,
        "rows": settings.max_results,
    }
    response = _request_with_retry(params)
    payload = response.json()
    write_json(settings.paths.raw_api_response, payload)

    records = parse_crossref_payload(payload)
    write_json(settings.paths.raw_records_json, [asdict(record) for record in records])
    return records


def load_raw_records(path: Path) -> list[PaperRecord]:
    payload = read_json(path)
    return [PaperRecord(**item) for item in payload]
