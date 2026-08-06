from datetime import datetime, timezone

from ingestion.cleaning import build_clean_dataframe
from ingestion.crossref import PaperRecord


def record(paper_id="doi:1", title="  A title  ", summary="A sufficiently long summary."):
    return PaperRecord(
        paper_id=paper_id,
        title=title,
        summary=summary,
        authors=["Alice  Smith"],
        categories=["cs.AI"],
        primary_category="cs.AI",
        published="2026-07-01",
        updated="2026-07-02",
        abs_url="https://example.test/1",
        pdf_url="",
        comment="Journal",
    )


def test_clean_dataframe_normalizes_and_builds_contract_columns():
    df = build_clean_dataframe([record()], datetime(2026, 8, 6, tzinfo=timezone.utc))
    row = df.iloc[0]
    assert row["paper_id"] == "doi:1"
    assert row["title"] == "A title"
    assert row["authors_joined"] == "Alice Smith"
    assert row["categories_joined"] == "cs.AI"
    assert row["summary_chars"] == len("A sufficiently long summary.")
    assert row["age_days"] == 36
    assert "A title" in row["text_for_embedding"]


def test_clean_dataframe_drops_invalid_records_and_duplicate_ids():
    invalid = record("doi:bad", title="", summary="long enough summary")
    df = build_clean_dataframe(
        [record(), record(), invalid],
        datetime(2026, 8, 6, tzinfo=timezone.utc),
    )
    assert list(df["paper_id"]) == ["doi:1"]
