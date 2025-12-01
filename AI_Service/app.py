# app.py — Unified FastAPI app for moderation + recommendations (GPU-lean)
# -----------------------------------------------------------------------------
# VRAM-safe moderation (no HF pipeline), same reco logic, file-based cache.

# ---- MUST be first lines (before importing transformers/torch) ----
import os
os.environ.setdefault("PYTORCH_CUDA_ALLOC_CONF", "max_split_size_mb:64,garbage_collection_threshold:0.6")
os.environ.setdefault("HF_HUB_OFFLINE", "1")

# -----------------------------------------------------------------------------
import pandas as pd
import numpy as np
import os, json, time, pathlib, math, psycopg
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Reuse your existing embedder (from recommendation/embedder.py)
from recommendation.embedder import Embedder
from recommendation.data_io import PgStore

ROOT = pathlib.Path(__file__).parent
with open(ROOT / "config.json", "r", encoding="utf-8") as f:
    CFG = json.load(f)

CORS_ORIGINS = CFG.get("cors", {}).get("allow_origins", ["*"])

DEBUG_RD = os.getenv("MUS_DEBUG_RECO", "0") == "1"
def dlog(*a):
    if DEBUG_RD:
        print("[RD]", *a, flush=True)

def _norm_id(v):
    try:
        if v is None or (isinstance(v, float) and not math.isfinite(v)):
            return None
        if isinstance(v, (int, np.integer)):
            return int(v)
        if isinstance(v, (float, np.floating)):
            return int(v)  # 9310.0 -> 9310
        if isinstance(v, str) and v.strip().isdigit():
            return int(v.strip())
    except Exception:
        pass
    return None

def _as_null(x):
    # turn pandas NaT or placeholder values into None
    if x in (None, "", "NaT", "nat", 0.0, 0, "0", "0000-00-00"):
        return None
    return x

def _normalize_items(headline, posts_top, polls_top):
    out_head=[]
    for it in headline:
        ct = it.get("content_type")
        e  = _norm_id(it.get("event_id"))
        n  = _norm_id(it.get("news_id"))
        out_head.append({
            "content_type": "event" if ct=="event" or (e and not n) else "news",
            "event_id": e if e else None,
            "news_id": n if n else None,
            "title": it.get("title"),
            "description": it.get("description"),
            "start_time": _as_null(it.get("start_time")),
            "published_at": _as_null(it.get("published_at")),
            # keep only meaningful extras; drop bogus 0.0 locations
            "location": it.get("location") if isinstance(it.get("location"), str) else None,
        })
    out_posts=[]
    for p in posts_top:
        out_posts.append({
            "content_type": "post",
            "post_id": _norm_id(p.get("post_id")),
            "title": p.get("title"),
            "description": p.get("description"),
            "created_at": _as_null(p.get("created_at")),
        })
    out_polls=[]
    for p in polls_top:
        out_polls.append({
            "content_type": "poll",
            "poll_id": _norm_id(p.get("poll_id")),
            "title": p.get("title"),
            "description": p.get("description"),
            "expires_at": _as_null(p.get("expires_at")),
        })
    return _json_safe({"user_id": user_id, "headline": headline, "posts": posts_top, "polls": polls_top})

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

def _rows_to_dicts(rows):
    out = []
    for r in rows or []:
        if isinstance(r, dict):
            out.append(r)
        elif hasattr(r, "_asdict"):
            out.append(r._asdict())
        elif hasattr(r, "__dict__"):
            out.append(dict(r.__dict__))
        else:
            # last resort
            try:
                out.append(dict(r))
            except Exception:
                out.append({"value": r})
    return out

# ---------------- Moderation ----------------
try:
    from moderation.decision import toxic_probability, decide_binary
    def _toxprob(scores): return float(toxic_probability(scores))
    def _decide(p, block, queue):
        try: return decide_binary(toxic_prob=p, threshold_block=block, threshold_queue=queue)
        except TypeError: return decide_binary(p, block, queue)
