"""
CreditLens — RAG layer: Q&A over GP report PDFs with source citations.
Pipeline: PDF text → paragraph chunks → embeddings (sentence-transformers)
→ ChromaDB → retrieve top-k → LLM answers ONLY from retrieved context.
Falls back to extractive mode (retrieved passages only) if no API key is set.
"""
import os
import re
import pdfplumber

_CHUNK_MIN = 200
_CHUNK_MAX = 900
_COLLECTION = "gp_reports"


# ---------- CHUNKING ----------
def _chunk_text(text):
    """Split into paragraph-ish chunks between _CHUNK_MIN and _CHUNK_MAX chars."""
    paras = [p.strip() for p in re.split(r"\n\s*\n|(?<=\.)\s{2,}", text) if p.strip()]
    chunks, buf = [], ""
    for p in paras:
        buf = (buf + " " + p).strip()
        if len(buf) >= _CHUNK_MIN:
            while len(buf) > _CHUNK_MAX:
                cut = buf.rfind(". ", 0, _CHUNK_MAX)
                cut = cut + 1 if cut > 0 else _CHUNK_MAX
                chunks.append(buf[:cut].strip())
                buf = buf[cut:].strip()
            if buf:
                chunks.append(buf)
                buf = ""
    if buf:
        chunks.append(buf)
    return chunks


def _pdf_text(path):
    with pdfplumber.open(path) as pdf:
        return "\n\n".join((p.extract_text() or "") for p in pdf.pages)


# ---------- INDEX ----------
def build_index(pdf_dir="raw_reports"):
    """Embed all PDFs in pdf_dir into an in-memory ChromaDB collection."""
    import chromadb
    from chromadb.utils.embedding_functions import SentenceTransformerEmbeddingFunction

    embed_fn = SentenceTransformerEmbeddingFunction(model_name="all-MiniLM-L6-v2")
    client = chromadb.Client()  # in-memory; rebuilt per session
    try:
        client.delete_collection(_COLLECTION)
    except Exception:
        pass
    col = client.create_collection(_COLLECTION, embedding_function=embed_fn)

    docs, ids, metas = [], [], []
    for fname in sorted(os.listdir(pdf_dir)):
        if not fname.lower().endswith(".pdf"):
            continue
        for i, chunk in enumerate(_chunk_text(_pdf_text(os.path.join(pdf_dir, fname)))):
            docs.append(chunk)
            ids.append(f"{fname}::chunk{i}")
            metas.append({"source": fname, "chunk": i})
    if docs:
        col.add(documents=docs, ids=ids, metadatas=metas)
    return col


def add_document(col, doc_name, text):
    """Add an uploaded document's text to an existing collection."""
    chunks = _chunk_text(text)
    if not chunks:
        return 0
    existing = col.get(ids=[f"{doc_name}::chunk0"])
    if existing and existing.get("ids"):
        return 0  # already indexed this session
    col.add(
        documents=chunks,
        ids=[f"{doc_name}::chunk{i}" for i in range(len(chunks))],
        metadatas=[{"source": doc_name, "chunk": i} for i in range(len(chunks))],
    )
    return len(chunks)


# ---------- QUERY ----------
def _call_llm(question, context_blocks, api_key):
    from groq import Groq
    context = "\n\n---\n\n".join(
        f"[Source: {m['source']}]\n{d}" for d, m in context_blocks
    )
    prompt = (
        "You are a careful analyst assistant for a private credit team. Answer the "
        "question using ONLY the context below from GP quarterly reports. Rules:\n"
        "- If the answer is not in the context, say exactly that — do not guess.\n"
        "- Quote specific figures precisely as written.\n"
        "- End with 'Source: <filename>' for every document you used.\n\n"
        f"CONTEXT:\n{context}\n\nQUESTION: {question}"
    )
    client = Groq(api_key=api_key)
    resp = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        max_tokens=500,
        temperature=0.1,
        messages=[{"role": "user", "content": prompt}],
    )
    return resp.choices[0].message.content


def answer(col, question, api_key=None, k=4):
    """Retrieve top-k chunks; LLM-synthesize if key available, else extractive.
    Returns (answer_text, sources) where sources = [(text, metadata), ...]."""
    res = col.query(query_texts=[question], n_results=k)
    blocks = list(zip(res["documents"][0], res["metadatas"][0]))
    if not blocks:
        return "No relevant passages found in the indexed documents.", []
    if api_key:
        try:
            return _call_llm(question, blocks, api_key), blocks
        except Exception as e:
            return (f"⚠️ LLM call failed ({e}) — showing retrieved passages "
                    f"instead (extractive mode)."), blocks
    return ("**Extractive mode** (no API key configured) — the most relevant "
            "passages are shown below. Add GROQ_API_KEY to secrets for "
            "synthesized answers."), blocks