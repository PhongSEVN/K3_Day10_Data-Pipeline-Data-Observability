from __future__ import annotations

from pathlib import Path
from typing import Any
import pandas as pd

from core.utils import write_json


def build_test_set(df: pd.DataFrame, output_path: Path | str) -> list[dict[str, Any]]:
    if df.empty:
        raise ValueError("Cannot build test set from an empty dataframe.")

    test_set: list[dict[str, Any]] = []
    # Pick representative documents (up to 6 papers)
    sample_df = df.head(6)

    for idx, row in sample_df.iterrows():
        paper_id = row["paper_id"]
        title = row["title"]
        summary = row["summary"]
        authors_joined = row["authors_joined"]
        published = row["published"]
        categories_joined = row["categories_joined"]

        # Question type 1: Summary / Main idea
        test_set.append(
            {
                "id": f"q_{paper_id}_summary",
                "question_type": "summary",
                "question": f"What is the main finding or abstract of the paper '{title}'?",
                "ground_truth": summary,
                "ground_truth_doc_ids": [paper_id],
            }
        )

        # Question type 2: Authors
        test_set.append(
            {
                "id": f"q_{paper_id}_authors",
                "question_type": "authors",
                "question": f"Who authored the paper '{title}'?",
                "ground_truth": authors_joined,
                "ground_truth_doc_ids": [paper_id],
            }
        )

        # Question type 3: Publication date
        test_set.append(
            {
                "id": f"q_{paper_id}_date",
                "question_type": "date",
                "question": f"When was the paper '{title}' published?",
                "ground_truth": published,
                "ground_truth_doc_ids": [paper_id],
            }
        )

        # Question type 4: Categories
        test_set.append(
            {
                "id": f"q_{paper_id}_categories",
                "question_type": "categories",
                "question": f"What categories belong to the paper '{title}'?",
                "ground_truth": categories_joined,
                "ground_truth_doc_ids": [paper_id],
            }
        )

    out_p = Path(output_path)
    out_p.parent.mkdir(parents=True, exist_ok=True)
    write_json(out_p, test_set)
    return test_set
