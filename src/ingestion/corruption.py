from __future__ import annotations

from datetime import datetime
from pathlib import Path
import pandas as pd

from core.utils import now_utc, write_json


def corrupt_clean_dataframe(df: pd.DataFrame, output_log_path: Path | str) -> pd.DataFrame:
    """Simulate multiple data corruption scenarios on a clean dataframe.

    Scenarios implemented by Vu Huy Hoang (Corruption Owner):
    1. Drop latest records (removes newest records to simulate missing incoming data).
    2. Blank summary (clears summary text to simulate incomplete ingestion).
    3. Inject noise (adds corrupt noise characters to summaries to degrade semantic search).
    4. Truncate title (shortens titles to 5 chars to break title lookup and embedding match).
    5. Stale publication date (modifies published date to past date exceeding freshness threshold).
    6. Add duplicate rows (duplicates existing records to introduce vector database redundancy).
    7. Rebuild `text_for_embedding` for all rows.
    8. Write detailed corruption log JSON to `output_log_path`.
    """
    if df.empty:
        return df.copy()

    corrupted_df = df.copy()
    corruption_log = {
        "timestamp": now_utc().isoformat(),
        "original_row_count": len(df),
        "actions": [],
    }

    # Action 1: Drop latest records (e.g. first 2 rows if sorted descending by date)
    if len(corrupted_df) > 5:
        dropped_rows = corrupted_df.iloc[:2]
        corrupted_df = corrupted_df.iloc[2:].reset_index(drop=True)
        corruption_log["actions"].append(
            {
                "type": "drop_latest_records",
                "count": len(dropped_rows),
                "dropped_paper_ids": dropped_rows["paper_id"].tolist(),
            }
        )

    # Action 2: Blank summary on 2 rows
    if len(corrupted_df) >= 2:
        target_indices = [0, 1]
        for idx in target_indices:
            paper_id = corrupted_df.at[idx, "paper_id"]
            corrupted_df.at[idx, "summary"] = ""
            corrupted_df.at[idx, "summary_chars"] = 0
            corruption_log["actions"].append(
                {
                    "type": "blank_summary",
                    "paper_id": paper_id,
                    "target_index": idx,
                }
            )

    # Action 3: Inject noise into summary on 2 rows
    if len(corrupted_df) >= 4:
        target_indices = [2, 3]
        noise_str = " [CORRUPTED_NOISE_xyz123_invalid_garbled_data_stream] "
        for idx in target_indices:
            paper_id = corrupted_df.at[idx, "paper_id"]
            orig = corrupted_df.at[idx, "summary"]
            corrupted_summary = f"{noise_str} {orig[:30]} {noise_str}"
            corrupted_df.at[idx, "summary"] = corrupted_summary
            corrupted_df.at[idx, "summary_chars"] = len(corrupted_summary)
            corruption_log["actions"].append(
                {
                    "type": "inject_noise",
                    "paper_id": paper_id,
                    "target_index": idx,
                }
            )

    # Action 4: Truncate title on 2 rows
    if len(corrupted_df) >= 6:
        target_indices = [4, 5]
        for idx in target_indices:
            paper_id = corrupted_df.at[idx, "paper_id"]
            orig_title = corrupted_df.at[idx, "title"]
            truncated_title = orig_title[:5]
            corrupted_df.at[idx, "title"] = truncated_title
            corruption_log["actions"].append(
                {
                    "type": "truncate_title",
                    "paper_id": paper_id,
                    "original_title": orig_title,
                    "truncated_title": truncated_title,
                }
            )

    # Action 5: Make published date stale on 2 rows (set date to 2020-01-01, age_days = 2400)
    if len(corrupted_df) >= 8:
        target_indices = [6, 7]
        for idx in target_indices:
            paper_id = corrupted_df.at[idx, "paper_id"]
            corrupted_df.at[idx, "published"] = "2020-01-01"
            corrupted_df.at[idx, "age_days"] = 2400
            corruption_log["actions"].append(
                {
                    "type": "stale_published_date",
                    "paper_id": paper_id,
                    "new_published": "2020-01-01",
                    "new_age_days": 2400,
                }
            )

    # Action 6: Add duplicate rows (duplicate first 2 rows of current corrupted_df)
    if len(corrupted_df) >= 2:
        dup_rows = corrupted_df.iloc[:2].copy()
        corrupted_df = pd.concat([corrupted_df, dup_rows], ignore_index=True)
        corruption_log["actions"].append(
            {
                "type": "add_duplicate_rows",
                "count": len(dup_rows),
                "duplicated_paper_ids": dup_rows["paper_id"].tolist(),
            }
        )

    # Action 7: Rebuild text_for_embedding for all rows
    rebuilt_texts = []
    for _, row in corrupted_df.iterrows():
        text = (
            f"Title: {row['title']}\n"
            f"Authors: {row['authors_joined']}\n"
            f"Categories: {row['categories_joined']}\n"
            f"Published: {row['published']}\n"
            f"Summary: {row['summary']}"
        )
        rebuilt_texts.append(text)
    corrupted_df["text_for_embedding"] = rebuilt_texts

    corruption_log["final_row_count"] = len(corrupted_df)

    # Write log to file
    out_path = Path(output_log_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    write_json(out_path, corruption_log)

    return corrupted_df
