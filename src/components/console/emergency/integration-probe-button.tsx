"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { postConsoleJson } from "@/lib/platform/client";

/**
 * Re-checks one integration's configuration state.
 *
 * The check does not call the vendor. It re-reads what this deployment is
 * configured for and records the result as an alert: a provider that is not
 * configured opens an alert, and a provider that is configured resolves the
 * one this deployment previously opened. The result is never worded as
 * "healthy" — only "configured" or "not configured".
 */
type ProbeOutcome = {
  provider: string;
  status: { label: string; state: "configured" | "not_configured"; detail: string };
  alertRaised: boolean;
  alertResolved: boolean;
};

export function IntegrationProbeButton({ provider, label }: { provider: string; label: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  async function onCheck() {
    setPending(true);
    setMessage(null);
    setFailed(false);

    const result = await postConsoleJson<ProbeOutcome>("/api/admin/emergency/integrations", { provider });
    setPending(false);

    if (!result.ok) {
      setFailed(true);
      setMessage(result.error);
      return;
    }

    const { alertRaised, alertResolved, status } = result.data;
    if (alertRaised) {
      setMessage(`Recorded as not configured — an alert has been opened for ${label}.`);
    } else if (alertResolved) {
      setMessage("Recorded as configured — the matching alert has been resolved.");
    } else if (status.state === "configured") {
      setMessage("Recorded as configured; no matching alert was open.");
    } else {
      setMessage("Recorded as not configured; a matching alert was already open.");
    }
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-1.5">
      <Button type="button" variant="outline" size="sm" onClick={onCheck} disabled={pending}>
        {pending ? "Checking…" : "Check this provider"}
      </Button>
      {message ? (
        <p className={failed ? "text-right text-xs text-emergency" : "text-right text-xs text-muted-foreground"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
