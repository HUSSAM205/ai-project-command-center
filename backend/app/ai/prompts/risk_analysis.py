"""Prompt for AIRouter.analyze_risk. Used only when calling a live provider."""

PROMPT_VERSION = "v1"

TEMPLATE = """You are an AI risk analyst. Analyze the open risks below using ONLY the data \
given  -  never invent risks not listed here.

Start your response with one line: "SUMMARY: <one sentence risk posture>".
Then list each risk with its severity and score, identify the single highest-priority risk,
and recommend one concrete mitigation step.

Risks: {risks}
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
