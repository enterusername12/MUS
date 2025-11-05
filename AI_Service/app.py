# app.py — Unified FastAPI app for moderation + recommendations (schema-aligned, JSON-safe)
import pandas as pd
import numpy as np
import os, json, time, pathlib, math
from typing import Optional, List, Dict, Any
from datetime import datetime

import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

ROOT = pathlib.Path(__file__).parent
with open(ROOT / "config.json", "r", encoding="utf-8") as f:
    CFG = json.load(f)

CORS_ORIGINS = CFG.get("cors", {}).get("allow_origins", ["*"])

# ---------------- JSON sanitizers ----------------
def _json_safe(x):
    """Recursively convert to JSON-safe types, replacing NaN/Inf with 0.0."""
    if isinstance(x, float):
        return 0.0 if not math.isfinite(x) else x
    if isinstance(x, (np.floating,)):
        v = float(x)
        return 0.0 if not math.isfinite(v) else v
    if isinstance(x, (np.integer,)):
        return int(x)
    if isinstance(x, (np.ndarray,)):
        return [_json_safe(v) for v in x.tolist()]
    if isinstance(x, dict):
        return {k: _json_safe(v) for k, v in x.items()}
    if isinstance(x, (list, tuple)):
        return [_json_safe(v) for v in x]
    return x

def _has_valid_vec(it):
    v = it.get("embedding")
    if not isinstance(v, list) or not v:
        return False
    for x in v:
        if isinstance(x, (int, float, np.floating)) and math.isfinite(float(x)) and float(x) != 0.0:
            return True
    return False

# ---------------- Moderation ----------------
try:
    from moderation.decision import toxic_probability, decide_binary
    def _toxprob(scores): return float(toxic_probability(scores))
    def _decide(p, block, queue):
        try: return decide_binary(toxic_prob=p, threshold_block=block, threshold_queue=queue)
        except TypeError: return decide_binary(p, block, queue)
except ImportError:
    from moderation.decision import negative_sentiment_probability, decide_binary
    def _toxprob(scores): return float(negative_sentiment_probability(scores))
    def _decide(p, block, queue):
        try: return decide_binary(toxic_prob=p, threshold_block=block, threshold_queue=queue)
        except TypeError: return decide_binary(p, block, queue)

from transformers import pipeline
MOD_CFG = CFG.get("moderation", {})
MOD_MODEL = MOD_CFG.get("model", "cardiffnlp/twitter-roberta-base-sentiment-latest")
MOD_DEVICE = MOD_CFG.get("device", "cuda")
THRESH_BLOCK = float(MOD_CFG.get("thresholds", {}).get("block", 0.70))
THRESH_QUEUE = float(MOD_CFG.get("thresholds", {}).get("queue", 0.40))
MAX_TEXT_LEN = int(MOD_CFG.get("maxTextLength", 2000))
FILE_LOGGING = bool(MOD_CFG.get("fileLogging", True))
LOG_PATH = ROOT / "data" / "moderation_log.jsonl"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
_device = 0 if (MOD_DEVICE or "").lower() == "cuda" else -1
sentiment = pipeline("sentiment-analysis", model=MOD_MODEL, device=_device)

class ModerationIn(BaseModel):
    text: str
    meta: Optional[Dict[str, Any]] = None

def _log_line(data: Dict[str, Any]) -> None:
    if not FILE_LOGGING: return
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LOG_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(_json_safe(data), ensure_ascii=False) + "\n")

# ---------------- Recommender ----------------
from recommendation.embedder import Embedder
from recommendation.data_io import PgStore
from recommendation.scoring import top_k_with_profile

RECO_CFG = CFG.get("reco", {})
RECO_MODEL = RECO_CFG.get("model", "sentence-transformers/all-MiniLM-L6-v2")
RECO_DEVICE = RECO_CFG.get("device", "cuda")
ALPHA_DEFAULT = float(RECO_CFG.get("alpha", 0.6))
LAMBDA_DEFAULT = float(RECO_CFG.get("lambda_decay", 0.02))
MAX_EVENTS = int(RECO_CFG.get("max_events", 500))
FUTURE_ONLY_DEFAULT = True

