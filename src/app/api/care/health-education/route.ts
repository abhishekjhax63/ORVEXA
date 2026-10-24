import type { EducationResourceCategory, SupportedLanguage } from "@prisma/client";
import type { NextRequest } from "next/server";

import { jsonOk, requireRoutePermission } from "@/lib/auth/route-session";
import { listEducationResources } from "@/lib/care/directory";
import { EDUCATION_RESOURCE_CATEGORIES, SUPPORTED_LANGUAGES } from "@/lib/validation/care";

/**
 * The health education library.
 *
 * Readable by any signed-in account. When the requested language holds no
 * reviewed material the service substitutes the English rows and sets
 * `languageUnavailable`; that flag is passed through unchanged so the page can
 * say the language is unavailable rather than silently showing English.
 */
export async function GET(request: NextRequest) {
  const session = await requireRoutePermission("care.workspace_access");
  if (!session.ok) return session.response;

  const params = request.nextUrl.searchParams;
  const languageRaw = params.get("language");
  const categoryRaw = params.get("category");
  const language: SupportedLanguage | undefined = languageRaw
    ? SUPPORTED_LANGUAGES.find((value) => value === languageRaw)
    : undefined;
  const category: EducationResourceCategory | undefined = categoryRaw
    ? EDUCATION_RESOURCE_CATEGORIES.find((value) => value === categoryRaw)
    : undefined;

  const result = await listEducationResources({ language, category });
  return jsonOk({ resources: result.resources, languageUnavailable: result.languageUnavailable });
}
