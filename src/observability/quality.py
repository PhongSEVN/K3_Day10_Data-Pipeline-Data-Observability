from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import Settings
from core.utils import now_utc, write_json

MIN_SUMMARY_CHARS = 20


def run_data_quality_checks(df: pd.DataFrame, settings: Settings, report_name: str) -> dict[str, Any]:
    row_count = len(df)
    checks: list[dict[str, Any]] = []

    checks.append(
        {
            "name": "row_count",
            "dimension": "completeness",
            "passed": row_count > 0,
            "detail": {"row_count": row_count},
        }
    )

    if "paper_id" in df.columns:
        missing = int(df["paper_id"].isna().sum())
        duplicates = int(df["paper_id"].duplicated().sum())
    else:
        missing, duplicates = row_count, 0
    checks.append(
        {
            "name": "paper_id_not_null_unique",
            "dimension": "uniqueness",
            "passed": missing == 0 and duplicates == 0,
            "detail": {"missing": missing, "duplicates": duplicates},
        }
    )

    if "title" in df.columns:
        title_missing = int((df["title"].isna() | (df["title"].astype(str).str.strip() == "")).sum())
    else:
        title_missing = row_count
    checks.append(
        {
            "name": "title_not_null",
            "dimension": "completeness",
            "passed": title_missing == 0,
            "detail": {"missing": title_missing},
        }
    )

    if "summary" in df.columns:
        summary_lengths = df["summary"].fillna("").astype(str).str.len()
        summary_too_short = int((summary_lengths < MIN_SUMMARY_CHARS).sum())
    else:
        summary_too_short = row_count
    checks.append(
        {
            "name": "summary_length",
            "dimension": "validity",
            "passed": summary_too_short == 0,
            "detail": {"below_min_chars": summary_too_short, "min_chars": MIN_SUMMARY_CHARS},
        }
    )

    if "age_days" in df.columns:
        stale_rows = int((df["age_days"] > settings.freshness_threshold_days).sum())
    else:
        stale_rows = row_count
    checks.append(
        {
            "name": "freshness",
            "dimension": "freshness",
            "passed": stale_rows == 0,
            "detail": {"stale_rows": stale_rows, "threshold_days": settings.freshness_threshold_days},
        }
    )

    report = {
        "report_name": report_name,
        "generated_at": now_utc().isoformat(),
        "row_count": row_count,
        "checks": checks,
        "passed": all(check["passed"] for check in checks),
    }

    write_json(settings.paths.quality_dir / f"{report_name}.json", report)
    return report


def build_freshness_report(df: pd.DataFrame, settings: Settings, report_path) -> dict[str, Any]:
    total_rows = len(df)

    if "published" in df.columns:
        published = pd.to_datetime(df["published"], errors="coerce").dropna()
    else:
        published = pd.Series(dtype="datetime64[ns]")

    latest_published = published.max().date().isoformat() if not published.empty else None
    oldest_published = published.min().date().isoformat() if not published.empty else None

    if "age_days" in df.columns:
        stale_rows = int((df["age_days"] > settings.freshness_threshold_days).sum())
    else:
        stale_rows = total_rows

    payload = {
        "latest_published": latest_published,
        "oldest_published": oldest_published,
        "stale_rows": stale_rows,
        "total_rows": total_rows,
        "is_fresh": total_rows > 0 and stale_rows == 0,
        "freshness_threshold_days": settings.freshness_threshold_days,
        "generated_at": now_utc().isoformat(),
    }

    write_json(report_path, payload)
    return payload
