# recommendation/embedder.py
from typing import List
import torch
from sentence_transformers import SentenceTransformer

class Embedder:
    """
    Thin wrapper around SentenceTransformer with a stable method name:
    - embed_texts(list[str]) -> list[list[float]]
    Also exposes encode(...) as a backward-compatible alias.
    """
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2",
                 device: str = "cuda", normalize: bool = True):
        use_cuda = (device or "").lower() == "cuda" and torch.cuda.is_available()
        self.device = "cuda" if use_cuda else "cpu"
        self.model = SentenceTransformer(model_name, device=self.device)
        self.normalize = normalize

    def embed_texts(self, texts: List[str]) -> List[List[float]]:
        if not isinstance(texts, list):
            texts = [str(texts)]
        # returns numpy array; normalize at encode-time for cosine
        vecs = self.model.encode(
            texts,
            convert_to_numpy=True,
            normalize_embeddings=self.normalize
        )
        return [v.tolist() for v in vecs]

    # Back-compat alias
    def encode(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)

    # Another common alias some codebases use
    def encode_texts(self, texts: List[str]) -> List[List[float]]:
        return self.embed_texts(texts)
