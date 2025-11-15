# recommendation/embedder.py
from typing import List
import torch
from sentence_transformers import SentenceTransformer

class Embedder:
    """
    Thin wrapper around SentenceTransformer that can load from local path
    and gracefully fall back to CPU if GPU unavailable or low VRAM.
    """

    def __init__(self, model_path_or_name: str = "models/all-MiniLM-L6-v2",
                 device: str = "cpu", normalize: bool = True):
        # --- Device handling ---
        dev = (device or "cpu").lower()
        if dev.startswith("cuda") and torch.cuda.is_available():
            self.device = dev
        else:
            self.device = "cpu"

        # --- Load model (local path or HF ID) ---
        self.model = SentenceTransformer(model_path_or_name, device=self.device)
        self.normalize = normalize

    def embed_texts(self, texts: List[str], batch_size: int = 16) -> List[List[float]]:
        if not isinstance(texts, list):
            texts = [str(texts)]

        # Encode safely (small batches to avoid VRAM overflow)
        vecs = self.model.encode(
            texts,
            batch_size=batch_size,
            convert_to_numpy=True,
            normalize_embeddings=self.normalize,
            show_progress_bar=False,
        )
        return [v.tolist() for v in vecs]

    # Backward-compat aliases
    def encode(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)

    def encode_texts(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)
