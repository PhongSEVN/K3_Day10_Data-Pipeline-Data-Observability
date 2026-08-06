from __future__ import annotations

from datetime import datetime
from typing import Iterable

import pandas as pd

from core.utils import compact_join, normalize_whitespace
from ingestion.crossref import PaperRecord

CLEAN_COLUMNS = [
    "paper_id",
    "title",
    "summary",
    "authors",
    "categories",
    "primary_category",
    "published",
    "updated",
    "abs_url",
    "pdf_url",
    "comment",
    "authors_joined",
    "categories_joined",
    "summary_chars",
    "age_days",
    "text_for_embedding",
]


def _clean_text(value: object) -> str:
    return normalize_whitespace(str(value or ""))


def _clean_list(values: Iterable[object] | None) -> list[str]:
    return [cleaned for value in values or [] if (cleaned := _clean_text(value))]


def _iso_date(value: object) -> str:
    parsed = pd.to_datetime(value, errors="coerce")
    return "" if pd.isna(parsed) else parsed.date().isoformat()


def build_clean_dataframe(
    records: list[PaperRecord], run_date: datetime
) -> pd.DataFrame:
    """Normalize source records into the stable contract used downstream."""
    rows: list[dict] = []
    run_day = run_date.date()
    for record in records:
        paper_id, title, summary = map(
            _clean_text, (record.paper_id, record.title, record.summary)
        )
        if not paper_id or not title or not summary:
            continue
        authors = _clean_list(record.authors)
        categories = _clean_list(record.categories)
        published = _iso_date(record.published)
        updated = _iso_date(record.updated)
        published_date = pd.to_datetime(published, errors="coerce")
        age_days = (
            None
            if pd.isna(published_date)
            else max(0, (run_day - published_date.date()).days)
        )
        authors_joined = compact_join(authors)
        categories_joined = compact_join(categories)
        text_for_embedding = "\n".join(
            part
            for part in (
                f"Title: {title}",
                f"Summary: {summary}",
                f"Authors: {authors_joined}" if authors_joined else "",
                f"Categories: {categories_joined}" if categories_joined else "",
            )
            if part
        )
        rows.append(
            {
                "paper_id": paper_id,
                "title": title,
                "summary": summary,
                "authors": authors,
                "categories": categories,
                "primary_category": categories[0] if categories else "",
                "published": published,
                "updated": updated,
                "abs_url": _clean_text(record.abs_url),
                "pdf_url": _clean_text(record.pdf_url),
                "comment": _clean_text(record.comment),
                "authors_joined": authors_joined,
                "categories_joined": categories_joined,
                "summary_chars": len(summary),
                "age_days": age_days,
                "text_for_embedding": text_for_embedding,
            }
        )
    if not rows:
        return pd.DataFrame(columns=CLEAN_COLUMNS)
    return (
        pd.DataFrame(rows, columns=CLEAN_COLUMNS)
        .drop_duplicates(subset=["paper_id"], keep="first")
        .sort_values("paper_id", kind="stable")
        .reset_index(drop=True)
    )