DB_URL = CFG.get("db_url") or os.environ.get("DATABASE_URL")
if not DB_URL:
    raise RuntimeError("Missing db_url in config.json or DATABASE_URL environment variable")

embedder = Embedder(RECO_MODEL, device=RECO_DEVICE)
store = PgStore(DB_URL)

app = FastAPI(title="MUS AI Hub", version="1.2.2")
app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- Health ----------------
@app.get("/health")
def health():
    ok_db = True; ok_mod = True
    try: _ = store.fetch_events(future_only=True, limit=1)
    except Exception: ok_db = False
    try: _ = sentiment("ok")
    except Exception: ok_mod = False
    return _json_safe({
        "ok": (ok_db and ok_mod),
        "services": {
            "moderation": {"ok": ok_mod, "model": MOD_MODEL, "device": MOD_DEVICE},
            "reco": {"ok": ok_db, "model": RECO_MODEL, "device": RECO_DEVICE},
        }
    })

# ---------------- Moderation ----------------
@app.post("/moderate")
def moderate(inp: ModerationIn):
    t0 = time.time()
    text = (inp.text or "").strip()
    if not text:
        return _json_safe({"action": "publish", "reason": "empty", "toxic_prob": 0.0, "latency_ms": 0})
    if len(text) > MAX_TEXT_LEN:
        text = text[:MAX_TEXT_LEN]
    scores = sentiment(text)
    pneg = _toxprob(scores)
    action, reason = _decide(pneg, THRESH_BLOCK, THRESH_QUEUE)
    resp = {
        "action": action, "reason": reason, "toxic_prob": pneg,
        "latency_ms": int((time.time() - t0) * 1000), "meta": inp.meta or {}
    }
    _log_line({**resp, "text": text, "ts": datetime.utcnow().isoformat() + "Z"})
    return _json_safe(resp)

# ---------------- Embed (create/update hooks) ----------------
class EmbedIn(BaseModel):
    content_type: str   # 'event'|'news'|'post'|'poll'|'user'
    content_id: int
    text: str
    overwrite: bool = True

@app.post("/embed")
def embed_item(inp: EmbedIn):
    txt = (inp.text or "").strip()
    if not txt:
        raise HTTPException(status_code=400, detail="text is required")
    vec = embedder.embed_texts([txt])[0]
    try:
        ct = (inp.content_type or "").lower()
        if ct == "user":
            store.upsert_user_embedding(inp.content_id, vec, interests_text=txt)
        elif ct == "event":
            store.upsert_event_embedding(inp.content_id, vec)
        elif ct == "news":
            store.upsert_news_embedding(inp.content_id, vec)
        elif ct == "post":
            store.upsert_post_embedding(inp.content_id, vec)
        elif ct == "poll":
            store.upsert_poll_embedding(inp.content_id, vec)
        else:
            raise HTTPException(status_code=400, detail=f"unsupported content_type: {inp.content_type}")
        return _json_safe({"status": "ok"})
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"embed failed: {e}")

# ---------------- Interactions (events for now) ----------------
class InteractIn(BaseModel):
    user_id: str
    event_id: str
    action: str
    timestamp: Optional[str] = None

@app.post("/interact")
def interact(inp: InteractIn):
    try:
        store.append_interaction(user_id=int(inp.user_id), event_id=int(inp.event_id),
                                 action=inp.action, ts_iso=inp.timestamp)
        return _json_safe({"status": "ok", "logged": True})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"interaction failed: {e}")

