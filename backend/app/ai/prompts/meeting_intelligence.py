"""Prompt for AIRouter.parse_meeting_transcript. Used only when calling a live provider --
DemoAIProvider uses app/services/meeting_extraction.py's heuristic parser instead.

Unlike most prompts in this module (which ask for prose starting with "SUMMARY: ..."), this one
asks for strict JSON, since the "Commit Tasks to Project WBS" feature needs real structured
fields (owner/priority/due_date/estimated_hours) to write into the tasks table -- not prose to
re-parse. See app/ai/providers/live_common.py's parse_json_object for how the response is read
back, and app/ai/providers/demo.py's parse_meeting_transcript for the exact shape both paths
must produce.
"""

PROMPT_VERSION = "v1"

TEMPLATE = """You are analyzing a meeting transcript. Extract ONLY what is actually stated in the \
text below -- never invent a decision, an owner, a date, or an effort estimate that isn't there.

Respond with STRICT JSON only -- no markdown code fences, no commentary before or after -- \
matching exactly this shape:
{{
  "decisions": ["<short decision statement, near-verbatim from the transcript>", ...],
  "action_items": [
    {{"title": "<task title>", "owner_name": "<name or null>", "priority": "LOW"|"MEDIUM"|"HIGH"|"CRITICAL", "due_date": "<YYYY-MM-DD or null>", "estimated_hours": <number or null>}}
  ],
  "risks_identified": [
    {{"description": "<risk statement, near-verbatim from the transcript>", "category": "SCHEDULE"|"BUDGET"|"RESOURCE"|"TECHNICAL"|"SECURITY"|"OPERATIONAL"|"DEPENDENCY"|"EXTERNAL"}}
  ]
}}

If an action item's owner, due date, or effort is not explicitly stated, use null for that field \
-- never guess. Today's date is {today}; use it only to resolve a relative date mentioned in the \
transcript (e.g. "by Friday", "next week") into an absolute YYYY-MM-DD date.

Transcript:
{transcript}
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
