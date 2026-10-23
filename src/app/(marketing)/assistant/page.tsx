import { Suspense } from "react";
import type { Metadata } from "next";

import { AssistantWorkspace } from "@/components/ai/assistant-workspace";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { aiCapabilityReport } from "@/lib/ai/config";
import { AI_ERROR_COPY } from "@/lib/ai/provider";
import type { UnavailableStateView } from "@/lib/ai/view";
import { getCurrentUser } from "@/lib/auth/guards";

/**
 * The AI health workspace.
 *
 * The capability report is resolved on the server before anything is rendered,
 * so an unconfigured deployment shows the honesty panel immediately rather than
 * after the user has typed a paragraph and pressed send. The session read sits
 * behind a `<Suspense>` boundary because reading cookies is request-time.
 */

export const metadata: Metadata = {
  title: "AI health assistant",
  description:
    "Describe symptoms, attach a photo or a report, and get a preliminary, uncertainty-aware explanation with clear next steps. Not a diagnosis.",
};

export default function AssistantPage() {
  return (
    <>
      <PageHero
        eyebrow="Health intelligence"
        title="AI health assistant"
        description="Describe what is happening in your own words, add a photo or a report if you have one, and get a structured explanation of what it might be, how urgent it looks, and what to do next."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "AI health assistant", href: "/assistant" },
        ]}
      />

      <Section spacing="sm">
        <Suspense fallback={<WorkspaceSkeleton />}>
          <Workspace />
        </Suspense>
      </Section>
    </>
  );
}

async function Workspace() {
  const user = await getCurrentUser();
  const report = aiCapabilityReport();

  // Built from the same report the endpoints use, so the page and the API agree
  // on what this deployment can do.
  const initialUnavailable: UnavailableStateView | null = report.configured
    ? null
    : {
        kind: "not_configured",
        message: AI_ERROR_COPY.not_configured,
        available: report.available,
        unavailable: report.unavailable,
        providerLabel: report.providerLabel,
      };

  return <AssistantWorkspace signedIn={Boolean(user)} initialUnavailable={initialUnavailable} />;
}

function WorkspaceSkeleton() {
  return (
    <div aria-hidden className="space-y-6">
      <div className="h-28 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
      <div className="h-56 animate-pulse rounded-2xl bg-muted/60 motion-reduce:animate-none" />
    </div>
  );
}
