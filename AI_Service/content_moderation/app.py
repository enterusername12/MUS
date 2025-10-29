# app.py — FastAPI microservice (sentiment-only: toxicity := P(negative))
import json, time, os
from typing import Optional
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import torch
from decision import negative_sentiment_probability, decide_binary

# -------- load config --------
with open("config.json", "r", encoding="utf-8") as f:
    CFG = json.load(f)

MODEL_NAME = CFG.get("model", "cardiffnlp/twitter-roberta-base-sentiment-latest")
DEVICE_PREF = CFG.get("device", "cuda")
THRESHOLD_BLOCK = float(CFG.get("thresholds", {}).get("block", 0.70))
THRESHOLD_QUEUE = float(CFG.get("thresholds", {}).get("queue", 0.40))
MAX_TEXT_LEN = int(CFG.get("maxTextLength", 2000))
ALLOW_ORIGINS = CFG.get("allow_origins", ["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5173"])
LOG_TO_FILE = bool(CFG.get("log_to_file", True))

app = FastAPI(title="MUS Content Moderation (Sentiment-only)")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOW_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

clf = None
LABELS_LOWER = set()

def load_model_once():
    global clf, LABELS_LOWER
    if clf is not None:
        return clf
    from transformers import pipeline
    device_idx = 0 if (DEVICE_PREF == "cuda" and torch.cuda.is_available()) else -1
    clf = pipeline(
        task="text-classification",
        model=MODEL_NAME,
        return_all_scores=True,
        device=device_idx
    )
    # collect labels (if exposed)
    id2label = getattr(clf.model.config, "id2label", None)
    LABELS_LOWER = {v.lower() for v in id2label.values()} if id2label else set()
    print(f"[moderation] model: {MODEL_NAME}")
    print(f"[moderation] cuda: {torch.cuda.is_available()}  device: {'cuda' if device_idx>=0 and torch.cuda.is_available() else 'cpu'}")
    if LABELS_LOWER:
        print(f"[moderation] labels: {sorted(LABELS_LOWER)}")
    print(f"[moderation] strategy: sentiment-only (toxicity := P(negative))")
    return clf

RECENT, RECENT_MAX = [], 200
LOG_FILE = os.path.join("data", "moderation_log.jsonl")

def log_decision(entry: dict):
    os.makedirs("data", exist_ok=True)
    RECENT.append(entry)
    if len(RECENT) > RECENT_MAX:
        RECENT.pop(0)
    if LOG_TO_FILE:
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(json.dumps(entry, ensure_ascii=False) + "\n")

class ModRequest(BaseModel):
    text: str
    meta: Optional[dict] = None

@app.get("/health")
def health():
    return {
        "ok": True,
        "model": MODEL_NAME,
        "cuda": torch.cuda.is_available(),
        "device": "cuda" if (DEVICE_PREF == "cuda" and torch.cuda.is_available()) else "cpu",
        "thresholds": {"block": THRESHOLD_BLOCK, "queue": THRESHOLD_QUEUE},
        "strategy": "negative_sentiment"
    }

@app.post("/moderate")
def moderate(req: ModRequest):
    text = (req.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Missing text")
    if len(text) > MAX_TEXT_LEN:
        raise HTTPException(status_code=413, detail=f"Text too long (>{MAX_TEXT_LEN})")

    try:
        model = load_model_once()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Model load failed: {e}")

    t0 = time.time()
    try:
        raw = model(text)  # [[{label,score},{label,score},...]]
        scores = raw[0] if isinstance(raw, list) and raw and isinstance(raw[0], list) else raw
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Inference failed: {e}")
    latency = int((time.time() - t0) * 1000)

    p_neg = negative_sentiment_probability(scores)  # toxicity := P(negative)
    action, reason = decide_binary(p_neg, block=THRESHOLD_BLOCK, queue=THRESHOLD_QUEUE)

    result = {
        "action": action,                 # publish | queue | block
        "reason": reason,                 # e.g., "neg:0.68"
        "toxic_prob": round(p_neg, 4),   # keep field name for backend compatibility
        "latency_ms": latency,
        "meta": req.meta or {}
    }
    log_decision(result)
    return result
