from __future__ import annotations

from datetime import datetime
import pandas as pd

from ingestion.crossref import PaperRecord


def build_clean_dataframe(records: list[PaperRecord], run_date: datetime) -> pd.DataFrame:
    rows = []
    run_date_val = run_date.date() if isinstance(run_date, datetime) else run_date

    for r in records:
        title = r.title.strip()
        summary = r.summary.strip()
        if not title or not summary:
            continue

        authors = [a.strip() for a in r.authors if a.strip()]
        authors_joined = ", ".join(authors) if authors else "Unknown"

        categories = [c.strip() for c in r.categories if c.strip()]
        categories_joined = ", ".join(categories) if categories else "General"

        published_str = r.published.strip()
        try:
            pub_date = datetime.strptime(published_str, "%Y-%m-%d").date()
            age_days = max(0, (run_date_val - pub_date).days)
        except Exception:
            age_days = 0

        summary_chars = len(summary)
        text_for_embedding = (
            f"Title: {title}\n"
            f"Authors: {authors_joined}\n"
            f"Categories: {categories_joined}\n"
            f"Published: {published_str}\n"
            f"Summary: {summary}"
        )

        rows.append(
            {
                "paper_id": r.paper_id.strip(),
                "title": title,
                "summary": summary,
                "authors": authors,
                "authors_joined": authors_joined,
                "categories": categories,
                "categories_joined": categories_joined,
                "primary_category": r.primary_category,
                "published": published_str,
                "updated": r.updated,
                "age_days": age_days,
                "summary_chars": summary_chars,
                "text_for_embedding": text_for_embedding,
                "abs_url": r.abs_url,
                "pdf_url": r.pdf_url,
                "comment": r.comment,
            }
        )

    df = pd.DataFrame(rows)
    if df.empty:
        return df

    df = df.drop_duplicates(subset=["paper_id"]).drop_duplicates(subset=["title"]).reset_index(drop=True)
    df = df.sort_values(by="published", ascending=False).reset_index(drop=True)
    return df
