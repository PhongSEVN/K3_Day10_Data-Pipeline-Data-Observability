from __future__ import annotations

from typing import Any

import pandas as pd

from core.utils import write_json


REQUIRED_COLUMNS = {"paper_id", "title", "summary", "authors_joined", "published", "categories_joined"}
MAX_DOCUMENTS = 24


def _value(row: dict[str, Any], column: str) -> str:
    value = row.get(column, "")
    return "" if pd.isna(value) else str(value).strip()


def build_test_set(df: pd.DataFrame, output_path) -> list[dict[str, Any]]:
    """Build and persist a deterministic evaluation set from clean documents."""
    missing = sorted(REQUIRED_COLUMNS - set(df.columns))
    if missing:
        raise ValueError(f"Cleaned dataframe is missing required columns: {', '.join(missing)}")
    selected = df.sort_values("paper_id", kind="stable").head(MAX_DOCUMENTS)
    test_set: list[dict[str, Any]] = []
    question_templates = (
        ("summary", "What is the summary of the paper titled '{title}'?", "summary"),
        ("authors", "Who are the authors of the paper titled '{title}'?", "authors_joined"),
        ("date", "When was the paper titled '{title}' published?", "published"),
        ("categories", "What categories describe the paper titled '{title}'?", "categories_joined"),
    )
    for row in selected.to_dict(orient="records"):
        paper_id, title = _value(row, "paper_id"), _value(row, "title")
        for question_type, template, source_column in question_templates:
            ground_truth = _value(row, source_column)
            if not ground_truth:
                continue
            test_set.append({
                "id": f"eval-{len(test_set) + 1:04d}",
                "question_type": question_type,
                "question": template.format(title=title),
                "ground_truth": ground_truth,
                "ground_truth_doc_ids": [paper_id],
            })
    write_json(output_path, test_set)
    return test_set
