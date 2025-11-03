# data_io.py — Postgres-backed store for MUS recommender (per-table embeddings, schema-aligned)
from __future__ import annotations
import json, math
from typing import Any, Dict, List, Optional, Tuple
from dataclasses import dataclass
import psycopg
from psycopg.rows import dict_row

# ---------- action weights (event interactions for now) ----------
ACTION_WEIGHT: Dict[str, float] = {
    "attend": 1.0,
    "register": 0.7,
    "click": 0.3,
    "view": 0.3,
    "dismiss": -0.5,
}

@dataclass
class EventRow:
    event_id: int
    title: str
    description: str
    start_time: str
    location: Optional[str]

class PgStore:
    def __init__(self, db_url: str):
        self.db_url = db_url
        self.conn: Optional[psycopg.Connection] = None

    # ----- connection -----
    def _ensure_conn(self) -> psycopg.Connection:
        if self.conn is None or self.conn.closed:
            self.conn = psycopg.connect(self.db_url, row_factory=dict_row, autocommit=True)
        return self.conn

    # ----- users -----
    def get_user_profile(self, user_id: int) -> Dict[str, Any]:
        sql = """
        SELECT id, interests_text, interest_embedding
          FROM public.users
         WHERE id = %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (user_id,))
            row = cur.fetchone()
        return row or {"id": user_id, "interests_text": "", "interest_embedding": None}

    def upsert_user_embedding(self, user_id: int, vector: List[float], interests_text: Optional[str] = None) -> None:
        if interests_text is None:
            sql = "UPDATE public.users SET interest_embedding = %s::jsonb WHERE id = %s"
            params = (json.dumps(vector), user_id)
        else:
            sql = "UPDATE public.users SET interest_embedding = %s::jsonb, interests_text = %s WHERE id = %s"
            params = (json.dumps(vector), interests_text, user_id)
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, params)

    # ===== EVENTS =====
    def fetch_events(self, future_only: bool = True, limit: Optional[int] = None) -> List[EventRow]:
        where = "WHERE start_time >= now()" if future_only else ""
        lim = f"LIMIT {int(limit)}" if limit else ""
        sql = f"""
        SELECT id AS event_id, title, COALESCE(description,'') AS description,
               start_time, location
          FROM public.campus_events
          {where}
          ORDER BY start_time ASC
          {lim}
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql)
            rows = cur.fetchall()
        return [EventRow(**row) for row in rows]

    def get_event_embedding(self, event_id: int) -> Optional[List[float]]:
        sql = "SELECT event_embedding FROM public.campus_events WHERE id = %s"
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (event_id,))
            row = cur.fetchone()
        return row["event_embedding"] if row and row["event_embedding"] is not None else None

    def upsert_event_embedding(self, event_id: int, vector: List[float]) -> None:
        sql = """
        UPDATE public.campus_events
           SET event_embedding = %s::jsonb,
               event_embedding_updated_at = now()
         WHERE id = %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (json.dumps(vector), event_id))

    # ===== NEWS (uses summary/body, published_at/created_at) =====
    def fetch_news(self, days_back: int = 60, limit: int = 300) -> List[Dict[str, Any]]:
        sql = """
        SELECT id AS news_id,
               title,
               COALESCE(summary, body, '') AS description,
               COALESCE(published_at, created_at) AS published_at
          FROM public.campus_news
         WHERE COALESCE(published_at, created_at) >= (now() - make_interval(days => %s))
         ORDER BY COALESCE(published_at, created_at) DESC
         LIMIT %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (days_back, limit))
            rows = cur.fetchall()
        return rows

    def get_news_embedding(self, news_id: int) -> Optional[List[float]]:
        sql = "SELECT news_embedding FROM public.campus_news WHERE id = %s"
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (news_id,))
            row = cur.fetchone()
        return row["news_embedding"] if row and row["news_embedding"] is not None else None

    def upsert_news_embedding(self, news_id: int, vector: List[float]) -> None:
        sql = """
        UPDATE public.campus_news
           SET news_embedding = %s::jsonb,
               news_embedding_updated_at = now()
         WHERE id = %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (json.dumps(vector), news_id))

    # ===== COMMUNITY POSTS (uses description, created_at) =====
    
    def fetch_posts(self, days_back: int = 60, limit: int = 300) -> List[Dict[str, Any]]:
        sql = """
        SELECT id AS post_id,
            title,
            COALESCE(description,'') AS description,
            created_at
        FROM public.community_posts
        WHERE moderation_status = 'publish'
        AND created_at >= (now() - make_interval(days => %s))
        ORDER BY created_at DESC
        LIMIT %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (days_back, limit))
            rows = cur.fetchall()
        return rows

    def get_post_embedding(self, post_id: int) -> Optional[List[float]]:
        sql = "SELECT post_embedding FROM public.community_posts WHERE id = %s"
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (post_id,))
            row = cur.fetchone()
        return row["post_embedding"] if row and row["post_embedding"] is not None else None

    def upsert_post_embedding(self, post_id: int, vector: List[float]) -> None:
        sql = """
        UPDATE public.community_posts
           SET post_embedding = %s::jsonb,
               post_embedding_updated_at = now()
         WHERE id = %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (json.dumps(vector), post_id))

    # ===== POLLS (uses description, expires_at) =====
    def fetch_polls(self, future_only: bool = True, limit: int = 200) -> List[Dict[str, Any]]:
        where = "WHERE expires_at IS NULL OR expires_at >= now()" if future_only else ""
        sql = f"""
        SELECT id AS poll_id,
               title,
               COALESCE(description,'') AS description,
               expires_at
          FROM public.polls
          {where}
          ORDER BY expires_at ASC NULLS LAST
          LIMIT %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (limit,))
            rows = cur.fetchall()
        return rows

    def get_poll_embedding(self, poll_id: int) -> Optional[List[float]]:
        sql = "SELECT poll_embedding FROM public.polls WHERE id = %s"
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (poll_id,))
            row = cur.fetchone()
        return row["poll_embedding"] if row and row["poll_embedding"] is not None else None

    def upsert_poll_embedding(self, poll_id: int, vector: List[float]) -> None:
        sql = """
        UPDATE public.polls
           SET poll_embedding = %s::jsonb,
               poll_embedding_updated_at = now()
         WHERE id = %s
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (json.dumps(vector), poll_id))

    # ----- interactions (event-focused for now) -----
    def append_interaction(self, user_id: int, event_id: int, action: str, ts_iso: Optional[str]) -> None:
        # public.rec_interactions(user_id, event_id, action, ts, meta)
        sql = """
        INSERT INTO public.rec_interactions (user_id, event_id, action, ts)
        VALUES (%s, %s, %s::public.rec_action, COALESCE(%s::timestamptz, now()))
        """
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (user_id, event_id, action, ts_iso))

    def fetch_user_interactions_with_embeddings(
        self, user_id: int, half_life_days: float = 14.0
    ) -> List[Tuple[List[float], float]]:
        """
        Returns list of (event_embedding, decayed_weight)
        decayed_weight = ACTION_WEIGHT[action] * exp(-lambda * age_days)
        where lambda = ln(2) / half_life_days
        """
        lam = math.log(2.0) / max(half_life_days, 1e-6)
        sql = """
        SELECT i.action, i.ts, ce.event_embedding
          FROM public.rec_interactions i
          JOIN public.campus_events ce ON ce.id = i.event_id
         WHERE i.user_id = %s
        """
        out: List[Tuple[List[float], float]] = []
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        with self._ensure_conn().cursor() as cur:
            cur.execute(sql, (user_id,))
            rows = cur.fetchall()
        if not rows:
            return out
        for r in rows:
            emb = r["event_embedding"]
            if emb is None:
                continue
            age_days = max((now - r["ts"]).total_seconds() / 86400.0, 0.0)
            base = ACTION_WEIGHT.get(r["action"], 0.0)
            w = base * math.exp(-lam * age_days)
            if w != 0.0:
                out.append((emb, w))
        return out
