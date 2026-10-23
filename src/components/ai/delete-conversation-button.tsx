"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { deleteAi } from "@/lib/ai/client";

/**
 * Deleting a stored conversation from the history list.
 *
 * Two presses, and the second one is explicit about what it removes: the
 * conversation, its files and any share links still pointing at it. Nothing is
 * optimistically hidden — the list refreshes from the server, so what is shown
 * afterwards is what the database actually holds.
 */
function DeleteConversationButton({
  conversationId,
  title,
  className,
}: {
  conversationId: string;
  title: string;
  className?: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setPending(true);
    setError(null);
    const result = await deleteAi<{ removedObjects: number; storageUnavailable: boolean }>(
      `/api/assistant/conversations/${conversationId}`,
      { conversationId, confirm: "delete" },
    );
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    if (result.data.storageUnavailable) {
      setError("The rows were removed, but object storage is not configured here, so the stored files could not be erased.");
      return;
    }
    setConfirming(false);
    router.refresh();
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={className}
        onClick={() => setConfirming(true)}
        aria-label={`Delete the conversation “${title}”`}
      >
        <Trash2 aria-hidden />
        Delete
      </Button>
    );
  }

  return (
    <span className={className}>
      <span className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground">Delete this conversation and its files?</span>
        <Button type="button" variant="emergency" size="sm" onClick={() => void remove()} disabled={pending}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
          Delete
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirming(false)} disabled={pending}>
          Keep
        </Button>
      </span>
      {error ? (
        <span role="alert" className="mt-1.5 block text-xs font-medium text-emergency">
          {error}
        </span>
      ) : null}
    </span>
  );
}

export { DeleteConversationButton };
