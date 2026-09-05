import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/layout/LegalPageLayout";

export const metadata: Metadata = { title: "Terms — AI Project Command Center" };

export default function TermsPage() {
  return (
    <LegalPageLayout title="Terms of Use" updated="September 5, 2026">
      <p>
        This is a demonstration software project. Using it — as a guest or a registered account —
        means you agree to the terms below, which are intentionally short because this is not a
        commercial service with a sales contract behind it.
      </p>

      <LegalSection heading="What this is">
        <p>
          A live, publicly reachable demonstration of a project-management and PMO analytics
          application. It is provided to show real, working functionality against real seeded and
          user-entered data — it is not a production system covered by a service-level agreement,
          uptime guarantee, or support contract.
        </p>
      </LegalSection>

      <LegalSection heading="No warranty">
        <p>
          The application is provided &quot;as is,&quot; without warranty of any kind, express or
          implied, including without limitation any warranty of merchantability, fitness for a
          particular purpose, or non-infringement. Financial forecasts, health scores, and delivery
          date estimates produced by this application are computed illustrations, not professional
          project-management, financial, or legal advice — do not make a real business decision
          based solely on them.
        </p>
      </LegalSection>

      <LegalSection heading="Acceptable use">
        <p>
          Do not use this deployment to store real personal data belonging to anyone other than
          yourself, to upload unlawful content, or to attempt to circumvent its access controls,
          rate limits, or resource quotas. Anonymous/demo sessions are subject to the upload and
          request quotas described on this application&apos;s Documents and Security pages.
        </p>
      </LegalSection>

      <LegalSection heading="Data you enter">
        <p>
          You retain ownership of any content you upload or create. See the Privacy page for how it
          is stored, and note that a demo/guest session&apos;s data is not guaranteed to persist
          beyond the disclosed retention window.
        </p>
      </LegalSection>

      <LegalSection heading="Limitation of liability">
        <p>
          To the maximum extent permitted by law, the operator of this deployment is not liable for
          any indirect, incidental, or consequential damages arising from your use of, or inability
          to use, this application.
        </p>
      </LegalSection>

      <LegalSection heading="Changes">
        <p>These terms may be updated as the application changes; the date above reflects the latest revision.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
