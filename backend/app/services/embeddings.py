"""Local embedding model for document chunks — sentence-transformers, no hosted API.

Loaded once per process (model load takes a couple seconds) and reused for every embed
call. Runs entirely offline/on-CPU; this is what lets Document Intelligence work with zero
API keys, same as the rest of the AI layer (see app/ai/providers/demo.py).
"""

from functools import lru_cache

MODEL_NAME = "all-MiniLM-L6-v2"
EMBEDDING_DIM = 384


@lru_cache
def _get_model():
    # Imported lazily so a plain `import app.services.embeddings` (e.g. from a script that
    # only needs the constants above) doesn't pay the torch/sentence-transformers import
    # cost, and so the app can still start even before the model is downloaded.
    from sentence_transformers import SentenceTransformer

    return SentenceTransformer(MODEL_NAME)


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embeds a batch of strings. Returns one 384-dim vector per input string, in order."""
    if not texts:
        return []
    model = _get_model()
    vectors = model.encode(texts, convert_to_numpy=True, show_progress_bar=False, normalize_embeddings=False)
    return [v.tolist() for v in vectors]


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
