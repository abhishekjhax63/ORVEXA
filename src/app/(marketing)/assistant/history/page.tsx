import type { Metadata } from "next";
import Link from "next/link";
import { Sparkles } from "lucide-react";

import { DeleteConversationButton } from "@/components/ai/delete-conversation-button";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { AI_URGENCY_COPY } from "@/lib/ai/capabilities";
import { listConversations } from "@/lib/ai/conversations";
import { requireUser } from "@/lib/auth/guards";

/**
 * Previous assessments.
 *
 * Only conversations the user agreed to store appear here, and each row can be
 * deleted from the list — the same action as withdrawing storage consent, with
 * the same effect on the stored files.
 */

export const metadata: Metadata = {
  title: "Previous assessments",
  description: "AI assessments you chose to keep, with the files attached to them.",
  robots: { index: false, follow: false },
};

export default async function AssistantHistoryPage() {
  const user = await requireUser("/assistant/history");
  const conversations = await listConversations(user.id);

  return (
    <>
      <PageHero
        eyebrow="Health assistant"
        title="Previous assessments"
        description="Conversations you agreed to store. Opening one shows the description, the files and every assessment the assistant produced in it."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "AI health assistant", href: "/assistant" },
          { title: "Previous assessments", href: "/assistant/history" },
        ]}
        actions={
          <Button asChild>
            <Link href="/assistant">
              <Sparkles aria-hidden />
              Start a new assessment
            </Link>
          </Button>
        }
      />

      <Section spacing="sm">
        {conversations.length === 0 ? (
          <EmptyState
            icon={Sparkles}
            title="Nothing stored yet"
            description="Assessments appear here once you switch on storage in the workspace. Until then nothing is kept, so there is nothing to come back to."
            action={
              <Button asChild>
                <Link href="/assistant">Open the assistant</Link>
              </Button>
            }
          />
        ) : (
          <ul className="space-y-4">
            {conversations.map((conversation) => (
              <li key={conversation.id}>
                <Card>
                  <CardHeader>
                    <div className="flex flex-wrap items-center gap-2">
                      {conversation.highestUrgency ? (
                        <Badge variant={AI_URGENCY_COPY[conversation.highestUrgency]?.tone ?? "neutral"}>
                          {AI_URGENCY_COPY[conversation.highestUrgency]?.label ?? conversation.highestUrgency}
                        </Badge>
                      ) : null}
                      <Badge variant="neutral">
                        {conversation.assessmentCount} assessment{conversation.assessmentCount === 1 ? "" : "s"}
                      </Badge>
                    </div>
                    <CardTitle className="pt-2 text-lg">
                      <Link href={`/assistant/history/${conversation.id}`} className="hover:text-primary">
                        {conversation.title}
                      </Link>
                    </CardTitle>
                    <CardDescription>
                      Started {new Date(conversation.createdAt).toLocaleString()}
                      {conversation.lastMessageAt ? ` · last message ${new Date(conversation.lastMessageAt).toLocaleString()}` : ""}
                      {conversation.retentionUntil
                        ? ` · kept until ${new Date(conversation.retentionUntil).toLocaleDateString()}`
                        : ""}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button asChild variant="outline" size="sm">
                        <Link href={`/assistant/history/${conversation.id}`}>Open</Link>
                      </Button>
                      <DeleteConversationButton conversationId={conversation.id} title={conversation.title} />
                    </div>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