except ImportError:
    # compatibility fallback for older helper name
    from moderation.decision import negative_sentiment_probability, decide_binary
    def _toxprob(scores): return float(negative_sentiment_probability(scores))
    def _decide(p, block, queue):
        try: return decide_binary(toxic_prob=p, threshold_block=block, threshold_queue=queue)
        except TypeError: return decide_binary(p, block, queue)

from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch
from torch.nn import functional as F

MOD_CFG = CFG.get("moderation", {})
MOD_MODEL = MOD_CFG.get("model", "cardiffnlp/twitter-roberta-base-sentiment-latest")
MOD_DEVICE = os.getenv("MUS_DEVICE", MOD_CFG.get("device", "cuda"))

THRESH_BLOCK = float(MOD_CFG.get("thresholds", {}).get("block", 0.70))
THRESH_QUEUE = float(MOD_CFG.get("thresholds", {}).get("queue", 0.40))
MAX_TEXT_LEN = int(MOD_CFG.get("maxTextLength", 2000))
FILE_LOGGING = bool(MOD_CFG.get("fileLogging", True))
BATCH_MAX_LEN = 96  # keep small for 4–6GB VRAM

LOG_PATH = ROOT / "data" / "moderation_log.jsonl"
LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

def _resolve_model_path(m):
    p = (ROOT / m) if isinstance(m, str) else None
    return str(p) if p and p.exists() else m

def _pick_device_idx():
    if (MOD_DEVICE or "").lower() == "cpu":
        return -1
    if (MOD_DEVICE or "").lower().startswith("cuda"):
        try:
            return int(str(MOD_DEVICE).split(":")[1])
        except Exception:
            return 0 if torch.cuda.is_available() else -1
    return 0 if torch.cuda.is_available() else -1

_device = _pick_device_idx()

# --- Windows-safe path for local model (absolute, forward slashes) ---
model_path = Path(_resolve_model_path(MOD_MODEL)).resolve()
model_path_str = model_path.as_posix()
print(f"[INFO] Loading local model from: {model_path_str}")

# Load tokenizer + model strictly locally (no internet)
_tok = AutoTokenizer.from_pretrained(model_path_str, local_files_only=True)
_model_kwargs = {"torch_dtype": torch.float16} if _device >= 0 else {}
_mod = AutoModelForSequenceClassification.from_pretrained(
    model_path_str,
    local_files_only=True,
    **_model_kwargs
).eval()

# Make it VRAM-friendly
torch.set_grad_enabled(False)
if torch.cuda.is_available():
    torch.backends.cudnn.benchmark = False
    torch.backends.cudnn.allow_tf32 = False

if _device >= 0:
    _mod = _mod.half().to(_device)
_mod.eval()

_LABELS = ["negative", "neutral", "positive"]  # for cardiffnlp/twitter-roberta-base-sentiment-latest

def _score_one(text: str) -> Dict[str, Any]:
    """Memory-lean forward pass for ONE text."""
    enc = _tok(
        text,
        truncation=True,
        max_length=BATCH_MAX_LEN,
        padding=False,
        return_tensors="pt"
    )
    if _device >= 0:
        enc = {k: v.to(_device, non_blocking=True) for k, v in enc.items()}

    with torch.inference_mode():
        if _device >= 0:
            with torch.cuda.amp.autocast():
                out = _mod(**enc)
        else:
            out = _mod(**enc)

    probs = F.softmax(out.logits.float(), dim=-1)[0].tolist()
    best = int(max(range(len(probs)), key=lambda i: probs[i]))
    return {"label": _LABELS[best], "score": probs[best], "probs": probs}

# ---------------- Recommender ----------------
from recommendation.embedder import Embedder
from recommendation.data_io import PgStore
from recommendation.scoring import top_k_with_profile

