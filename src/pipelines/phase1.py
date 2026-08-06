from __future__ import annotations

from typing import Any

import pandas as pd

from core.config import Settings, load_settings
from core.utils import now_utc, read_json, write_csv, write_json
from evaluation.metrics import EvaluationBundle, evaluate_pipeline
from evaluation.testset import build_test_set
from ingestion.cleaning import build_clean_dataframe
from ingestion.crossref import PaperRecord, fetch_source_records, load_raw_records
from observability.quality import build_freshness_report, run_data_quality_checks
from observability.reporting import generate_phase1_report
from retrieval.agent import build_agent, run_agent_question
from retrieval.index import LocalEmbeddingIndex


def _load_records(settings: Settings) -> list[PaperRecord]:
    if settings.refresh_source or not settings.paths.raw_records_json.exists():
        return fetch_source_records(settings)
    return load_raw_records(settings.paths.raw_records_json)


def _load_or_build_test_set(settings: Settings, df: pd.DataFrame) -> list[dict[str, Any]]:
    if not settings.refresh_test_set and settings.paths.eval_testset.exists():
        return read_json(settings.paths.eval_testset)
    return build_test_set(df, settings.paths.eval_testset)


def _save_clean_dataset(settings: Settings, df: pd.DataFrame) -> None:
    write_csv(df, settings.paths.clean_csv)
    write_json(settings.paths.clean_json, df.to_dict(orient="records"))


def _demo_agent_answers(settings: Settings, index: LocalEmbeddingIndex, test_set: list[dict[str, Any]]) -> list[dict[str, str]]:
    agent = build_agent(settings=settings, index=index)
    demo_questions = [item["question"] for item in test_set[:3]]
    return [{"question": question, "answer": run_agent_question(agent, question)} for question in demo_questions]


def main() -> None:
    settings = load_settings()

    records = _load_records(settings)
    df = build_clean_dataframe(records, run_date=now_utc())
    _save_clean_dataset(settings, df)

    index = LocalEmbeddingIndex.build(df, settings=settings, embeddings_output_path=settings.paths.embeddings_json)
    test_set = _load_or_build_test_set(settings, df)

    bundle: EvaluationBundle = evaluate_pipeline(
        settings=settings,
        index=index,
        test_set_path=settings.paths.eval_testset,
        metrics_output_path=settings.paths.baseline_metrics,
        answers_output_path=settings.paths.baseline_answers,
    )

    quality = run_data_quality_checks(df, settings=settings, report_name="baseline")
    freshness = build_freshness_report(df, settings=settings, report_path=settings.paths.freshness_report)

    source_summary = {
        "source_api": settings.source_api,
        "query": settings.source_query,
        "filter": settings.source_filter,
        "record_count": len(records),
        "clean_row_count": len(df),
    }
    generate_phase1_report(
        report_path=settings.paths.baseline_report,
        source_summary=source_summary,
        metrics=bundle.summary,
        quality=quality,
        freshness=freshness,
    )

    demo_answers = _demo_agent_answers(settings, index, test_set)
    write_json(settings.paths.demo_answers, demo_answers)

    print(f"Baseline pipeline complete. retrieval_hit_rate={bundle.summary['retrieval_hit_rate']:.3f}")


if __name__ == "__main__":
    main()