# ---------------- Helpers ----------------
def _ensure_embeddings(items: List[Dict[str, Any]], content_type: str) -> List[Dict[str, Any]]:
    id_key = {
        "event": "event_id",
        "news":  "news_id",
        "post":  "post_id",
        "poll":  "poll_id",
    }[content_type]

    getters = {
        "event": store.get_event_embedding,
        "news":  store.get_news_embedding,
        "post":  store.get_post_embedding,
        "poll":  store.get_poll_embedding,
    }
    upserters = {
        "event": store.upsert_event_embedding,
        "news":  store.upsert_news_embedding,
        "post":  store.upsert_post_embedding,
        "poll":  store.upsert_poll_embedding,
    }
    get_emb = getters[content_type]
    upsert  = upserters[content_type]

    out, to_ids, to_texts = [], [], []
    for it in items:
        cid = int(it[id_key])
        emb = get_emb(cid)
        if emb is None:
            text = f"{it.get('title') or ''} {it.get('description') or ''}".strip()
            to_ids.append(cid)
            to_texts.append(text)
            itm = dict(it); itm["embedding"] = None
            out.append(itm)
        else:
            itm = dict(it); itm["embedding"] = emb
            out.append(itm)

    if to_ids:
        vecs = embedder.embed_texts(to_texts)
        for cid, vec in zip(to_ids, vecs):
            upsert(cid, vec)
        fill = {cid: vec for cid, vec in zip(to_ids, vecs)}
        for itm in out:
            if itm["embedding"] is None:
                itm["embedding"] = fill.get(int(itm[id_key]))
    return out

def _blend_user_vector(user_id: int, alpha: float, lambda_decay: float) -> Optional[List[float]]:
    profile = store.get_user_profile(user_id)
    prof_vec = profile.get("interest_embedding") if profile else None

    half_life_days = max(1e-6, 1.0 / max(lambda_decay, 1e-6))
    pairs = store.fetch_user_interactions_with_embeddings(user_id, half_life_days=half_life_days)

    inter_vec = None
    if pairs:
        num, denom = None, 0.0
        for vec, w in pairs:
            v = np.asarray(vec, dtype="float32")
            num = v * w if num is None else (num + v * w)
            denom += abs(w)
        if num is not None and denom > 0:
            inter_vec = (num / denom).astype("float32")

    if prof_vec is None and inter_vec is None:
        return None
    if prof_vec is None:
        return inter_vec.tolist()
    if inter_vec is None:
        return prof_vec
    pv = np.asarray(prof_vec, dtype="float32")
    iv = np.asarray(inter_vec, dtype="float32")
    uv = alpha * pv + (1.0 - alpha) * iv
    return uv.astype("float32").tolist()

# ---------------- Events-only (kept) ----------------
@app.get("/recommend")
def recommend(
    user_id: int,
    k: int = 8,
    alpha: float = ALPHA_DEFAULT,
    lambda_decay: float = LAMBDA_DEFAULT,
    future_only: bool = FUTURE_ONLY_DEFAULT
):
    try:
        rows = store.fetch_events(future_only=future_only, limit=MAX_EVENTS)
        events = [dict(r.__dict__) for r in rows]
        if not events:
            return _json_safe({"user_id": user_id, "items": []})

        events = _ensure_embeddings(events, "event")
        events = [e for e in events if _has_valid_vec(e)]

        user_vec = _blend_user_vector(int(user_id), alpha=float(alpha), lambda_decay=float(lambda_decay))
        if user_vec is None:
            items = sorted(events, key=lambda x: (x.get("start_time") or ""))[:k]
            return _json_safe({"user_id": user_id, "items": items})

        df = pd.DataFrame(events)
        top = top_k_with_profile(df, np.asarray(user_vec, dtype="float32"), k=int(k))
        return _json_safe({"user_id": user_id, "items": top.to_dict(orient="records")})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"recommend failed: {e}")

