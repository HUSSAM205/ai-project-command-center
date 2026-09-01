"""Prompt for AIRouter.analyze_document. Used only when calling a live provider.

Full document intelligence/RAG is a later phase (see docs/ARCHITECTURE.md "Not yet
built")  -  this covers the AIProvider interface method today with a simple single-pass
extraction prompt.
"""

PROMPT_VERSION = "v2"

TEMPLATE = """Analyze the document below (filename: "{filename}") using ONLY its content  -  \
never invent facts not present in the text. Extract, each as a short bulleted list: \
requirements (statements using "shall"/"must"/similar obligation language), deliverables, \
important dates/deadlines, risks or concerns, and action items. Also note any information a \
reader would expect but that is missing from the document.

Start your response with one line: "SUMMARY: <the one-sentence summary>".

Document text:
{text}
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
