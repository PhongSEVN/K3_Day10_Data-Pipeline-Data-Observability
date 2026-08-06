from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import Settings, load_settings
from core.utils import now_utc, read_json, write_csv, write_json
from evaluation.metrics import EvaluationBundle, evaluate_pipeline
from ingestion.cleaning import build_clean_dataframe
from ingestion.corruption import corrupt_clean_dataframe
from ingestion.crossref import load_raw_records
from observability.quality import build_freshness_report, run_data_quality_checks
from observability.reporting import generate_corruption_report
from retrieval.index import LocalEmbeddingIndex


def _require_baseline(settings: Settings) -> dict[str, Any]:
    if not settings.paths.baseline_metrics.exists() or not settings.paths.clean_json.exists():
        raise RuntimeError(
            "Baseline artifacts not found. Run script/run_phase1.py before script/run_corruption_flow.py."
        )
    return read_json(settings.paths.baseline_metrics)


def _load_baseline_dataframe(settings: Settings) -> pd.DataFrame:
    return pd.DataFrame(read_json(settings.paths.clean_json))


def _save_dataset(df: pd.DataFrame, csv_path, json_path) -> None:
    write_csv(df, csv_path)
    write_json(json_path, df.to_dict(orient="records"))


def _evaluate_variant(
    settings: Settings,
    df: pd.DataFrame,
    embeddings_output_path,
    metrics_output_path,
    answers_output_path,
) -> EvaluationBundle:
    index = LocalEmbeddingIndex.build(df, settings=settings, embeddings_output_path=embeddings_output_path)
    return evaluate_pipeline(
        settings=settings,
        index=index,
        test_set_path=settings.paths.eval_testset,
        metrics_output_path=metrics_output_path,
        answers_output_path=answers_output_path,
    )


def main() -> None:
    settings = load_settings()

    baseline_metrics = _require_baseline(settings)
    baseline_df = _load_baseline_dataframe(settings)

    corrupted_df = corrupt_clean_dataframe(baseline_df, output_log_path=settings.paths.corruption_log)
    _save_dataset(corrupted_df, settings.paths.corrupted_clean_csv, settings.paths.corrupted_clean_json)
    corrupted_bundle = _evaluate_variant(
        settings,
        corrupted_df,
        settings.paths.corrupted_embeddings_json,
        settings.paths.corrupted_metrics,
        settings.paths.corrupted_answers,
    )
    corrupted_quality = run_data_quality_checks(corrupted_df, settings=settings, report_name="corrupted")
    corrupted_freshness_path = settings.paths.quality_dir / "freshness_report_corrupted.json"
    corrupted_freshness = build_freshness_report(corrupted_df, settings=settings, report_path=corrupted_freshness_path)

    repaired_records = load_raw_records(settings.paths.raw_records_json)
    repaired_df = build_clean_dataframe(repaired_records, run_date=now_utc())
    _save_dataset(repaired_df, settings.paths.repaired_clean_csv, settings.paths.repaired_clean_json)
    repaired_bundle = _evaluate_variant(
        settings,
        repaired_df,
        settings.paths.repaired_embeddings_json,
        settings.paths.repaired_metrics,
        settings.paths.repaired_answers,
    )
    repaired_quality = run_data_quality_checks(repaired_df, settings=settings, report_name="repaired")
    repaired_freshness_path = settings.paths.quality_dir / "freshness_report_repaired.json"
    repaired_freshness = build_freshness_report(repaired_df, settings=settings, report_path=repaired_freshness_path)

    generate_corruption_report(
        report_path=settings.paths.comparison_report,
        baseline_metrics=baseline_metrics,
        corrupted_metrics=corrupted_bundle.summary,
        repaired_metrics=repaired_bundle.summary,
        corrupted_quality=corrupted_quality,
        repaired_quality=repaired_quality,
        corrupted_freshness=corrupted_freshness,
        repaired_freshness=repaired_freshness,
    )

    print(
        "Corruption flow complete. "
        f"baseline_hit_rate={baseline_metrics['retrieval_hit_rate']:.3f} "
        f"corrupted_hit_rate={corrupted_bundle.summary['retrieval_hit_rate']:.3f} "
        f"repaired_hit_rate={repaired_bundle.summary['retrieval_hit_rate']:.3f}"
    )


if __name__ == "__main__":
    main()
