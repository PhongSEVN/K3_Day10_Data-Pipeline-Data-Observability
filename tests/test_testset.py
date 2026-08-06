import json

import pandas as pd

from evaluation.testset import build_test_set


def clean_frame():
    return pd.DataFrame(
        [
            {
                "paper_id": "doi:1",
                "title": "Title one",
                "summary": "Summary one",
                "authors_joined": "Alice",
                "published": "2026-07-01",
                "categories_joined": "cs.AI",
            },
            {
                "paper_id": "doi:2",
                "title": "Title two",
                "summary": "Summary two",
                "authors_joined": "Bob",
                "published": "2026-07-02",
                "categories_joined": "cs.LG",
            },
        ]
    )


def test_build_test_set_writes_expected_schema(tmp_path):
    path = tmp_path / "nested" / "test_set.json"
    result = build_test_set(clean_frame(), path)
    assert path.exists()
    assert json.loads(path.read_text()) == result
    assert result
    assert {"summary", "authors", "date", "categories"} <= {
        item["question_type"] for item in result
    }
    for item in result:
        assert set(item) == {
            "id",
            "question_type",
            "question",
            "ground_truth",
            "ground_truth_doc_ids",
        }
        assert item["ground_truth_doc_ids"] in (["doi:1"], ["doi:2"])


def test_build_test_set_is_deterministic(tmp_path):
    first = build_test_set(clean_frame(), tmp_path / "one.json")
    second = build_test_set(clean_frame(), tmp_path / "two.json")
    assert first == second
