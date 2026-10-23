import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, FileText, Image as ImageIcon, Mic, ShieldCheck, Sparkles, Video } from "lucide-react";

import { AssessmentReport } from "@/components/ai/assessment-report";
import { PageHero } from "@/components/layout/page-hero";
import { Section } from "@/components/layout/section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { MALWARE_SCAN_COPY, UPLOAD_KIND_LABELS } from "@/lib/ai/capabilities";
import { getConversationThread } from "@/lib/ai/conversations";
import { formatBytes } from "@/lib/ai/validation";
import type { UploadView } from "@/lib/ai/view";
import { requireUser } from "@/lib/auth/guards";

/**
 * One stored conversation, read back from the database.
 *
 * The assessments here are rebuilt on the server by `getConversationThread`, so
 * the urgency floor, the limitations notice and the safety line are recomputed
 * from the row rather than replayed from anything the browser once held. The
 * page is read-only: a stored assessment is a record of what was said, and
 * editing it would make the record a lie. Continuing the conversation happens in
 * the workspace, which starts a fresh thread.
 */

export const metadata: Metadata = {
  title: "Stored assessment",
  description: "A stored ORVEXA AI assessment, with the description and files it was based on.",
  robots: { index: false, follow: false },
};

type PageProps = { params: Promise<{ id: string }> };

export default async function ConversationDetailPage({ params }: PageProps) {
  const { id } = await params;
  const user = await requireUser(`/assistant/history/${id}`);
  const thread = await getConversationThread({ ownerUserId: user.id, conversationId: id });

  if (!thread) notFound();

  const { conversation, messages } = thread;

  return (
    <>
      <PageHero
        eyebrow="Health assistant"
        title={conversation.title}
        description="What was described, what was attached, and what the assistant said at the time. Nothing here has been re-run."
        breadcrumbs={[
          { title: "Home", href: "/" },
          { title: "AI health assistant", href: "/assistant" },
          { title: "Previous assessments", href: "/assistant/history" },
          { title: conversation.title, href: `/assistant/history/${conversation.id}` },
        ]}
        actions={
          <>
            <Button asChild variant="outline">
              <Link href="/assistant/history">
                <ArrowLeft aria-hidden />
                All assessments
              </Link>
            </Button>
            <Button asChild>
              <Link href="/assistant">
                <Sparkles aria-hidden />
                Start a new assessment
              </Link>
            </Button>
          </>
        }
      />

      <Section spacing="sm">
        <div className="mb-8 flex flex-wrap items-center gap-2">
          <Badge variant="neutral">
            {conversation.assessmentCount} assessment{conversation.assessmentCount === 1 ? "" : "s"}
          </Badge>
          <Badge variant="outline">Started {new Date(conversation.createdAt).toLocaleDateString()}</Badge>
          {conversation.retentionUntil ? (
            <Badge variant="neutral">Kept until {new Date(conversation.retentionUntil).toLocaleDateString()}</Badge>
          ) : null}
        </div>

        {messages.length === 0 ? (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">This conversation is empty</CardTitle>
              <CardDescription className="text-sm leading-relaxed">
                Nothing was recorded beyond the conversation itself. It can be deleted from the previous assessments page.
              </CardDescription>
            </CardHeader>
          </Card>
        ) : (
          <ol className="space-y-8">
            {messages.map((message) => (
              <li key={message.id}>
                {message.role === "ASSISTANT" ? (
                  <div className="space-y-4">
                    {message.assessments.length > 0 ? (
                      message.assessments.map((assessment) => (
                        <AssessmentReport key={assessment.id ?? message.id} assessment={assessment} />
                      ))
                    ) : (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-base">
                            <ShieldCheck aria-hidden className="size-4 text-primary" />
                            Assistant reply
                          </CardTitle>
                          <CardDescription className="text-sm leading-relaxed whitespace-pre-line">
                            {message.content}
                          </CardDescription>
                        </CardHeader>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card className="border-primary/25 bg-muted/30">
                    <CardHeader>
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge variant="neutral">You</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(message.createdAt).toLocaleString()}
                        </span>
                      </div>
                      <CardTitle className="pt-2 text-base leading-relaxed font-normal whitespace-pre-line">
                        {message.content}
                      </CardTitle>
                    </CardHeader>
                    {message.uploads.length > 0 ? (
                      <CardContent>
                        <ul className="space-y-2">
                          {message.uploads.map((upload) => (
                            <li key={upload.id}>
                              <StoredUpload upload={upload} />
                            </li>
                          ))}
                        </ul>
                      </CardContent>
                    ) : null}
                  </Card>
                )}
              </li>
            ))}
          </ol>
        )}
      </Section>
    </>
  );
}

const KIND_ICONS = {
  IMAGE: ImageIcon,
  VIDEO: Video,
  DOCUMENT: FileText,
  AUDIO: Mic,
} as const;

/**
 * A file as it was stored.
 *
 * Deliberately different from the workspace's upload row: a stored upload
 * cannot be removed from here, because removing it would change the basis of an
 * assessment that was already given. Withdrawal happens by deleting the whole
 * conversation, which is offered on the list page.
 */
function StoredUpload({ upload }: { upload: UploadView }) {
  const Icon = KIND_ICONS[upload.kind];
  const withdrawn = upload.previewUrl === null && upload.extraction === "SKIPPED";

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-2.5">
        <Icon aria-hidden className="size-4 text-muted-foreground" />
        <span className="font-medium">{upload.fileName}</span>
        <span className="text-xs text-muted-foreground">
          {UPLOAD_KIND_LABELS[upload.kind]} · {formatBytes(upload.sizeBytes)}
        </span>
      </span>
      <span className="flex items-center gap-2 text-xs text-muted-foreground">
        {withdrawn ? <Badge variant="neutral">File withdrawn</Badge> : null}
        <span>{MALWARE_SCAN_COPY[upload.malwareScan].label}</span>
      </span>
    </div>
  );
}
