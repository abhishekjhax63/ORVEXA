import { ShieldCheck } from "lucide-react";

import { ReviewDecisionForm } from "@/components/ai/review-decision-form";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import type { ReviewQueueItem } from "@/lib/ai/conversations";
import { AI_URGENCY_COPY, aiLanguageLabel } from "@/lib/ai/capabilities";

/**
 * The clinical review queue, shared by the clinician and administrator views.
 *
 * Items are pseudonymous: a reviewer sees a short reference, the urgency and the
 * summary, not the person. That is deliberate — the decision is about the
 * assessment, and a reviewer who wants the identity can ask for it through the
 * normal access path rather than having it pushed in front of them.
 */
function ReviewQueue({ items }: { items: ReviewQueueItem[] }) {
  if (items.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Nothing is waiting for review"
        description="Assessments appear here when a user asks for a clinician to look at one, or when the escalation policy flags one automatically."
      />
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.reviewId}>
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={AI_URGENCY_COPY[item.urgency].tone}>
                  {AI_URGENCY_COPY[item.urgency].label}
                </Badge>
                <Badge variant="neutral">
                  <span className="font-mono">{item.reference}</span>
                </Badge>
                <Badge variant="outline">{item.status.replace("_", " ").toLowerCase()}</Badge>
                <Badge variant="neutral">{aiLanguageLabel(item.language)}</Badge>
                {item.redFlagCodes.length > 0 ? <Badge variant="emergency">Red flags detected</Badge> : null}
              </div>
              <CardTitle className="pt-2 text-base leading-relaxed">{item.summary}</CardTitle>
              <CardDescription>
                Requested {new Date(item.requestedAt).toLocaleString()}
                {item.specialty ? ` · ${item.specialty}` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <ReviewDecisionForm reviewId={item.reviewId} reference={item.reference} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}

export { ReviewQueue };
