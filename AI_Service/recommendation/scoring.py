# scoring.py — cosine similarity & ranking (supports precomputed profile)
from __future__ import annotations
import numpy as np
import pandas as pd
import numpy as np

def cosine_sim(u, v):
    u = np.asarray(u, dtype="float32")
    v = np.asarray(v, dtype="float32")
    un = float(np.linalg.norm(u))
    vn = float(np.linalg.norm(v))
    if un == 0.0 or vn == 0.0:
        return 0.0
    return float(np.dot(u, v) / (un * vn))

def _parse_vec(s: str) -> np.ndarray:
    s = str(s).strip()
    if not (s.startswith("[") and s.endswith("]")):
        return np.zeros(1, dtype=np.float32)
    try:
        vals = [float(x) for x in s[1:-1].split(",") if x.strip()]
        arr = np.array(vals, dtype=np.float32)
        n = np.linalg.norm(arr)
        return arr if n == 0 else (arr / n)
    except Exception:
        return np.zeros(1, dtype=np.float32)

def _cos(a: np.ndarray, b: np.ndarray) -> float:
    la = float(np.linalg.norm(a)); lb = float(np.linalg.norm(b))
    if la == 0.0 or lb == 0.0:
        return 0.0
    return float(np.dot(a, b) / (la * lb))

def top_k_with_profile(events_df: pd.DataFrame, profile_vec: np.ndarray, k: int = 10) -> pd.DataFrame:
    scores = []
    for _, row in events_df.iterrows():
        evec = _parse_vec(row.get("event_embedding", ""))
        scores.append(_cos(profile_vec, evec))

    out = events_df.copy()
    out["score"] = scores
    out = out.sort_values("score", ascending=False).head(k).reset_index(drop=True)
    keep = ["event_id", "title", "description", "start_time", "location", "score"]
    existing = [c for c in keep if c in out.columns]
    return out[existing]
