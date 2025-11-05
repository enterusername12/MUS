# decision.py — sentiment-only helpers (toxicity := P(negative))
from typing import List, Dict, Tuple, Any

# ---------- normalization ----------
def _normalize(scores: Any) -> List[Dict]:
    """
    Normalize pipeline outputs to a flat: [{label:..., score:...}, ...].
    Handles [[{...},{...},...]] and single dict too.
    """
    if not scores:
        return []
    if isinstance(scores, list) and scores and isinstance(scores[0], dict):
        return scores
    if isinstance(scores, list) and scores and isinstance(scores[0], list):
        inner = scores[0]
        if inner and isinstance(inner[0], dict):
            return inner
    if isinstance(scores, dict):
        return [scores]
    return []

def _label_map(scores: Any) -> Dict[str, float]:
    flat = _normalize(scores)
    return {str(s.get("label", "")).lower(): float(s.get("score", 0.0)) for s in flat}

# ---------- probability extractor ----------
def negative_sentiment_probability(scores: Any) -> float:
    """
    For sentiment models (negative/neutral/positive), return P(negative).
    If explicit 'negative' label missing, try 'label_0' as a last resort.
    """
    probs = _label_map(scores)
    if "negative" in probs:
        return probs["negative"]
    if "label_0" in probs:
        return probs["label_0"]
    return 0.0

# ---------- decision policy ----------
def decide_binary(p_neg: float, block: float, queue: float) -> Tuple[str, str]:
    """
    Decide 'publish' | 'queue' | 'block' from P(negative).
    Reason string uses 'neg' prefix for clarity.
    """
    if p_neg >= block:
        return "block", f"neg:{p_neg:.2f}"
    if p_neg >= queue:
        return "queue", f"neg:{p_neg:.2f}"
    return "publish", f"neg:{p_neg:.2f}"
