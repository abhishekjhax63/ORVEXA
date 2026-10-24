import type { NextRequest } from "next/server";

import { jsonError, jsonOk } from "@/lib/auth/route-session";
import { enforceConsoleLimit, platformFailure, readConsoleBody } from "@/lib/platform/api";
import { requirePlatformRoute } from "@/lib/platform/console";
import {
  listNotificationTemplates,
  removeNotificationTemplate,
  upsertNotificationTemplate,
} from "@/lib/platform/configuration";
import { notificationTemplateSchema } from "@/lib/validation/platform";

/**
 * Notification templates, keyed by message and channel.
 *
 * A body is plain text with `{{placeholders}}` resolved at send time and is
 * never rendered as HTML, so a template cannot become a script-injection vector
 * and an operator cannot put markup into a message a patient receives.
 */
export async function GET() {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminRead", session.context);
  if (!limit.ok) return limit.response;

  return jsonOk({ templates: await listNotificationTemplates() });
}

export async function POST(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  const parsed = await readConsoleBody(request, notificationTemplateSchema, "That template");
  if (!parsed.ok) return parsed.response;

  const result = await upsertNotificationTemplate({ context: session.context, data: parsed.data });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ templates: result.data });
}

export async function DELETE(request: NextRequest) {
  const session = await requirePlatformRoute("platform.configuration_manage");
  if (!session.ok) return session.response;

  const limit = await enforceConsoleLimit("adminConfigWrite", session.context);
  if (!limit.ok) return limit.response;

  // A template is identified by message key *and* channel, because the same
  // message legitimately exists as an SMS and as an email with different copy.
  const parsed = notificationTemplateSchema
    .pick({ key: true, channel: true })
    .safeParse({
      key: request.nextUrl.searchParams.get("key"),
      channel: request.nextUrl.searchParams.get("channel"),
    });
  if (!parsed.success) return jsonError(422, "That template key and channel are not valid.");

  const result = await removeNotificationTemplate({
    context: session.context,
    key: parsed.data.key,
    channel: parsed.data.channel,
  });
  if (!result.ok) return platformFailure(result.code, result.message);

  return jsonOk({ templates: result.data });
}
