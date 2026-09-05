import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/layout/LegalPageLayout";

export const metadata: Metadata = { title: "Governance — AI Project Command Center" };

export default function GovernancePage() {
  return (
    <LegalPageLayout title="Governance & Change Control" updated="September 5, 2026">
      <p>
        This page describes how changes reach this application and how its own internal audit trail
        works — the same discipline the rest of this system applies to itself: real mechanisms,
        described plainly, gaps disclosed rather than hidden.
      </p>

      <LegalSection heading="Immutable audit log">
        <p>
          Every login, project/task/risk/budget mutation, document upload, and AI request is written
          to an append-only audit table with the acting principal, the action, the affected entity,
          structured metadata, and a server-stamped timestamp. No endpoint updates or deletes an
          audit entry — the only write path is insert-only, from the request handlers that generate
          real events. An authenticated administrator can view this log live at{" "}
          <Link href="/admin/audit" className="text-brand-600 underline dark:text-brand-400">
            /admin/audit
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection heading="Role-based change authority">
        <p>
          Write access is gated by a real, database-backed role/permission grant, not a hardcoded
          check — see the Security page. A read-only (demo) session cannot alter data regardless of
          which role string its token carries.
        </p>
      </LegalSection>

      <LegalSection heading="Source control & release process">
        <p>
          The application&apos;s source is tracked in git; every change to this deployment exists as
          a reviewable commit with a descriptive message. The backend deploys automatically on a
          push to its main branch; the frontend is deployed explicitly. Before a change ships, this
          project runs static type-checking, linting, and a production build for the frontend, and a
          compilation check for the backend — a gate applied consistently, not selectively.
        </p>
      </LegalSection>

      <LegalSection heading="Stage-gate governance (per-project)">
        <p>
          Individual projects carry their own steering-committee stage gates (G1 through G5) with a
          real approval status and sign-off timestamp, visible on each project&apos;s PMO tab — a
          project-level governance record, distinct from the platform-level audit log above.
        </p>
      </LegalSection>

      <LegalSection heading="What this is not">
        <p>
          This page describes internal engineering and data-governance practices. It is not a
          certification of compliance with any specific regulatory framework, and no such
          certification is claimed anywhere in this application — see the Security page for the
          same disclosure in more detail.
        </p>
      </LegalSection>
    </LegalPageLayout>
  );
}
