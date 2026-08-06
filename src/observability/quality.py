from __future__ import annotations

from pathlib import Path
from typing import Any
import pandas as pd

from core.config import Settings
from core.utils import now_utc, write_json


def run_data_quality_checks(df: pd.DataFrame, settings: Settings, report_name: str) -> dict[str, Any]:
    total_rows = len(df)

    # Check 1: Completeness - Row count
    check_row_count = total_rows >= 5

    # Check 2: Uniqueness - paper_id not null and unique
    check_paper_id_not_null = bool(df["paper_id"].notnull().all()) if total_rows > 0 else False
    check_paper_id_unique = bool(df["paper_id"].is_unique) if total_rows > 0 else False

    # Check 3: Validity - title not null and length >= 10
    check_title_valid = bool((df["title"].str.strip().str.len() >= 10).all()) if total_rows > 0 else False

    # Check 4: Validity - summary not null and length >= 20
    check_summary_valid = bool((df["summary"].str.strip().str.len() >= 20).all()) if total_rows > 0 else False

    # Check 5: Freshness - age_days within threshold
    max_age = int(df["age_days"].max()) if total_rows > 0 and "age_days" in df.columns else 9999
    check_freshness = max_age <= settings.freshness_threshold_days

    checks = {
        "check_row_count": {"pass": check_row_count, "actual_value": total_rows, "expected_min": 5},
        "check_paper_id_not_null": {"pass": check_paper_id_not_null, "actual_value": int(df["paper_id"].isnull().sum())},
        "check_paper_id_unique": {"pass": check_paper_id_unique, "actual_value": int(df["paper_id"].duplicated().sum())},
        "check_title_valid": {"pass": check_title_valid, "invalid_count": int((df["title"].str.strip().str.len() < 10).sum()) if total_rows > 0 else 0},
        "check_summary_valid": {"pass": check_summary_valid, "invalid_count": int((df["summary"].str.strip().str.len() < 20).sum()) if total_rows > 0 else 0},
        "check_freshness": {"pass": check_freshness, "max_age_days": max_age, "threshold_days": settings.freshness_threshold_days},
    }

    all_passed = all(c["pass"] for c in checks.values())

    report = {
        "report_name": report_name,
        "timestamp": now_utc().isoformat(),
        "total_rows": total_rows,
        "overall_status": "PASS" if all_passed else "FAIL",
        "checks": checks,
    }

    out_file = settings.paths.quality_dir / f"quality_report_{report_name}.json"
    out_file.parent.mkdir(parents=True, exist_ok=True)
    write_json(out_file, report)
    return report


def build_freshness_report(df: pd.DataFrame, settings: Settings, report_path: Path | str) -> dict[str, Any]:
    total_rows = len(df)
    if total_rows == 0:
        report = {
            "latest_published": "N/A",
            "oldest_published": "N/A",
            "stale_rows": 0,
            "total_rows": 0,
            "is_fresh": False,
        }
    else:
        latest_pub = str(df["published"].max())
        oldest_pub = str(df["published"].min())
        stale_mask = df["age_days"] > settings.freshness_threshold_days
        stale_rows = int(stale_mask.sum())
        is_fresh = stale_rows == 0

        report = {
            "latest_published": latest_pub,
            "oldest_published": oldest_pub,
            "stale_rows": stale_rows,
            "total_rows": total_rows,
            "is_fresh": is_fresh,
            "freshness_threshold_days": settings.freshness_threshold_days,
        }

    out_path = Path(report_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(out_path, report)
    return report