# ---------------- Dashboard: combined headline + separate posts & polls ----------------
@app.get("/recommend_dashboard")
def recommend_dashboard(
    user_id: int,
    k_headline: int = 12,   # combined Events + News
    k_posts: int = 6,       # top posts
    k_polls: int = 6,       # top polls
    alpha: float = ALPHA_DEFAULT,
    lambda_decay: float = LAMBDA_DEFAULT,
    future_only: bool = True,
    news_days_back: int = 60,
    posts_days_back: int = 60
):
    try:
        # 1) Fetch candidates (schema-aware)
        events = [dict(r.__dict__) for r in store.fetch_events(future_only=future_only, limit=MAX_EVENTS)]
        news   = store.fetch_news(days_back=news_days_back,  limit=MAX_EVENTS)
        posts  = store.fetch_posts(days_back=posts_days_back, limit=MAX_EVENTS)
        polls  = store.fetch_polls(future_only=future_only, limit=MAX_EVENTS)

        # 2) Ensure embeddings
        events = _ensure_embeddings(events, "event")
        news   = _ensure_embeddings(news,   "news")
        posts  = _ensure_embeddings(posts,  "post")
        polls  = _ensure_embeddings(polls,  "poll")

        # 2.1) Drop items with obviously invalid vectors (prevents NaN scores)
        events = [e for e in events if _has_valid_vec(e)]
        news   = [n for n in news   if _has_valid_vec(n)]
        posts  = [p for p in posts  if _has_valid_vec(p)]
        polls  = [p for p in polls  if _has_valid_vec(p)]

        # 3) Build user vector
        user_vec = _blend_user_vector(int(user_id), alpha=float(alpha), lambda_decay=float(lambda_decay))

        # Fallback (no user signal): sort by recency/soonest, tag content_type
        if user_vec is None:
            headline = (
                sorted(events, key=lambda x: (x.get("start_time") or ""))[: k_headline // 2] +
                sorted(news, key=lambda x: (x.get("published_at") or ""), reverse=True)[: k_headline - (k_headline // 2)]
            )
            posts_top = sorted(posts, key=lambda x: (x.get("created_at") or ""), reverse=True)[:k_posts]
            polls_top = sorted(polls, key=lambda x: (x.get("expires_at") or ""))[:k_polls]
            for it in headline: it["content_type"] = "event" if "event_id" in it else "news"
            for it in posts_top: it["content_type"] = "post"
            for it in polls_top: it["content_type"] = "poll"
            return _json_safe({"user_id": user_id, "headline": headline, "posts": posts_top, "polls": polls_top})

        # 4) Rank with cosine to user_vec
        uv = np.asarray(user_vec, dtype="float32")

        def _rank(items: List[Dict[str, Any]], k: int) -> List[Dict[str, Any]]:
            if not items:
                return []
            df = pd.DataFrame(items)
            top = top_k_with_profile(df, uv, k=int(k))
            # Optional: filter NaN/Inf in scores after ranking (safety)
            records = top.to_dict(orient="records")
            return [r for r in records if all(math.isfinite(float(v)) if isinstance(v, (int, float, np.floating)) else True for v in r.values())]

        headline = _rank(
            [{**e, "content_type": "event"} for e in events] +
            [{**n, "content_type": "news"}  for n in news],
            k_headline
        )
        posts_top = [{**p, "content_type": "post"} for p in _rank(posts, k_posts)]
        polls_top = [{**p, "content_type": "poll"} for p in _rank(polls, k_polls)]

        return _json_safe({"user_id": user_id, "headline": headline, "posts": posts_top, "polls": polls_top})

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"recommend_dashboard failed: {e}")

@app.get("/recommend_dashboard_cached")
def recommend_dashboard_cached(
    user_id: int,
    k_headline: int = 12,
    k_posts: int = 6,
    k_polls: int = 6,
    alpha: float = ALPHA_DEFAULT,
    lambda_decay: float = LAMBDA_DEFAULT,
    future_only: bool = True,
    news_days_back: int = 60,
    posts_days_back: int = 60
):
    # 1) try cache
    try:
        cached = _read_cache_row(user_id)
        if cached and _is_fresh(cached["updated_at"]):
            return _json_safe({
                "user_id": user_id,
                "headline": cached["headline"],
                "posts": cached["posts"],
                "polls": cached["polls"],
                "cached": True
            })
    except Exception:
        # ignore cache read errors, fall through to compute
        pass

    # 2) compute (reuse your existing logic)
    resp = recommend_dashboard(
        user_id=user_id,
        k_headline=k_headline,
        k_posts=k_posts,
        k_polls=k_polls,
        alpha=alpha,
        lambda_decay=lambda_decay,
        future_only=future_only,
        news_days_back=news_days_back,
        posts_days_back=posts_days_back
    )
    # 3) write cache
    try:
        headline = _shape_headline_for_cache(resp["headline"])
        posts    = _shape_simple_for_cache(resp["posts"], "post_id")
        polls    = _shape_simple_for_cache(resp["polls"], "poll_id")
        _write_cache_row(user_id, headline, posts, polls)
    except Exception:
        # cache write shouldn't break the API response
        pass

    resp["cached"] = False
    return _json_safe(resp)
