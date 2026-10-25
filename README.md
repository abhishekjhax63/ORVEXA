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
Sakha AI image understanding needs a vision-capable model on whichever provider
`AI_PROVIDER` names. The vision model is resolved as `AI_PROVIDER_VISION_MODEL`,
then `<PROVIDER>_VISION_MODEL`, then the provider's verified default. It never
falls back to the text model, because a text-only model asked to describe an
image answers "I can't view images". With `AI_PROVIDER=bluesminds` that is
`BLUESMINDS_VISION_MODEL` (for example `meta/llama-3.2-11b-vision-instruct`) with
`BLUESMINDS_API_KEY`; with `AI_PROVIDER=openai` it is `AI_PROVIDER_API_KEY`.
Sakha image search is a separate feature from image understanding: it uses the
optional Brave Search API image endpoint and requires
`IMAGE_SEARCH_PROVIDER=brave` and `IMAGE_SEARCH_API_KEY`. Keep every key
server-side. If either is not configured, the feature reports that status
instead of returning sample results.

Some integrations intentionally report unavailable rather than claiming a
message or action succeeded. In particular, email, SMS, and in-app notification
transports are not implemented, even if their provider settings are supplied.
The pharmacy payment sandbox does not move money, and the telemedicine sandbox
does not place calls.

## Google sign-in (optional)

Google sign-in is a second way into the existing `orvexa_session` system, not a
second authentication system. It runs the OAuth 2.0 authorization-code flow with
PKCE and then opens the same database-backed session cookie that password and OTP
sign-in produce, so roles, hospital tenancy and audit are unchanged. Email
/password and phone OTP keep working regardless.

Without `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` the button renders disabled
and names the missing variables, and `/api/auth/google/start` redirects to
`/login?oauth=unconfigured` rather than starting a flow that would fail at the
token exchange. To enable it:

1. Google Cloud Console -> **APIs & Services -> OAuth consent screen**: type
   External, set the app name, support email and developer contact, then publish
   (or add yourself as a test user while it is in "Testing").
2. **APIs & Services -> Credentials -> Create credentials -> OAuth client ID**,
   application type **Web application**.
3. **Authorised JavaScript origins**:
   - `http://localhost:3000`
   - `https://YOUR_PRODUCTION_ORIGIN`
4. **Authorised redirect URIs**, which must match the callback exactly:
   - `http://localhost:3000/api/auth/google/callback`
   - `https://YOUR_PRODUCTION_ORIGIN/api/auth/google/callback`
5. Copy the credentials into `.env.local`:

```bash
GOOGLE_CLIENT_ID="YOUR_ID.apps.googleusercontent.com"
GOOGLE_CLIENT_SECRET="YOUR_SECRET"
```

The callback is `${NEXT_PUBLIC_SITE_URL}/api/auth/google/callback`. A deployment
served from a different origin than `NEXT_PUBLIC_SITE_URL` should set
`GOOGLE_OAUTH_REDIRECT_URI` and register that exact value in step 4 instead. The
client secret stays server-side and is never sent to the browser or logged.

## Checks

```bash
npm run lint
npx tsc --noEmit
npm run build
```