RECO_CFG = CFG.get("reco", {})
RECO_MODEL = RECO_CFG.get("model", "sentence-transformers/all-MiniLM-L6-v2")
# Default to CPU; can override with MUS_RECO_DEVICE=cuda:0
RECO_DEVICE = os.getenv("MUS_RECO_DEVICE", RECO_CFG.get("device", "cpu"))
ALPHA_DEFAULT = float(RECO_CFG.get("alpha", 0.6))
LAMBDA_DEFAULT = float(RECO_CFG.get("lambda_decay", 0.02))
MAX_EVENTS = int(RECO_CFG.get("max_events", 500))
FUTURE_ONLY_DEFAULT = True

DB_URL = CFG.get("db_url") or os.environ.get("DATABASE_URL")
if not DB_URL:
    raise RuntimeError("Missing db_url in config.json or DATABASE_URL environment variable")

embedder = Embedder(RECO_MODEL, device=RECO_DEVICE)
store = PgStore(DB_URL)

app = FastAPI(title="MUS AI Hub", version="1.2.3")
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
    try: _ = _score_one("ok")
    except Exception: ok_mod = False
    return _json_safe({
        "ok": (ok_db and ok_mod),
        "services": {
            "moderation": {"ok": ok_mod, "model": MOD_MODEL, "device": MOD_DEVICE},
            "reco": {"ok": ok_db, "model": RECO_MODEL, "device": RECO_DEVICE},
        }
    })

# ---- Schemas & small utils (place above the /moderate route) ----
class ModerationIn(BaseModel):
    text: str
    # optional metadata your frontend may send (e.g., user_id, content_id)
    meta: Optional[Dict[str, Any]] = None

def _log_line(obj: Dict[str, Any]) -> None:
    """Append one JSON line into moderation_log.jsonl (safe on Windows)."""
    try:
        LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
        with open(LOG_PATH, "a", encoding="utf-8") as f:
            f.write(json.dumps(_json_safe(obj), ensure_ascii=False) + "\n")
    except Exception:
        pass  # logging must never crash the API

# ---------------- Moderation ----------------
@app.post("/moderate")
def moderate(inp: ModerationIn):
    t0 = time.time()
    text = (inp.text or "").strip()
    if not text:
        return _json_safe({"action": "publish", "reason": "empty", "toxic_prob": 0.0, "latency_ms": 0})
    if len(text) > MAX_TEXT_LEN:
        text = text[:MAX_TEXT_LEN]

    # score exactly one text to keep peak VRAM tiny
    s = _score_one(text)
    # adapt to your decision.py helper shape: wrap like pipeline output
    scores_like_pipeline = [{"label": s["label"], "score": s["score"]}]
    pneg = _toxprob(scores_like_pipeline)
    action, reason = _decide(pneg, THRESH_BLOCK, THRESH_QUEUE)

    resp = {
        "action": action,
        "reason": reason,
        "toxic_prob": pneg,
        "latency_ms": int((time.time() - t0) * 1000),
        "meta": inp.meta or {}
    }
    _log_line({**resp, "text": text, "ts": datetime.utcnow().isoformat() + "Z"})
    # optional: free tiny temp cache
    try:
        if _device >= 0: torch.cuda.empty_cache()
    except Exception:
        pass
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

class EphemeralDashboardIn(BaseModel):
    interests_text: str
    k_headline: int = 12
    k_posts: int = 6
    k_polls: int = 6
    future_only: bool = True
    news_days_back: int = 60
    posts_days_back: int = 60

# ---------------- Interactions ----------------
class InteractIn(BaseModel):
    user_id: str
    content_id: str    # Renamed from event_id
    content_type: str  # New field
    action: str
    timestamp: Optional[str] = None

@app.post("/interact")
def interact(inp: InteractIn):
    try:
        # Pass new fields to the store
        store.append_interaction(
            user_id=int(inp.user_id), 
            content_id=int(inp.content_id),
            content_type=inp.content_type,
            action=inp.action, 
            ts_iso=inp.timestamp
        )
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

# ---------------- User interests → embedding ----------------

class InterestsIn(BaseModel):
    user_id: int
    text: str

