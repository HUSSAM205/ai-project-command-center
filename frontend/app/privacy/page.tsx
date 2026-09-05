import type { Metadata } from "next";
import { LegalPageLayout, LegalSection } from "@/components/layout/LegalPageLayout";

export const metadata: Metadata = { title: "Privacy — AI Project Command Center" };

export default function PrivacyPage() {
  return (
    <LegalPageLayout title="Privacy & Data Protection" updated="September 5, 2026">
      <p>
        This is a demonstration project, not a commercial product with a customer base — this
        policy describes how the deployed application actually handles data today, so anyone trying
        it (including as a guest) knows exactly what happens to what they type or upload.
      </p>

      <LegalSection heading="What a guest session stores">
        <p>
          An anonymous/demo visitor is issued a random, short-lived session id and read-only token.
          No name, email, or account is created. A document a guest uploads is stored only for that
          session, visible only to that session, and automatically deleted after about an hour
          (enforced by a real, scheduled cleanup pass — not a manual process).
        </p>
      </LegalSection>

      <LegalSection heading="What a registered account stores">
        <p>
          A real account&apos;s email and bcrypt-hashed password, plus whatever project, task, risk,
          budget, and document data that account creates. This application does not sell, rent, or
          share this data with third parties, and does not run advertising or tracking scripts.
        </p>
      </LegalSection>

      <LegalSection heading="Third-party processing">
        <p>
          Document embeddings are computed locally by this application&apos;s own backend, not sent
          to a third-party embedding service. If a live large-language-model provider is configured
          for a given deployment, a question you ask about a document — and the relevant extracted
          text needed to answer it — may be sent to that provider to generate a response. This
          deployment&apos;s default configuration answers with a local, deterministic engine rather
          than a live third-party model.
        </p>
      </LegalSection>

      <LegalSection heading="Data location">
        <p>
          Application data is stored in a managed Postgres database (Neon, hosted on AWS
          infrastructure) and uploaded files in the backend&apos;s storage volume (Render). No data
          sovereignty or residency guarantee is made for this demonstration deployment.
        </p>
      </LegalSection>

      <LegalSection heading="Your choices">
        <p>
          A registered account can delete the projects, tasks, and documents it owns through the
          application itself. Because a demo session creates no persistent account, there is nothing
          further to delete once its data expires on its own.
        </p>
      </LegalSection>

      <LegalSection heading="Changes to this policy">
        <p>This page is updated in place when the application&apos;s actual data handling changes — there is no separate changelog.</p>
      </LegalSection>
    </LegalPageLayout>
  );
}
