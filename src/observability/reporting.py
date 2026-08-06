from __future__ import annotations

from typing import Any

from core.utils import now_utc, write_text

METRIC_KEYS = ["retrieval_hit_rate", "mean_token_f1", "judge_accuracy", "mean_judge_score"]


def _format_value(value: Any) -> str:
    return f"{value:.4f}" if isinstance(value, float) else str(value)


def _format_kv_section(title: str, data: dict[str, Any]) -> str:
    lines = [f"## {title}", ""]
    for key, value in data.items():
        lines.append(f"- **{key}**: {_format_value(value)}")
    lines.append("")
    return "\n".join(lines)


def _format_metrics_section(metrics: dict[str, Any]) -> str:
    lines = ["## Evaluation metrics", "", "| Metric | Value |", "| --- | ---: |"]
    for key in METRIC_KEYS:
        if key in metrics:
            lines.append(f"| `{key}` | {_format_value(metrics[key])} |")
    lines.append(f"| samples | {metrics.get('samples', 'n/a')} |")
    lines.append("")
    return "\n".join(lines)


def _format_quality_section(quality: dict[str, Any]) -> str:
    status = "PASS" if quality.get("passed") else "FAIL"
    lines = ["## Data quality", "", f"Overall: **{status}**", "", "| Check | Dimension | Status | Detail |", "| --- | --- | --- | --- |"]
    for check in quality.get("checks", []):
        check_status = "PASS" if check.get("passed") else "FAIL"
        lines.append(f"| {check.get('name')} | {check.get('dimension')} | {check_status} | {check.get('detail')} |")
    lines.append("")
    return "\n".join(lines)


def _format_freshness_section(freshness: dict[str, Any]) -> str:
    keys = ["latest_published", "oldest_published", "stale_rows", "total_rows", "is_fresh", "freshness_threshold_days"]
    return _format_kv_section("Freshness", {key: freshness[key] for key in keys if key in freshness})


def generate_phase1_report(
    report_path,
    source_summary: dict[str, Any],
    metrics: dict[str, Any],
    quality: dict[str, Any],
    freshness: dict[str, Any],
) -> None:
    sections = [
        "# Phase 1 Baseline Report",
        "",
        f"Generated at: {now_utc().isoformat()}",
        "",
        _format_kv_section("Source summary", source_summary),
        _format_metrics_section(metrics),
        _format_quality_section(quality),
        _format_freshness_section(freshness),
    ]
    write_text(report_path, "\n".join(sections))


def generate_corruption_report(
    report_path,
    baseline_metrics: dict[str, Any],
    corrupted_metrics: dict[str, Any],
    repaired_metrics: dict[str, Any],
    corrupted_quality: dict[str, Any],
    repaired_quality: dict[str, Any],
    corrupted_freshness: dict[str, Any],
    repaired_freshness: dict[str, Any],
) -> None:
    lines = [
        "# Corruption Comparison Report",
        "",
        f"Generated at: {now_utc().isoformat()}",
        "",
        "## Metrics comparison",
        "",
        "| Metric | Baseline | Corrupted | Repaired |",
        "| --- | ---: | ---: | ---: |",
    ]
    for key in METRIC_KEYS:
        baseline_value = _format_value(baseline_metrics[key]) if key in baseline_metrics else "n/a"
        corrupted_value = _format_value(corrupted_metrics[key]) if key in corrupted_metrics else "n/a"
        repaired_value = _format_value(repaired_metrics[key]) if key in repaired_metrics else "n/a"
        lines.append(f"| `{key}` | {baseline_value} | {corrupted_value} | {repaired_value} |")
    lines.append("")

    lines += [
        "## Data quality comparison",
        "",
        "| State | Passed |",
        "| --- | --- |",
        f"| Corrupted | {corrupted_quality.get('passed')} |",
        f"| Repaired | {repaired_quality.get('passed')} |",
        "",
    ]

    lines += [
        "## Freshness comparison",
        "",
        "| State | is_fresh | stale_rows |",
        "| --- | --- | --- |",
        f"| Corrupted | {corrupted_freshness.get('is_fresh')} | {corrupted_freshness.get('stale_rows')} |",
        f"| Repaired | {repaired_freshness.get('is_fresh')} | {repaired_freshness.get('stale_rows')} |",
        "",
    ]

    write_text(report_path, "\n".join(lines))