@app.post("/embed_interests")
def embed_interests(payload: InterestsIn):
    """
    Compute interest embedding from free-text and persist to users.interest_embedding.
    Also updates interests_text for consistency.
    """
    user_id = int(payload.user_id)
    text = (payload.text or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    # 1) compute vector with the global embedder (already created above)
    vec = embedder.embed_texts([text])[0]

    # 2) persist to Postgres using the same DB_URL loaded at startup
    try:
        with psycopg.connect(DB_URL) as conn:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    UPDATE public.users
                       SET interest_embedding = %s::jsonb,
                           interests_text    = %s,
                           updated_at        = NOW()
                     WHERE id = %s
                    """,
                    (json.dumps(vec), text, user_id)
                )
            conn.commit()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"persist failed: {e}")

    return _json_safe({"ok": True, "user_id": user_id, "dim": len(vec)})

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
    k_headline: int = 12,
    k_posts: int = 6,
    k_polls: int = 6,
    alpha: float = ALPHA_DEFAULT,
    lambda_decay: float = LAMBDA_DEFAULT,
    future_only: bool = True,
    news_days_back: int = 60,
    posts_days_back: int = 60
):
    try:
        dlog(f"req user_id={user_id} k=({k_headline},{k_posts},{k_polls}) future_only={future_only}")

        # (1) fetch candidates
        raw_events = store.fetch_events(future_only=future_only, limit=MAX_EVENTS)
        events = _rows_to_dicts(raw_events)
        news   = _rows_to_dicts(store.fetch_news(days_back=news_days_back,  limit=MAX_EVENTS))
        posts  = _rows_to_dicts(store.fetch_posts(days_back=posts_days_back, limit=MAX_EVENTS))
        polls  = _rows_to_dicts(store.fetch_polls(future_only=future_only, limit=MAX_EVENTS))
        dlog(f"fetch counts ev={len(events)} news={len(news)} posts={len(posts)} polls={len(polls)}")

        if not events and future_only:
            dlog("no events with future_only=True → refetch without future filter")
            events = _rows_to_dicts(store.fetch_events(future_only=False, limit=MAX_EVENTS))
            dlog(f"refetch events count={len(events)}")

        # (2) ensure embeddings
        events = _ensure_embeddings(events, "event")
        news   = _ensure_embeddings(news,   "news")
        posts  = _ensure_embeddings(posts,  "post")
        polls  = _ensure_embeddings(polls,  "poll")
        dlog(
            "emb dims",
            f"ev={[len(x.get('embedding') or []) for x in events[:3]]}",
            f"news={[len(x.get('embedding') or []) for x in news[:3]]}",
            f"posts={[len(x.get('embedding') or []) for x in posts[:3]]}",
            f"polls={[len(x.get('embedding') or []) for x in polls[:3]]}",
        )

        # (2.1) filter invalid vecs
        before = (len(events), len(news), len(posts), len(polls))
        events = [e for e in events if _has_valid_vec(e)]
        news   = [n for n in news   if _has_valid_vec(n)]
        posts  = [p for p in posts  if _has_valid_vec(p)]
        polls  = [p for p in polls  if _has_valid_vec(p)]
        after  = (len(events), len(news), len(posts), len(polls))
        dlog(f"filter valid_vecs before={before} after={after}")

        # (3) user vector
        user_vec = _blend_user_vector(int(user_id), alpha=float(alpha), lambda_decay=float(lambda_decay))
        dlog(f"user_vec={'none' if user_vec is None else 'len='+str(len(user_vec))}")

        if user_vec is None:
            headline = (
                sorted(events, key=lambda x: (x.get('start_time') or x.get('end_time') or ''))[: k_headline // 2] +
                sorted(news,   key=lambda x: (x.get('published_at') or ''), reverse=True)[: k_headline - (k_headline // 2)]
            )
            for it in headline: it["content_type"] = "event" if "event_id" in it else "news"
            posts_top = sorted(posts, key=lambda x: (x.get('created_at') or ''), reverse=True)[:k_posts]
            for it in posts_top: it["content_type"] = "post"
            polls_top = sorted(polls, key=lambda x: (x.get('expires_at') or ''))[:k_polls]
            for it in polls_top: it["content_type"] = "poll"
            dlog(f"FALLBACK headline={len(headline)} posts={len(posts_top)} polls={len(polls_top)}")
            return _json_safe({"user_id": user_id, "headline": headline, "posts": posts_top, "polls": polls_top})

        # (4) rank
        uv = np.asarray(user_vec, dtype="float32")

        def _rank(items, k):
            if not items:
                return []
            df = pd.DataFrame(items)
            dlog("rank input", f"rows={len(df)} cols={list(df.columns)}")
            top = top_k_with_profile(df, uv, k=int(k))
            out = top.to_dict(orient="records")
            dlog("rank output", f"rows={len(out)}")
            return out

        headline = _rank(
            [{**e, "content_type": "event"} for e in events] +
            [{**n, "content_type": "news"}  for n in news],
            k_headline
        )
        posts_top = [{**p, "content_type": "post"} for p in _rank(posts, k_posts)]
        polls_top = [{**p, "content_type": "poll"} for p in _rank(polls, k_polls)]

        dlog(
            f"FINAL headline={len(headline)} posts={len(posts_top)} polls={len(polls_top)}",
            f"head sample={[{'ct':it.get('content_type'),'eid':it.get('event_id'),'nid':it.get('news_id')} for it in headline[:3]]}"
        )
        return _json_safe({"user_id": user_id, "headline": headline, "posts": posts_top, "polls": polls_top})

    except Exception as e:
        dlog("EXC /recommend_dashboard:", repr(e))
        raise



# -------- Simple file-based cache helpers for /recommend_dashboard_cached --------
_CACHE_DIR = ROOT / "data" / "reco_cache"
_CACHE_DIR.mkdir(parents=True, exist_ok=True)

def _cache_path(uid: int) -> Path:
    return _CACHE_DIR / f"user_{uid}.json"

def _read_cache_row(user_id: int) -> Optional[Dict[str, Any]]:
    p = _cache_path(user_id)
    if not p.exists(): return None
    try:
        with open(p, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None

def _write_cache_row(user_id: int, headline, posts, polls) -> None:
    p = _cache_path(user_id)
    obj = {
        "user_id": user_id,
        "headline": headline,
        "posts": posts,
        "polls": polls,
        "updated_at": datetime.utcnow().isoformat() + "Z"
    }
    try:
        with open(p, "w", encoding="utf-8") as f:
            json.dump(_json_safe(obj), f, ensure_ascii=False)
    except Exception:
        pass

def _is_fresh(ts_iso: str, ttl_minutes: int = 5) -> bool:
    try:
        ts = datetime.fromisoformat(ts_iso.replace("Z", "+00:00"))
        return datetime.utcnow() - ts <= timedelta(minutes=ttl_minutes)
    except Exception:
        return False

def _shape_headline_for_cache(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    # Updated: Only keep IDs and Type. Backend will hydrate details.
    out = []
    for it in items:
        # We need to distinguish between Event and News
        entry = {
            "content_type": it.get("content_type"),
            # Only keep the relevant ID
            "event_id": it.get("event_id"), 
            "news_id": it.get("news_id")
        }
        # Add score if available for debugging, but mostly we just need IDs
        if "score" in it:
            entry["score"] = it["score"]
        out.append(entry)
    return out
    
def _shape_simple_for_cache(items: List[Dict[str, Any]], id_key: str) -> List[Dict[str, Any]]:
    keep = {id_key,"title","description","created_at","expires_at","content_type"}
    return [{k:v for k,v in it.items() if k in keep} for it in items]

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
        if cached and _is_fresh(cached.get("updated_at","")):
            return _json_safe({
                "user_id": user_id,
                "headline": cached["headline"],
                "posts": cached["posts"],
                "polls": cached["polls"],
                "cached": True
            })
    except Exception:
        pass

    # 2) compute
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
        headline = (resp["headline"])
        posts    = _shape_simple_for_cache(resp["posts"], "post_id")
        polls    = _shape_simple_for_cache(resp["polls"], "poll_id")
        _write_cache_row(user_id, headline, posts, polls)
    except Exception:
        pass

    resp["cached"] = False
    return _json_safe(resp)

@app.post("/recommend_dashboard_ephemeral")
def recommend_dashboard_ephemeral(inp: EphemeralDashboardIn):
    """
    For VISITORS (no account). Uses only the provided interests_text to build a
    temporary user vector. Does NOT write anything to users or rec_interactions,
    but WILL ensure content embeddings are created for items that are missing.
    """
    text = (inp.interests_text or "").strip()
    if not text:
        # No interests provided: just behave like a time-based cold start
        events = store.fetch_events(future_only=inp.future_only, limit=inp.k_headline)
        news = store.fetch_news(days_back=inp.news_days_back, limit=inp.k_headline)
        posts = store.fetch_posts(days_back=inp.posts_days_back, limit=inp.k_posts)
        polls = store.fetch_polls(future_only=True, limit=inp.k_polls)

        # Shape into the same structure as /recommend_dashboard cold start
        # headline = mix of events + news sorted by time
        for ev in events:
            ev["content_type"] = "event"
        for nw in news:
            nw["content_type"] = "news"

        headline = events + news
        headline.sort(
            key=lambda it: (
                it.get("start_time")
                or it.get("published_at")
                or it.get("created_at")
                or "9999-12-31"
            )
        )

        return {
            "user_id": None,
            "headline": headline[: inp.k_headline],
            "posts": posts[: inp.k_posts],
            "polls": polls[: inp.k_polls],
            "meta": {"mode": "time_based", "ephemeral": True},
        }

    # 1) Embed the visitor's interests text
    user_vec_list = embedder.embed_texts([text])
    user_vec = user_vec_list[0]  # plain Python list of floats

    # 2) Fetch candidate content (no per-user filters)
    events = store.fetch_events(future_only=inp.future_only)
    news = store.fetch_news(days_back=inp.news_days_back)
    posts = store.fetch_posts(days_back=inp.posts_days_back)
    polls = store.fetch_polls(future_only=True)

    # 3) Ensure embeddings exist in DB (creates + saves if missing)
    events = _ensure_embeddings(events, "event")
    news = _ensure_embeddings(news, "news")
    posts = _ensure_embeddings(posts, "post")
    polls = _ensure_embeddings(polls, "poll")

    # 4) Filter out any items without valid vectors
    events_vec = [it for it in events if _has_valid_vec(it)]
    news_vec = [it for it in news if _has_valid_vec(it)]
    posts_vec = [it for it in posts if _has_valid_vec(it)]
    polls_vec = [it for it in polls if _has_valid_vec(it)]

    # 5) Score & pick top-k using the same scoring util as /recommend_dashboard
    import pandas as pd
    from recommendation.scoring import top_k_with_profile

    headline_items = []
    if events_vec or news_vec:
        # For headline, combine events + news, then rank them together
        ev_df = pd.DataFrame(events_vec)
        nw_df = pd.DataFrame(news_vec)
        ev_df["content_type"] = "event"
        nw_df["content_type"] = "news"
        combo_df = pd.concat([ev_df, nw_df], ignore_index=True)

        top_headline = top_k_with_profile(combo_df, user_vec, inp.k_headline)
        headline_items = top_headline.to_dict(orient="records")

    posts_items = []
    if posts_vec:
        po_df = pd.DataFrame(posts_vec)
        po_df["content_type"] = "post"
        top_posts = top_k_with_profile(po_df, user_vec, inp.k_posts)
        posts_items = top_posts.to_dict(orient="records")

    polls_items = []
    if polls_vec:
        pl_df = pd.DataFrame(polls_vec)
        pl_df["content_type"] = "poll"
        top_polls = top_k_with_profile(pl_df, user_vec, inp.k_polls)
        polls_items = top_polls.to_dict(orient="records")

    return _json_safe(
        {
            "user_id": None,
            "headline": headline_items,
            "posts": posts_items,
            "polls": polls_items,
            "meta": {"mode": "interest_based", "ephemeral": True},
        }
    )
