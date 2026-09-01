"""DemoAIProvider  -  the permanent, always-available "Demo AI" fallback.

Makes NO external network call, ever. Turns real, already-computed data (health score
breakdowns from app/services/health_score.py, cost forecasts from app/services/
cost_forecast.py, actual seeded risks/tasks/resources  -  all assembled by app/ai/context.py,
never fabricated here) into readable, honest prose. Always sets source="demo_ai" so
callers/UI never mistake this for a live model response.

This is a first-class, permanent product feature per docs/PRODUCT_REQUIREMENTS.md's "Demo
Mode" requirement  -  not a stub, not a placeholder. It is also the terminal fallback of
AIRouter, so it is unconditionally available and must never raise.
"""

from app.ai.base import AIProvider
from app.ai.prompts import (
    assistant_qa,
    document_analysis,
    document_qa,
    executive_summary,
    project_health,
    risk_analysis,
    summarize,
)
from app.schemas.ai import AIResponse
from app.services.document_extraction import extract_structured_document_info

DEMO_CONFIDENCE = 0.7

_PENALTY_LABELS: dict[str, str] = {
    "schedule_penalty": "Schedule slippage",
    "budget_penalty": "Budget overrun",
    "task_penalty": "Task completion lagging plan",
    "risk_penalty": "Open high-severity risks",
    "resource_penalty": "Overloaded resources",
    "dependency_penalty": "Blocked tasks",
}


def _money(value: float) -> str:
    return f"${value:,.0f}"


def _top_penalty_reasons(breakdown: dict, limit: int = 3) -> list[str]:
    items = [
        (label, breakdown.get(key, 0) or 0)
        for key, label in _PENALTY_LABELS.items()
        if (breakdown.get(key, 0) or 0) > 0
    ]
    items.sort(key=lambda pair: pair[1], reverse=True)
    return [f"{label} (-{value:.1f} pts)" for label, value in items[:limit]]


