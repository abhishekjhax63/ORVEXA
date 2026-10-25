# ORVEXA

ORVEXA is a healthcare platform built with Next.js App Router, TypeScript,
Prisma/PostgreSQL, and optional Supabase storage integrations.

## Local development

Requirements: Node.js 20.9 or newer and npm.

```bash
npm ci
cp .env.example .env.local
# Fill the required local values in .env.local; never commit that file.
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). To bind only to the local
machine, use `npm run dev -- --hostname 127.0.0.1`.

`DATABASE_URL`, `AUTH_SECRET`, and `CRON_SECRET` are required for the complete
application. Database-backed flows also require a reachable PostgreSQL
database. Supabase browser-client variables are optional and are not used for
ORVEXA's database-backed sign-in. Review the Prisma migrations and back up the
database before applying them with `npx prisma migrate deploy`; the app does not
apply migrations automatically.

The `.env.example` file lists supported environment variables. Keep server
credentials in `.env.local` without a `NEXT_PUBLIC_` prefix. Browser-visible
Mapbox or Geoapify keys must be restricted at the provider. The floating Sakha
AI chat uses the server-side `BLUESMINDS_*` settings; the separate assessment
assistant uses `AI_PROVIDER_*`.
Sakha AI image understanding uses the existing server-side `AI_PROVIDER=openai`
configuration and `AI_PROVIDER_API_KEY`; set `AI_PROVIDER_VISION_MODEL` only
when `AI_PROVIDER_MODEL` is not image-capable. Sakha image search uses the
optional Brave Search API image endpoint and requires `IMAGE_SEARCH_PROVIDER=brave`
and `IMAGE_SEARCH_API_KEY`. Keep both keys server-side. If search is not
configured, the feature reports that status instead of returning sample results.

Some integrations intentionally report unavailable rather than claiming a
message or action succeeded. In particular, email, SMS, and in-app notification
transports are not implemented, even if their provider settings are supplied.
The pharmacy payment sandbox does not move money, and the telemedicine sandbox
does not place calls.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```
