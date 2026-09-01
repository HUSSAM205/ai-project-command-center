"""Prompt for AIRouter.answer_document_question / POST /api/v1/documents/{id}/ask.

Used only when calling a live provider — DemoAIProvider answers by returning the most
relevant retrieved chunk(s) verbatim with a citation instead of synthesizing free text (see
app/ai/providers/demo.py), since there's no LLM available to safely paraphrase.
"""

PROMPT_VERSION = "v1"

TEMPLATE = """Answer the question below using ONLY the retrieved document excerpts  -  never \
invent facts not present in them. If the excerpts don't contain enough information to answer, \
say so plainly rather than guessing.

Start your response with one line: "SUMMARY: <one sentence direct answer>". Then give a short \
explanation, and cite which excerpt(s) you used by their chunk_index.

Document: {filename}
Question: {question}

Retrieved excerpts (most relevant first):
{chunks}
"""


def build_prompt(context: dict) -> str:
    chunks_text = "\n\n".join(
        f"[chunk_index={c['chunk_index']}"
        + (f", page={c['page_number']}" if c.get("page_number") is not None else "")
        + f", similarity={c['similarity']:.2f}]\n{c['content']}"
        for c in context.get("chunks", [])
    ) or "(no relevant excerpts retrieved)"
    return TEMPLATE.format(filename=context["filename"], question=context["question"], chunks=chunks_text)
