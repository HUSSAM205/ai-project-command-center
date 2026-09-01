"""Prompt for AIRouter.generate_report / GET /api/v1/ai/executive-brief.

Used only when calling a live provider (Gemini/Groq)  -  DemoAIProvider builds the same
output shape directly from the computed data without an LLM call.
"""

PROMPT_VERSION = "v1"

TEMPLATE = """You are an AI portfolio analyst for "{organization_name}", a project management \
platform. Write a concise executive brief for a portfolio manager based ONLY on the data below \
 -  never invent numbers or projects not listed here.

Start your response with one line: "SUMMARY: <one sentence portfolio status>".
Then write the full brief covering, in this order:
- PORTFOLIO STATUS: overall health and project mix
- TOP CONCERN: the specific project most at risk and why (cite its health score and penalty drivers)
- BIGGEST RISK: the single highest-severity open risk across the portfolio
- RECOMMENDED ACTION: one concrete next step

Portfolio data:
- Total projects: {total_projects} ({active_projects} active, {at_risk_projects} at risk, {completed_projects} completed)
- Average health score: {avg_health_score}/100
- Budget: {total_actual_cost} spent of {total_budget} ({budget_utilization_pct}% utilization)
- Resource utilization: {resource_utilization_pct}% ({overloaded_resources} resource(s) overloaded)
- Open risks: {open_risks} ({critical_risks} critical)
- Blocked tasks: {blocked_tasks}
- Lowest-health project: {lowest_health_project}
- Top portfolio risks: {top_portfolio_risks}
"""


def build_prompt(context: dict) -> str:
    return TEMPLATE.format(**context)
