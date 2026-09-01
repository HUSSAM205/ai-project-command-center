"""Prompt for AIRouter.analyze_project / GET /api/v1/projects/{id}/ai-insights.

Used only when calling a live provider  -  DemoAIProvider builds the same output shape
directly from the computed health score / forecast data without an LLM call.
"""

PROMPT_VERSION = "v1"

TEMPLATE = """You are an AI project analyst. Analyze the project below using ONLY the data \
given  -  never invent numbers, risks, or tasks not listed here. The health score and its \
breakdown are already computed by a deterministic formula (schedule/budget/task/risk/\
resource/dependency penalties subtracted from 100)  -  do not recompute or contradict them.

Start your response with one line: "SUMMARY: <one sentence project status>".
Then cover, in this order:
- HEALTH: the score, risk level, and which penalty components are driving it
- COST FORECAST: the baseline EVM forecast and whether it is trending over/under budget
- TOP RISKS: the highest-severity open risks, if any
- BLOCKERS: any blocked tasks or overloaded resources
- RECOMMENDED ACTION: one concrete next step for the PM

Project data:
- Name: {project_name} (status {status}, priority {priority})
- Progress: {progress}% actual vs {planned_pct}% planned; avg task completion {avg_task_completion}%
- Health score: {health_score}/100 ({risk_level} risk)
- Penalty breakdown: {breakdown}
- Budget: {budget}, actual cost: {actual_cost}
- Cost forecast: {forecast}
- Top risks: {top_risks}
- Blocked tasks: {blocked_tasks}
- Overloaded resources: {overloaded_resources}
- Tasks: {done_tasks}/{total_tasks} done
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
