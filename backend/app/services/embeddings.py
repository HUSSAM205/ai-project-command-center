"""Local embedding for document chunks — a deterministic hashing-trick bag-of-words vectorizer
(a.k.a. "feature hashing": https://en.wikipedia.org/wiki/Feature_hashing, the same technique
behind scikit-learn's HashingVectorizer and Vowpal Wabbit), not a neural network.

Was sentence-transformers (all-MiniLM-L6-v2) through Phase 3, but loading its PyTorch weights was
enough to OOM-kill this app's single free-tier Render worker under real load — the process
restarts, and whatever document upload triggered it silently loses its background task (see
app/api/documents.py's PROCESSING_STUCK_MINUTES reconciliation, which bounds the damage from that
but doesn't prevent it). This replaces the actual cause instead: zero ML framework dependency, a
few KB of RAM, sub-millisecond per call.

Two texts sharing vocabulary hash into overlapping buckets and score as more similar under cosine
distance; unrelated texts don't. That's real (if simpler than a neural embedding) retrieval
signal grounded in actual word content — not a fabricated or content-blind hash of the whole
string, which would place every text at a meaningless, effectively random distance from every
other and break document Q&A's "find the most relevant chunk" retrieval into noise. Applies to
every document uploaded to this deployment, real accounts included — the memory ceiling this
works around belongs to the shared instance, not to any one visitor.
"""

import hashlib
import math
import re

MODEL_NAME = "hashing-bow-384"  # not a neural model -- see module docstring
EMBEDDING_DIM = 384

_TOKEN_RE = re.compile(r"[A-Za-z0-9]+")


def _tokenize(text: str) -> list[str]:
    return _TOKEN_RE.findall(text.lower())


def _hash_bucket(token: str) -> int:
    # md5 rather than Python's builtin hash(): the latter is salted per-process (PYTHONHASHSEED),
    # so the same token would land in a different bucket on every restart, silently invalidating
    # every previously-computed embedding's meaning. This is a bucket index, not a security
    # boundary, so md5's cryptographic properties don't matter here -- only that it's stable.
    digest = hashlib.md5(token.encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "big") % EMBEDDING_DIM


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Embeds a batch of strings via feature hashing. Returns one L2-normalized EMBEDDING_DIM-dim
    vector per input string, in order."""
    if not texts:
        return []
    vectors: list[list[float]] = []
    for text in texts:
        vec = [0.0] * EMBEDDING_DIM
        for token in _tokenize(text):
            vec[_hash_bucket(token)] += 1.0
        norm = math.sqrt(sum(v * v for v in vec))
        if norm > 0:
            vec = [v / norm for v in vec]
        vectors.append(vec)
    return vectors


def embed_text(text: str) -> list[float]:
    return embed_texts([text])[0]
