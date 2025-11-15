# scoring.py — cosine similarity & ranking (supports precomputed profile)
from __future__ import annotations
import numpy as np
import pandas as pd
from pandas.api.types import is_datetime64tz_dtype


def _to_vec(row):
    # Primary: generic "embedding" column (list/tuple)
    v = row.get("embedding")
    if isinstance(v, (list, tuple)):
        arr = np.asarray(v, dtype="float32")
        n = float(np.linalg.norm(arr))
        return arr if n == 0.0 else (arr / n)

    # Legacy/alternative columns: event_embedding / news_embedding / post_embedding / poll_embedding
    for key in ("event_embedding", "news_embedding", "post_embedding", "poll_embedding"):
        if key in row and row[key] is not None:
            vv = row[key]
            if isinstance(vv, str):
                # e.g. "[0.1, 0.2, ...]"
                try:
                    vv = [float(x) for x in vv.strip()[1:-1].split(",") if x.strip()]
                except Exception:
                    vv = []
            arr = np.asarray(vv, dtype="float32")
            n = float(np.linalg.norm(arr))
            return arr if n == 0.0 else (arr / n)

    # Fallback zero-vector if no embedding found
    return np.zeros(1, dtype="float32")


def _cos(a: np.ndarray, b: np.ndarray) -> float:
    la = float(np.linalg.norm(a))
    lb = float(np.linalg.norm(b))
    if la == 0.0 or lb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (la * lb))


def top_k_with_profile(events_df: pd.DataFrame, profile_vec: np.ndarray, k: int = 10) -> pd.DataFrame:
    """
    Rank items by cosine similarity to a user/profile vector.

    Fixes pandas timezone issues by:
    - Copying the frame
    - Removing timezone info from datetime columns
    - Computing scores directly on the DataFrame
    """

    # Ensure we have a DataFrame
    if isinstance(events_df, pd.DataFrame):
        df = events_df.copy()
    else:
        df = pd.DataFrame(events_df)

    # If empty, just return empty frame with expected columns
    if df.empty:
        keep = [
            "event_id",
            "news_id",
            "post_id",
            "poll_id",
            "title",
            "description",
            "headline",
            "category",
            "category_name",
            "image_url",
            "banner_url",
            "start_time",
            "end_time",
            "published_at",
            "location",
            "created_at",
            "expires_at",
            "score",
            "content_type",
        ]
        cols = [c for c in keep if c in df.columns]
        return df[cols]

    # Remove timezone info from datetime columns to avoid pandas tz bugs
    datetime_cols = ["start_time", "end_time", "published_at", "created_at", "expires_at"]
    for col in datetime_cols:
        if col in df.columns:
            # Robust conversion: handle naive, tz-aware, and weird cases
            try:
                # Force everything into UTC first, then strip tz
                df[col] = pd.to_datetime(df[col], errors="coerce", utc=True).dt.tz_localize(None)
            except Exception:
                # Fallback: at least ensure it's a datetime without tz
                df[col] = pd.to_datetime(df[col], errors="coerce")


    # Normalize profile vector
    profile_vec = np.asarray(profile_vec, dtype="float32")

    # Compute cosine similarity scores
    scores = []
    for _, row in df.iterrows():
        evec = _to_vec(row)
        scores.append(_cos(profile_vec, evec))

    df["score"] = scores

    # Sort by score and keep top-k
    df = df.sort_values("score", ascending=False).head(int(k)).reset_index(drop=True)

    # Keep only relevant columns
    keep = [
        "event_id",
        "news_id",
        "post_id",
        "poll_id",
        "title",
        "description",
        "headline",
        "category",
        "category_name",
        "image_url",
        "banner_url",
        "start_time",
        "end_time",
        "published_at",
        "location",
        "created_at",
        "expires_at",
        "score",
        "content_type",
    ]
    existing = [c for c in keep if c in df.columns]
    return df[existing]