class DemoAIProvider(AIProvider):
    name = "demo_ai"

    def is_available(self) -> bool:
        return True

    def generate_text(self, prompt: str, *, max_tokens: int = 1024, temperature: float = 0.3) -> str:
        # AIRouter always calls the structured methods below, never this directly  -  but
        # implement it honestly (echo, no fabricated content) rather than raising, in case
        # a future caller invokes it directly.
        return prompt

    # ---- shared helpers ----

    def _recommend_action(self, project_ctx: dict) -> str:
        breakdown = project_ctx.get("breakdown", {})
        blocked = project_ctx.get("blocked_tasks") or []
        overloaded = project_ctx.get("overloaded_resources") or []
        top_risks = project_ctx.get("top_risks") or []

        if (breakdown.get("dependency_penalty") or 0) > 0 and blocked:
            return f'Unblock "{blocked[0]["title"]}" first  -  it is holding up downstream work.'
        if (breakdown.get("resource_penalty") or 0) > 0 and overloaded:
            top = max(overloaded, key=lambda r: r["workload"])
            return (
                f'Rebalance load off {top["name"]} ({top["workload"]:.0f}h/{top["capacity"]:.0f}h) '
                "before it slips further."
            )
        if (breakdown.get("budget_penalty") or 0) > 0:
            return "Review spend against the EVM baseline and re-forecast remaining scope  -  actual cost is outpacing planned progress."
        if (breakdown.get("schedule_penalty") or 0) > 0:
            return "Re-baseline the schedule or add capacity to close the gap between planned and actual progress."
        if (breakdown.get("risk_penalty") or 0) > 0 and top_risks:
            return f'Escalate mitigation on "{top_risks[0]["title"]}"  -  it is the largest open risk driver.'
        return "No corrective action needed right now  -  continue monitoring; the project is tracking to plan."

    # ---- structured AIProvider methods ----

    def analyze_project(self, context: dict) -> AIResponse:
        name = context["project_name"]
        health = context["health_score"]
        risk_level = context["risk_level"]
        breakdown = context["breakdown"]
        forecast = context["forecast"]
        reasons = _top_penalty_reasons(breakdown)
        reasons_text = "; ".join(reasons) if reasons else "no significant penalty drivers  -  tracking to plan"

        lines = [
            f"PROJECT: {name} ({context['status']}, priority {context['priority']})",
            f"HEALTH SCORE: {health}/100 ({risk_level} risk)  -  planned {context['planned_pct']:.0f}% complete "
            f"vs actual {context['progress']}% (avg task completion {context['avg_task_completion']:.0f}%).",
            f"TOP DRIVERS: {reasons_text}.",
            f"COST FORECAST: {forecast['method']}. Forecasted final cost {_money(forecast['forecasted_final_cost'])} "
            f"vs budget {_money(context['budget'])} ({forecast['variance_percent']:+.1f}% variance, "
            f"{forecast['overrun_probability']:.0f}% overrun probability).",
        ]
        if context["top_risks"]:
            risk_bits = ", ".join(f"{r['title']} ({r['severity']}, score {r['score']})" for r in context["top_risks"])
            lines.append(f"TOP RISKS: {risk_bits}.")
        if context["blocked_tasks"]:
            lines.append(
                f"BLOCKED TASKS: {len(context['blocked_tasks'])} task(s) blocked, including "
                f'"{context["blocked_tasks"][0]["title"]}".'
            )
        if context["overloaded_resources"]:
            names = ", ".join(r["name"] for r in context["overloaded_resources"])
            lines.append(f"OVERLOADED RESOURCES: {names}.")

        action = self._recommend_action(context)
        lines.append(f"RECOMMENDED ACTION: {action}")

        detail = "\n".join(lines)
        summary = (
            f"{name} is at {health}/100 health ({risk_level} risk). "
            f"{reasons[0] if reasons else 'No major penalty drivers.'} "
            f"Forecast: {_money(forecast['forecasted_final_cost'])} vs {_money(context['budget'])} budget."
        )
        return AIResponse(
            summary=summary,
            confidence=DEMO_CONFIDENCE,
            source="demo_ai",
            detail=detail,
            data={"breakdown": breakdown, "forecast": forecast, "top_risks": context["top_risks"]},
            prompt_version=project_health.PROMPT_VERSION,
        )

    def analyze_risk(self, context: dict) -> AIResponse:
        risks = context.get("risks") or []
        if not risks:
            return AIResponse(
                summary="No open risks to analyze.",
                confidence=0.6,
                source="demo_ai",
                detail="No open risks were found in the provided context.",
                data={},
                prompt_version=risk_analysis.PROMPT_VERSION,
            )
        top = risks[0]
        lines = [
            f"{r['title']}  -  {r['severity']} (score {r['score']}, category {r.get('category', '?')}, "
            f"status {r.get('status', '?')})"
            for r in risks
        ]
        summary = f"Top risk: {top['title']} ({top['severity']}, score {top['score']})."
        detail = "OPEN RISKS:\n" + "\n".join(f"- {line}" for line in lines)
        return AIResponse(
            summary=summary,
            confidence=DEMO_CONFIDENCE,
            source="demo_ai",
            detail=detail,
            data={"risks": risks},
            prompt_version=risk_analysis.PROMPT_VERSION,
        )

    def generate_report(self, context: dict) -> AIResponse:
        lines = [
            f"PORTFOLIO STATUS: {context['organization_name']}  -  {context['total_projects']} projects "
            f"({context['active_projects']} active, {context['at_risk_projects']} at risk, "
            f"{context['completed_projects']} completed). Average health score {context['avg_health_score']:.0f}/100.",
            f"BUDGET: {_money(context['total_actual_cost'])} spent of {_money(context['total_budget'])} "
            f"({context['budget_utilization_pct']:.0f}% utilization).",
            f"RESOURCES: {context['resource_utilization_pct']:.0f}% portfolio utilization, "
            f"{context['overloaded_resources']} resource(s) overloaded.",
            f"RISK: {context['open_risks']} open risk(s), {context['critical_risks']} at CRITICAL severity.",
        ]

        lowest = context.get("lowest_health_project")
        if lowest:
            reasons = _top_penalty_reasons(lowest["breakdown"])
            reason_text = "; ".join(reasons) if reasons else "no single dominant driver"
            lines.append(
                f"TOP CONCERN: {lowest['name']} ({lowest['status']})  -  health score {lowest['health_score']}/100 "
                f"({lowest['risk_level']} risk)."
            )
            lines.append(f"REASON: {reason_text}.")

        if context["top_portfolio_risks"]:
            r = context["top_portfolio_risks"][0]
            lines.append(
                f'BIGGEST RISK: "{r["title"]}" on {r.get("project_name", "the portfolio")} '
                f"({r['severity']}, score {r['score']})."
            )

        action = f"Focus attention on {lowest['name']} first." if lowest else "Portfolio is stable  -  maintain current cadence."
        lines.append(f"RECOMMENDED ACTION: {action}")

        detail = "\n".join(lines)
        summary = (
            f"{context['total_projects']} projects, avg health {context['avg_health_score']:.0f}/100. "
            + (
                f"Top concern: {lowest['name']} ({lowest['health_score']}/100)."
                if lowest
                else "No project currently at risk."
            )
        )
        return AIResponse(
            summary=summary,
            confidence=DEMO_CONFIDENCE,
            source="demo_ai",
            detail=detail,
            data={"lowest_health_project": lowest, "top_portfolio_risks": context["top_portfolio_risks"]},
            prompt_version=executive_summary.PROMPT_VERSION,
        )

    def summarize(self, context: dict) -> AIResponse:
        text = context.get("text", "") or ""
        title = context.get("title", "content")
        if not text:
            return AIResponse(
                summary=f"No content provided to summarize for {title}.",
                confidence=0.4,
                source="demo_ai",
                detail=None,
                data={},
                prompt_version=summarize.PROMPT_VERSION,
            )
        # Deterministic extractive summary (first two sentences)  -  no LLM call.
        sentences = [s.strip() for s in text.replace("\n", " ").split(".") if s.strip()]
        picked = ". ".join(sentences[:2])[:400]
        if picked and not picked.endswith("."):
            picked += "."
        return AIResponse(
            summary=picked or text[:200],
            confidence=0.55,
            source="demo_ai",
            detail=picked,
            data={"title": title, "sentence_count": len(sentences)},
            prompt_version=summarize.PROMPT_VERSION,
        )

    def analyze_document(self, context: dict) -> AIResponse:
        filename = context.get("filename", "document")
        text = context.get("text", "") or ""
        if not text.strip():
            return AIResponse(
                summary=f"{filename}: no extractable text found.",
                confidence=0.3,
                source="demo_ai",
                detail="The document contained no extractable text, so no structured analysis could be produced.",
                data={"filename": filename, "word_count": 0},
                prompt_version=document_analysis.PROMPT_VERSION,
            )

        info = extract_structured_document_info(text)
        parts = [f"{info['word_count']} words, {info['sentence_count']} sentences."]
        parts.append(
            f"Found {len(info['requirements'])} requirement(s), {len(info['deliverables'])} deliverable(s), "
            f"{len(info['important_dates'])} date(s), {len(info['risks'])} risk mention(s), "
            f"{len(info['action_items'])} action item(s)."
        )
        summary = f"{filename}: {parts[1]}"

        detail_lines = [f"DOCUMENT: {filename}  -  {parts[0]}"]

        def _section(title: str, items: list[str]) -> None:
            if items:
                detail_lines.append(f"{title}:")
                detail_lines.extend(f"  - {item}" for item in items)
            else:
                detail_lines.append(f"{title}: none found.")

        _section("REQUIREMENTS", info["requirements"])
        _section("DELIVERABLES", info["deliverables"])
        _section("IMPORTANT DATES", [f"{d['date']} ({d['context']})" for d in info["important_dates"]])
        _section("RISKS", info["risks"])
        _section("ACTION ITEMS", info["action_items"])
        _section("MISSING INFORMATION", info["missing_information"])

        return AIResponse(
            summary=summary,
            confidence=0.65,
            source="demo_ai",
            detail="\n".join(detail_lines),
            data={"filename": filename, **info},
            prompt_version=document_analysis.PROMPT_VERSION,
        )

    def answer_document_question(self, context: dict) -> AIResponse:
        question = context["question"]
        filename = context.get("filename", "document")
        chunks = context.get("chunks") or []

        if not chunks:
            summary = "No relevant content was found in this document for that question."
            return AIResponse(
                summary=summary,
                confidence=0.3,
                source="demo_ai",
                detail=summary,
                data={"citations": []},
                prompt_version=document_qa.PROMPT_VERSION,
            )

        top = chunks[0]
        citations = [
            {
                "chunk_index": c["chunk_index"],
                "page_number": c.get("page_number"),
                "similarity": round(c["similarity"], 3),
                "excerpt": c["content"],
            }
            for c in chunks[:3]
        ]

        location = f"chunk {top['chunk_index']}" + (f", page {top['page_number']}" if top.get("page_number") else "")
        excerpt = top["content"].strip()
        excerpt_preview = excerpt if len(excerpt) <= 400 else excerpt[:400].rsplit(" ", 1)[0] + "…"
        summary = f'From {location} of "{filename}": {excerpt_preview}'

        detail_lines = [
            f'Question: "{question}"',
            f"Demo AI mode has no live model to synthesize a free-text answer, so this returns the "
            f"most relevant retrieved excerpt(s) verbatim, most similar first:",
            "",
        ]
        for c in citations:
            loc = f"chunk {c['chunk_index']}" + (f", page {c['page_number']}" if c["page_number"] else "")
            detail_lines.append(f"[{loc}, similarity {c['similarity']}]")
            detail_lines.append(c["excerpt"])
            detail_lines.append("")

        return AIResponse(
            summary=summary,
            confidence=round(min(0.4 + top["similarity"] * 0.5, 0.9), 2),
            source="demo_ai",
            detail="\n".join(detail_lines).strip(),
            data={"citations": citations},
            prompt_version=document_qa.PROMPT_VERSION,
        )

    def answer_project_question(self, context: dict) -> AIResponse:
        question = context["question"]
        q = question.lower()

        if any(kw in q for kw in ("overload", "who is over", "too much work", "over capacity")):
            return self._answer_overload(context)
        if any(kw in q for kw in ("blocking", "block delivery", "which task is block", "blocked")):
            return self._answer_blocking(context)
        if any(kw in q for kw in ("biggest risk", "top risk", "what are the risk", "risks")):
            return self._answer_risks(context)
        if any(kw in q for kw in ("why is this project at risk", "why is it at risk", "why at risk")) or (
            "why" in q and "risk" in q
        ):
            return self._answer_why_at_risk(context)
        if any(kw in q for kw in ("what should the pm do", "what should i do", "next step", "recommend")):
            return self._answer_next_steps(context)
        if any(kw in q for kw in ("summarize", "summary")):
            return self._answer_summary(context)
        return self._answer_generic(context)

    # ---- assistant intent handlers ----

    def _answer_overload(self, context: dict) -> AIResponse:
        overloaded = [r for r in context["resources"] if r["utilization_state"] == "OVERLOADED"]
        if not overloaded:
            summary = "No resources are currently overloaded."
        else:
            names = ", ".join(f"{r['name']} ({r['workload']:.0f}h/{r['capacity']:.0f}h)" for r in overloaded)
            summary = f"{len(overloaded)} resource(s) overloaded: {names}."
        return AIResponse(
            summary=summary,
            confidence=0.75,
            source="demo_ai",
            detail=summary,
            data={"overloaded_resources": overloaded},
            prompt_version=assistant_qa.PROMPT_VERSION,
        )

    def _answer_blocking(self, context: dict) -> AIResponse:
        blocking = context.get("blocking_task")
        if not blocking:
            summary = "No task is currently identified as blocking downstream delivery."
        elif blocking["blocks_count"] > 0:
            summary = (
                f'"{blocking["title"]}" ({blocking["status"]}) is blocking '
                f'{blocking["blocks_count"]} downstream task(s).'
            )
        else:
            summary = f'"{blocking["title"]}" is flagged {blocking["status"]} and is holding up delivery.'
        return AIResponse(
            summary=summary,
            confidence=0.7,
            source="demo_ai",
            detail=summary,
            data={"blocking_task": blocking},
            prompt_version=assistant_qa.PROMPT_VERSION,
        )

    def _answer_risks(self, context: dict) -> AIResponse:
        if context["project"]:
            risks = context["project"].get("top_risks", [])
        else:
            risks = (context["portfolio"] or {}).get("top_portfolio_risks", [])
        if not risks:
            summary = "No open risks found."
        else:
            bits = "; ".join(f"{r['title']} ({r['severity']}, score {r['score']})" for r in risks[:3])
            summary = f"Biggest risks: {bits}."
        return AIResponse(
            summary=summary,
            confidence=0.75,
            source="demo_ai",
            detail=summary,
            data={"risks": risks},
            prompt_version=assistant_qa.PROMPT_VERSION,
        )

    def _answer_why_at_risk(self, context: dict) -> AIResponse:
        project = context["project"]
        if not project and context["portfolio"]:
            project = context["portfolio"].get("lowest_health_project")
        if not project:
            return AIResponse(
                summary="No project data available to explain risk.",
                confidence=0.4,
                source="demo_ai",
                detail=None,
                data={},
                prompt_version=assistant_qa.PROMPT_VERSION,
            )
        breakdown = project.get("breakdown", {})
        reasons = _top_penalty_reasons(breakdown)
        reason_text = "; ".join(reasons) if reasons else "no single dominant driver"
        name = project.get("project_name") or project.get("name")
        summary = f"{name} is {project.get('risk_level')} risk (health {project.get('health_score')}/100) because of: {reason_text}."
        return AIResponse(
            summary=summary,
            confidence=0.75,
            source="demo_ai",
            detail=summary,
            data={"breakdown": breakdown},
            prompt_version=assistant_qa.PROMPT_VERSION,
        )

    def _answer_next_steps(self, context: dict) -> AIResponse:
        if context["project"]:
            action = self._recommend_action(context["project"])
        else:
            lowest = (context["portfolio"] or {}).get("lowest_health_project")
            if lowest:
                reasons = _top_penalty_reasons(lowest["breakdown"])
                action = f"Focus on {lowest['name']} first  -  {', '.join(reasons) if reasons else 'it has the lowest health score in the portfolio'}."
            else:
                action = "Portfolio is stable; maintain current cadence."
        return AIResponse(
            summary=action,
            confidence=0.7,
            source="demo_ai",
            detail=action,
            data={},
            prompt_version=assistant_qa.PROMPT_VERSION,
        )

    def _answer_summary(self, context: dict) -> AIResponse:
        if context["project"]:
            return self.analyze_project(context["project"])
        return self.generate_report(context["portfolio"])

    def _answer_generic(self, context: dict) -> AIResponse:
        if context["project"]:
            resp = self.analyze_project(context["project"])
        else:
            resp = self.generate_report(context["portfolio"])
        resp.summary = f"(No specific intent matched  -  here's a data-driven overview.) {resp.summary}"
        return resp
