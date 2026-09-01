"""Prompt for AIRouter.summarize. Used only when calling a live provider."""

PROMPT_VERSION = "v1"

TEMPLATE = """Summarize the following content titled "{title}" in 2-3 sentences, using ONLY \
what is written below  -  never invent facts not present in the text.

Start your response with one line: "SUMMARY: <the summary>".

Content:
{text}
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
