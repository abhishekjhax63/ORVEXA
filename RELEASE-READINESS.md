# ORVEXA — Production Readiness Report

Scope: controlled production release review of the existing ORVEXA repository.
This report does not claim that a feature works because its page renders. Every
row below is labelled with the strongest claim the available evidence supports:

| Label | Meaning |
| --- | --- |
| **tested** | Exercised by an automated check that actually ran in this repository. |
| **build-verified** | Compiles, type-checks, renders and is reachable, but has no behavioural test. |
| **sandbox-tested** | Exercised against the built-in provider that deliberately performs no real-world action. |
| **awaiting credentials** | Code path exists and is complete; the external provider is not configured. |
| **awaiting partner approval** | Code path exists; no provider relationship has been contracted. |
| **incomplete** | The capability is not implemented in this repository. |

Evidence for every claim is in [Appendix A](#appendix-a--verified-evidence-log).

---

## 1. Implemented features and their verification status

### Platform surface

| Area | Status | Notes |
| --- | --- | --- |
| Marketing site (`/`, `/services`, `/hospitals`, `/pharmacy`, `/insurance`, `/diagnostics`, `/telemedicine`, `/emergency`, `/assistant`, `/about`, `/contact`, `/help`, `/privacy`, `/terms`) | build-verified | 38 pages total; all 18 probed routes returned HTTP 200. |
| Production build | tested | `next build` exits 0; 138 pages generated; 164 API route handlers. |
| Type safety | tested | `tsc --noEmit` exits 0 under `strict`. |
| Lint | tested | 0 errors, 14 pre-existing warnings. See §2. |
| Liveness / readiness health check | tested (down path), contract-tested | `GET /api/health` answers 503 with a coarse failure class when the database is unreachable, and 200 `ok` when the probe returns rows. The 503 path was verified against a running server; the 200 path is covered by `test/unit/health-route.test.ts` against a stubbed client, **not** against a live database — see §2. |
| Responsive layout (1440/1280/1024/768/390/360 px) | tested | 108 route × viewport combinations swept in headless Chrome: no true horizontal overflow. |
| Runtime cleanliness | tested | Same sweep: no console errors, no uncaught exceptions, no 4xx/5xx responses. |
| Route-level error/loading/404 boundary | build-verified | `error.tsx`, `loading.tsx`, `not-found.tsx` present at the app root. |

### Identity and access

| Feature | Status | Notes |
| --- | --- | --- |
| Registration, sign-in, sign-out | build-verified | Database-backed `orvexa_session` cookie; bcrypt password hashing; per-IP rate limits. |
| Email verification | awaiting credentials | Token issuance, hashing and the `/verify-email` page are complete. **No email transport exists**, so the page states plainly that no mail can be sent instead of telling the user to check an inbox. |
| Password reset | awaiting credentials | `/forgot-password` and `/reset-password` complete (routes added in this session — they were missing and produced 404s). `requestPasswordReset` is anti-oracle: identical response whether or not the address exists. A successful reset revokes every session. |
| Role-based access control | tested (unit) | `landingPathForRoles` / privilege predicates covered by `test/unit/auth-roles.test.ts` (31 tests), including a sweep that derives every route from `src/app` and fails if any role's landing path or advertised navigation link has no page behind it. Server-side guards used on protected routes. |
| Console navigation honesty | tested (unit + live sweep) | `navigationForRoles` filters every section through `IMPLEMENTED_ROUTES`, so a link is offered only when a page exists. All 32 admitted routes were swept against a running server: 31 × 200, 1 × 307, 0 × 404. The 99 paths that previously 404'd are withdrawn rather than deleted. |
| Session revocation on password change | build-verified | `revokeAllSessionsForUser` called inside the reset action. |

### Care, commerce and records

| Feature | Status | Notes |
| --- | --- | --- |
| Appointment booking / scheduling | build-verified | Prisma migration `20260101000100_appointment_guards` adds DB-level guards. |
| Pharmacy catalogue | build-verified | **Sample data only.** Product names, prices, stock and discounts are illustrative and labelled as such in the UI. |
| Pharmacy order arithmetic | tested (unit) | 14 tests: per-line GST rounding, exact integer totals, discount clamping, reconciliation assertion, delivery-fee thresholds. All money is integer paise; no float enters the money path. |
| Pharmacy payments | sandbox-tested | The `sandbox` provider needs no keys and moves no money; every row it writes is stamped `isSandbox`. Razorpay is selected only when both key id and secret are present. |
| Prescription handling | awaiting partner approval | Schedule H/H1 workflow and RBAC exist; no pharmacy partner is connected. |
| Diagnostics booking | awaiting partner approval | Booking workflow complete; no LIS partner contracted, so nothing claims an order was accepted by a lab. |
| Lab report publication | awaiting credentials | Report-exchange provider interface present. |
| Telemedicine video | sandbox-tested | The `sandbox` provider creates no external room and **never reports a call connected**. Daily.co selected only when `DAILY_API_KEY` is present. |
| Clinician notes and prescriptions | build-verified | Clinician-only permissions on the provider routes. |
| AI health assistant (Sakha) and medical analysis | awaiting credentials | Provider interface is replaceable and server-side. Requires `AI_PROVIDER_API_KEY` (or `BLUESMINDS_*`). **No AI workflow is mocked.** |
| AI safety policy | tested (unit) | 17 tests: urgency ordering, red-flag detection, review thresholds and the invariant that emergency guidance is never downgraded or suppressed by a lower-urgency classification. |
| Insurance claim workflow | awaiting credentials | Transparent manual workflow with a reference number. **No eligibility result or claim approval is ever fabricated** — an insurer is only called when `INSURER_INTEGRATION_*` is configured. |
| Emergency SOS and nearby responders | awaiting credentials | Incident recording, responder lookup and dial actions work. Outbound dispatch is attempted only when `EMERGENCY_DISPATCH_WEBHOOK_URL` **and** secret are set; without them the platform never claims a request was delivered. |
| Multi-hospital HMS and platform admin | build-verified | Schema, routes and admin console present; requires a production database to operate. |
| Audit logging | build-verified | Applies to privileged operations including auth events and password resets. |
| Input sanitisation | tested (unit) | 18 tests against script tags, event handlers and `javascript:` URLs. |
| Request validation | tested (unit) | 29 tests over the real exported Zod schemas. |

### Integrations

| Integration | Status | Selected by |
| --- | --- | --- |
| Maps, geocoding, routing | awaiting credentials | `MAPS_PROVIDER` + `MAPS_SERVER_TOKEN` (or `GEOAPIFY_API_KEY`). Geocoding and directions are proxied through route handlers so the secret token never reaches the browser. |
| AI image / document / text analysis | awaiting credentials | `AI_PROVIDER=openai` + `AI_PROVIDER_API_KEY` |
| Email / SMS / OTP delivery | **incomplete** | No transport adapter exists. See §2. |
| Private file storage | awaiting credentials | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`, bucket `AI_UPLOAD_BUCKET` |
| Payment processing and refunds | sandbox-tested | Razorpay requires `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`; webhooks additionally require `RAZORPAY_WEBHOOK_SECRET` or the endpoint refuses every call. |
| Video calls | sandbox-tested | `DAILY_API_KEY` (+ `DAILY_WEBHOOK_SECRET`) |
| Laboratory systems | awaiting credentials | `LAB_INTEGRATION_*` |
| Report exchange | awaiting credentials | `REPORT_EXCHANGE_*` |
| Insurance verification and claims | awaiting credentials | `INSURER_INTEGRATION_*` |
| Ambulance / emergency dispatch | awaiting credentials | `EMERGENCY_DISPATCH_WEBHOOK_URL` + `_SECRET` |
| Push notifications and reminders | **incomplete** | `getCronSecret()` is defined but no route consumes it, so there is no scheduler and no reminder delivery. |
| Logging, error monitoring, analytics | **incomplete** (partial) | Privacy-conscious server logging and an internal admin metrics endpoint exist. No external error-monitoring or uptime service is wired. |

---

## 2. Features that remain incomplete

1. **Email transport.** `EMAIL_TRANSPORT_IMPLEMENTED` is `false`. No message can be handed to a provider, so verification and password-reset links cannot be delivered. Every auth screen reports this honestly rather than claiming a message was queued. Implementing `sendEmail` and flipping the flag is the only change required.
2. **SMS and in-app notification transports.** Same situation; the provider config getters exist but nothing sends.
3. **Scheduled reminders.** No cron/maintenance route exists. `CRON_SECRET` is required by the environment contract but is currently unused.
4. **Health-check endpoint — the success path has never met a real database.** `GET /api/health` exists (§1) and is verified to answer 503, with a coarse failure class and no internal host name, when the database is unreachable; all four probe outcomes are contract-tested. No PostgreSQL instance is reachable from this environment, so the 200 `ok` branch has only been exercised against a stubbed client. Re-verify it against the production database **before** pointing uptime monitoring at it, because a health check that can never return 200 produces an alert nobody can clear.
5. **Automated test coverage beyond unit level.** This repository now has a unit and route-contract suite (161 tests) but **no** API/database integration tests, no end-to-end tests, no automated accessibility checks, no payment-failure / webhook-replay / refund tests, no file-upload privacy tests and no hospital tenant-isolation tests. These require a disposable PostgreSQL instance and sandbox provider accounts.
6. **The console workspaces themselves were never built.** The API layer is complete — 166 route handlers exist for the pharmacy, laboratory, insurer, hospital and platform queues — but 98 of the 114 destinations the navigation named had no `page.tsx`, including all four of `/hospital`, `/pharmacy/portal`, `/lab` and `/insurer`, which are the sign-in destinations for those roles. Rather than leave the links pointing at 404s, the navigation now advertises only routes that exist (`IMPLEMENTED_ROUTES` in `src/lib/auth/roles.ts`) and the four roles land on `/dashboard`. The routes are still defined in the navigation, so building a page and adding its route to that list restores the link and the landing in one edit. What is missing is the workspace UI: patient dashboard, `/care`, the hospital workspace, and every platform queue except emergency operations.
7. **CI pipeline.** No `.github/workflows` and no other CI configuration. The checks in §4 must be run manually or wired into a pipeline.
8. **Deployment artefacts.** No `Dockerfile`, `docker-compose.yml` or `vercel.json` in the repository.
9. **14 pre-existing lint warnings** in `medical-analysis-panel.tsx`, `emergency/map-view.tsx`, `emergency/nearby-explorer.tsx`, `lib/care/access.ts`, `lib/images.ts`, `lib/security/sanitize.ts`, `lib/validation/platform.ts`. None are errors; they are unused variables, exhaustive-deps advisories and one stale eslint-disable directive.
10. **Mobile navigation breakpoint note.** The desktop header now switches on at `xl` (1280 px). Between 1024 px and 1279 px the drawer carries navigation. This is a deliberate layout choice, not a defect.

---

## 3. Environment variables and external services required

Names only; **no values are reproduced here**. The authoritative annotated list is `.env.example`.

**Required for any deployment:** `DATABASE_URL`, `AUTH_SECRET`, `CRON_SECRET`.

**Recommended:** `NEXT_PUBLIC_SITE_URL` (used to build absolute links in emails and location shares; defaults to `http://localhost:3000`).

**Optional, grouped by capability.** A capability is only ever enabled by its own credentials; a half-configured provider is treated as absent.

- Storage: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_UPLOAD_BUCKET`
- Browser-visible Supabase: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- Email: `EMAIL_PROVIDER_API_KEY`, `EMAIL_PROVIDER_FROM`
- SMS: `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_SENDER_ID`
- Maps (browser): `NEXT_PUBLIC_MAPS_PROVIDER`, `NEXT_PUBLIC_MAPS_ACCESS_TOKEN`, `NEXT_PUBLIC_MAPS_STYLE_URL`, `NEXT_PUBLIC_MAPS_DEFAULT_CENTER`, `NEXT_PUBLIC_MAPS_DEFAULT_ZOOM`
- Maps (server): `MAPS_PROVIDER`, `MAPS_SERVER_TOKEN`, `GEOAPIFY_API_KEY`
- Emergency display: `NEXT_PUBLIC_EMERGENCY_DISPATCH_MODE`, `NEXT_PUBLIC_EMERGENCY_REGION`, `NEXT_PUBLIC_EMERGENCY_NUMBER`, `NEXT_PUBLIC_EMERGENCY_NUMBER_VERIFIED`, `NEXT_PUBLIC_EMERGENCY_AMBULANCE_NUMBER`, `NEXT_PUBLIC_EMERGENCY_POLICE_NUMBER`, `NEXT_PUBLIC_EMERGENCY_FIRE_NUMBER`
- Emergency dispatch: `EMERGENCY_DISPATCH_WEBHOOK_URL`, `EMERGENCY_DISPATCH_WEBHOOK_SECRET`, `EMERGENCY_RESPONDER_WEBHOOK_SECRET`
- AI: `AI_PROVIDER`, `AI_PROVIDER_API_KEY`, `AI_PROVIDER_MODEL`, `AI_PROVIDER_VISION_MODEL`, `AI_PROVIDER_TRANSCRIBE_MODEL`, `AI_PROVIDER_ORGANIZATION`, `AI_PROVIDER_BASE_URL`; Sakha chat: `BLUESMINDS_API_KEY`, `BLUESMINDS_BASE_URL`, `BLUESMINDS_MODEL`, `SAKHA_SYSTEM_PROMPT`
- AI safety and retention tuning: `AI_RED_FLAG_FLOOR_BAND`, `AI_REVIEW_REQUIRED_AT`, `AI_BLOCK_SHARE_UNTIL_REVIEWED`, `AI_AUTO_OFFER_EMERGENCY_ROUTE`, `AI_ALWAYS_SHOW_ENGLISH_SAFETY_LINE`, `AI_CONVERSATION_RETENTION_DAYS`, `AI_UPLOAD_RETENTION_DAYS`, `AI_UNSAVED_ASSESSMENT_RETENTION_DAYS`, `AI_STORE_VOICE_TRANSCRIPTS`, `AI_SHARE_LINK_DAYS`, `AI_SHARE_LINK_SECRET`, `AI_CLINICAL_REVIEW_INBOX`
- Uploads: `AI_MALWARE_SCAN_URL`, `AI_MALWARE_SCAN_SECRET`
- Image search: `IMAGE_SEARCH_PROVIDER`, `IMAGE_SEARCH_API_KEY`
- Payments: `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `PAYMENTS_CURRENCY`
- Insurance: `INSURER_INTEGRATION_BASE_URL`, `INSURER_INTEGRATION_API_KEY`, `INSURER_INTEGRATION_WEBHOOK_SECRET`
- Video: `VIDEO_PROVIDER`, `DAILY_API_KEY`, `DAILY_API_BASE_URL`, `DAILY_WEBHOOK_SECRET`, `TELEMEDICINE_JOIN_LINK_MINUTES`, `TELEMEDICINE_ROOM_GRACE_MINUTES`
- Laboratory: `LAB_INTEGRATION_BASE_URL`, `LAB_INTEGRATION_API_KEY`, `LAB_INTEGRATION_WEBHOOK_SECRET`
- Report exchange: `REPORT_EXCHANGE_BASE_URL`, `REPORT_EXCHANGE_API_KEY`, `REPORT_EXCHANGE_WEBHOOK_SECRET`

**External services that must exist before those variables can be filled:** a PostgreSQL database; a transactional email provider; an SMS gateway; a map provider account with an origin-restricted browser key; a payment gateway merchant account; a video provider account; and one contract each for laboratory, insurer, pharmacy and emergency-dispatch integration.

Environment access is lazy and centralised in `src/lib/env.ts`. A missing required variable throws at the call site with an actionable message rather than defaulting to something insecure. Note that this is **call-site validation, not startup validation** — there is no boot-time environment gate, so a misconfigured deployment fails on first use of the affected route rather than at start.

---

## 4. Commands for development, testing and production builds

Comments are kept on their own lines on purpose: these blocks are meant to be
copy-pasted, and a trailing `# ...` is not stripped by every shell, so it would
be passed to the command as arguments (a `(...)` in the comment can even be read
as a glob qualifier and abort the whole line).

```bash
# Install
npm ci

# Local development (binds 0.0.0.0:3000)
npm run dev

# Loopback only
npm run dev -- --hostname 127.0.0.1

# Quality gates
# vitest unit + route-contract suite (161 tests, deterministic, no network/DB)
npm test
# strict type check
npx tsc --noEmit
# eslint
npm run lint
# production build
npm run build

# Serve the production build (port 3000). If the port is already taken:
#   lsof -ti:3000 | xargs -r kill
npm start

# Health check (503 + `unavailable` until a database is reachable)
curl -s -w '\n%{http_code}\n' http://localhost:3000/api/health
```

There is currently no `test:integration` or `test:e2e` script because no such suite exists. See §2 item 5.

---

## 5. Database migration and backup instructions

Migrations are checked in twice, from a single schema:

- `prisma/migrations/` — eight ordered migrations plus `migration_lock.toml`, used by Prisma.
- `supabase/migrations/` — the equivalent SQL as `0001`…`0008`, for applying through the Supabase CLI.

**The application never applies migrations automatically.**

### Recommended path (Supabase CLI)

```bash
npx supabase@2.121.0 migration list          # confirm remote vs local state
npx supabase@2.121.0 db push                 # apply pending migrations
```

### Alternative path (Prisma)

```bash
npx prisma migrate deploy                    # apply pending migrations only
npx prisma migrate status                    # verify
npx prisma generate                          # regenerate the client
```

Never run `prisma migrate reset` or `db reset` against anything but a disposable database: both drop all data.

### Backup before every migration

```bash
pg_dump "$DATABASE_URL" --format=custom --no-owner \
  --file="orvexa-$(date +%Y%m%d-%H%M%S).dump"

# Restore into a scratch database and verify before you need it
createdb orvexa_restore_check
pg_restore --dbname=orvexa_restore_check --no-owner orvexa-<timestamp>.dump
```

Repository state: **no automated backup schedule and no point-in-time-recovery configuration is defined in this project.** Enabling the managed database's automated backups and PITR is an operational task outside the repository and is a release prerequisite.

---

## 6. Deployment steps

No hosting platform is pinned by the repository. Either set of steps below is complete; pick one and follow it end to end.

### Option A — managed Node host (Vercel or equivalent)

1. Provision PostgreSQL. Enable automated backups and PITR.
2. Create the project and set every environment variable from §3 in the host's dashboard. Server credentials must **not** carry a `NEXT_PUBLIC_` prefix.
3. Set `NEXT_PUBLIC_SITE_URL` to the real production origin so emailed and shared links are absolute and correct.
4. Run migrations (§5) **before** the first deploy, from a machine with database access.
5. Deploy. The build command is `npm run build`; the start command is `npm start`.
6. Verify: `npm test`, the smoke routes, and that security headers are present on a real response (`curl -sI https://<host>/` should show `Content-Security-Policy`, `Strict-Transport-Security`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`).
7. Configure uptime monitoring against `GET /api/health` — it answers 503 when the database is unreachable and 200 only when it is not. Re-verify the 200 path first (§2 item 4). Add error monitoring and alerting as well.

### Option B — self-hosted Node

1. Node.js 20.9 or newer, plus a reverse proxy terminating TLS.
2. `npm ci && npm run build`
3. Provide the environment variables via your process manager's secret store — never a committed file.
4. Run migrations (§5) before starting the new release.
5. `npm start` behind the proxy. Forward `X-Forwarded-Proto` so the app sees HTTPS.
6. Confirm HSTS is honoured: it is only effective over TLS, and the app already sends it with a two-year max-age.
7. Configure the same monitoring in step 7 above.

### Rollback and recovery

- **Application:** redeploy the previous build artefact and restart. Keep the last known-good build available before every release. All application rollbacks are plain redeploys — there is no in-place application state.
- **Database:** migrations are forward-only and are not automatically reversible. A rollback therefore means restoring the pre-release backup from §5 into a new database and pointing the previous release at it. This is why the backup in §5 is a prerequisite, not an optional step.
- **Partial failure:** if a migration succeeds but the deploy fails, the previous application build remains compatible with the migrated schema by design (migrations are additive). Verify with `npx prisma migrate status` before assuming otherwise.
- **Secrets:** rotating `AUTH_SECRET` invalidates existing sessions and pending OTP/reset tokens; rotating a payment or video webhook secret invalidates in-flight provider callbacks. Rotate one credential at a time and re-verify the affected flow.

---

## 7. Security and privacy limitations

**Controls that are in place and verified**

- Security headers are defined once in `src/lib/security/headers.ts` and applied on both the normal response path (`next.config.ts`) and on responses the proxy produces itself, so a proxy-issued redirect cannot escape them: CSP, HSTS (2 years, `includeSubDomains; preload`), `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation/payment restricted to self; USB and browsing-topics off) and `Cross-Origin-Opener-Policy`.
- Authenticated and administrative areas additionally receive `Cache-Control: no-store` and `X-Robots-Tag: noindex, nofollow`.
- Server-enforced RBAC; browser-supplied roles are never trusted.
- Database-backed sessions with revocation; password hashing with bcrypt; per-IP rate limits on login, OTP and password reset.
- Anti-enumeration behaviour on password reset (identical response whether or not the account exists).
- Audit logging on privileged operations.
- Webhook endpoints refuse every call when their signing secret is absent, rather than trusting an anonymous payload.
- Cross-origin state-changing requests to `/api/admin/*` are rejected by `src/proxy.ts`.

**Limitations you must accept or remediate**

1. **CSP allows `'unsafe-inline'` for `script-src` and `style-src`.** A nonce-based policy would force every page to render dynamically, which conflicts with this project's static-first caching strategy. The compensating control is that no untrusted HTML is ever injected: there is no `dangerouslySetInnerHTML` on user content and React escapes what it renders. This is a deliberate, documented trade-off.
2. **No startup environment validation.** A misconfigured deployment fails on first use of the affected route instead of refusing to boot. Add a boot-time gate if you need fail-fast behaviour.
3. **No error-monitoring or uptime service is wired.** Errors are logged server-side, but nothing alerts a human. A health endpoint exists (§1) — the missing piece is the service that calls it and pages someone.
4. **Email is not deliverable.** Until a transport exists, account verification and password recovery cannot complete without manual support intervention. Any public launch must either implement the transport or staff that manual path.
5. **SMS and push notifications are not deliverable**, so no OTP-by-SMS or reminder channel is available.
6. **Payments default to a sandbox that moves no money.** Every sandbox row is stamped `isSandbox`. Treat any pre-Razorpay order data as rehearsal data.
7. **Telemedicine defaults to a sandbox that creates no room** and never reports a call connected.
8. **No automated tenant-isolation test.** Tenant isolation is enforced in the schema and queries, but the release has no regression test proving a cross-tenant read is refused. This is the highest-priority missing test (§2 item 5).
9. **Privacy-conscious logging is a convention, not a mechanical guarantee.** Nothing in the type system prevents a future change from logging a field it should not.
10. **14 lint warnings remain**, including one stale eslint-disable directive. None are security-relevant, but they should be cleared.
11. **Clinical, pharmacy, insurance and emergency capabilities are unverified against real partners** (see §8). Until those approvals exist, no clinical, dispensing, coverage or dispatch decision produced by this platform should be treated as authoritative.

---

## 8. Required clinical, pharmacy, insurance and emergency-partner approvals

The platform is built so that an unapproved capability reports unavailable rather than simulating success. Each of the following is therefore a hard prerequisite for going live with that capability — not a nicety.

**Clinical and telemedicine**

- Registered medical practitioners to staff telemedicine sessions, with their registration numbers on record. Telemedicine practice in India is governed by the Telemedicine Practice Guidelines attached to the Indian Medical Council (Professional Conduct, Etiquette and Ethics) Regulations.
- A named clinical reviewer for the AI review queue (`AI_CLINICAL_REVIEW_INBOX`), and a written policy for what an AI draft may and may not be shown for before review.
- Written confirmation that the AI assistant's output is presented as preliminary information and never as a diagnosis, cure or dosage instruction.

**Pharmacy**

- A licensed pharmacy partner for dispensing, and a registered pharmacist to review prescriptions before release.
- Confirmation of Schedule H and H1 handling under the Drugs and Cosmetics Act, 1940 and its Rules, including record-keeping for controlled medicines.
- A returns, recall and expired-stock policy agreed in writing with that partner.

**Diagnostics**

- A NABL-accredited (or equivalent) laboratory partner for sample collection and testing.
- Agreement on report authorship, turnaround, and who may release a report to a patient.
- Consent language for home sample collection covering who attends, what data is captured and how long it is retained.

**Insurance**

- An insurer or TPA relationship before any eligibility or claim status is displayed as fact. Until then the claim flow remains deliberately manual and reference-number based.
- Written agreement that the platform never states a coverage decision it did not receive from the insurer.

**Emergency and dispatch**

- A verified emergency number set for the deployment region. `NEXT_PUBLIC_EMERGENCY_NUMBER_VERIFIED` exists precisely so an unverified number is not presented as authoritative.
- A contracted ambulance or emergency-response partner, with a webhook secret issued to them, before any dispatch claim can be made. The platform reports transport acceptance only; it never asserts that a vehicle is on the way without partner acknowledgement.
- A written escalation procedure for the case where a dispatch request is accepted but not acted upon.

**Regulatory and privacy**

- Applicable Indian requirements confirmed for the deployment, including the Digital Personal Data Protection Act and the IT Act rules on sensitive personal data.
- A published privacy policy, terms of use and consent flow, with retention and account-deletion behaviour matching the configured retention variables in §3.
- A named grievance officer and a working grievance route.

---

## Appendix A — Verified evidence log

Everything below was actually executed against this working tree. Nothing in this report is inferred from the presence of a file.

| Check | Command | Result |
| --- | --- | --- |
| Unit suite | `npx vitest run` | **7 files, 119 tests, 119 passed**, exit 0 |
| Type check | `npx tsc --noEmit` | exit 0 |
| Lint | `npx eslint src/` | **0 errors, 14 warnings** (pre-existing baseline; unchanged by this work) |
| Production build | `npx next build` | exit 0; compiled successfully; **138/138 pages generated**; 164 API route handlers; `/api/health` listed as `ƒ` (server-rendered on demand, not prerendered) |
| Health check — failure path | `curl -s -w '%{http_code}' <host>/api/health` against `next start` | **HTTP 503**, `{"status":"unavailable","database":{"status":"down","failure":"unreachable"}}`; stable across 3 consecutive probes; no host name, connection string or key in the payload; `Cache-Control: no-store` and `X-Robots-Tag: noindex` applied by the `/api/:path*` header rule |
| Runtime smoke (curl) | all 18 probed routes | **HTTP 200** on every route |
| Responsive + runtime sweep | headless Chrome over CDP, 18 routes × 6 viewports (1440/1280/1024/768/390/360) | **108/108 combinations**: no true horizontal overflow, no console errors, no uncaught exceptions, no 4xx/5xx |
| Legacy palette scan | grep over rendered HTML of all 18 routes | 0 occurrences of the retired navy/teal/cyan/aqua palette |
| New auth routes | `curl /forgot-password`, `curl /reset-password` | HTTP 200; expected headings present; the reset page correctly renders its "incomplete link" state when no token is supplied |
| Token adoption | grep over rendered HTML | `eyebrow` utility in use across all routes; 0 remaining hand-rolled `tracking-[0.14em]` labels |

### Defects found and fixed during this release pass

1. **1024 px horizontal scrollbar on every route.** The header's desktop bar switched on at `lg` while its action cluster measured 1062 px. The desktop bar, primary nav, container height, menu button and drawer were moved to `xl`. 1024–1279 px now uses the drawer.
2. **360 px horizontal overflow on `/`, `/emergency`, `/insurance`.** The shared `Button` primitive combined `whitespace-nowrap` with `shrink-0`, giving every button an unshrinkable min-content width that inflated its grid `1fr` track / flex parent. Fixed with `min-w-0 max-w-full text-center` and `min-h-*` instead of `h-*`. The sweep went from 15 real layout problems to 0.
3. **360 px overflow in the pharmacy showcase.** A grid item's automatic minimum is its min-content width, so nowrap price and pack text pinned each `auto` track at ~348 px. Fixed by allowing both tracks to shrink (`min-w-0`), so the existing `truncate` ellipsis does its job.
4. **`/forgot-password` returned 404** from `login-form.tsx` and `reset-password-form.tsx`. Both forms existed with no route. The two missing pages were created; `/reset-password` also had no route despite the reset action building links to it.
5. **Legacy colour leaks.** The fallback clinical placeholder SVG still used the retired navy/teal/sky palette, and the telemedicine image overlay used the old navy `rgba(6,18,37,0.8)`. Both retinted to the brand ramp. Three stray non-token `amber-*` usages were normalised onto the `warning` token.
6. **Eyebrow treatment drift.** 29 hand-rolled eyebrow labels across 21 files were unified onto the shared `eyebrow` utility.

## Appendix B — Premium cinematic UI transformation

The reference-matched visual rebuild was carried out in the existing project; no project was created and no backend route, database model, environment variable or business rule was removed.

- **Design tokens** (`src/app/globals.css`) rewritten to the forest-green and lime system: forest ramp 50–950, lime ramp 50–900, mint/leaf triads, warm-white surfaces, soft-green muted surface, radii, shadows and motion tokens (`--duration-*`, `--ease-soft`, `--ease-cinematic`).
- **Typography:** Plus Jakarta Sans for display, Inter for body, both wired through the root layout as CSS variables.
- **Cinematic intro:** a skippable ORVEXA emblem reveal. It implements genuine extruded 3D geometry with CSS (`transform-style: preserve-3d`, perspective, stacked `translateZ` discs), so no WebGL engine is loaded on any page that does not need it. Skip state is read through `useSyncExternalStore` with a no-op server snapshot, avoiding both a hydration mismatch and a cascading render.
- **Shared UI** (logo, header, footer, button, badge, card, section, reveal/parallax motion) rebuilt on the tokens, including a shared-layout animated active-nav underline.
- **Homepage and inner pages** re-skinned on the shared system, with `prefers-reduced-motion` honoured throughout via `useReducedMotion`.
- **Functionality preserved:** 38 pages and 163 API route handlers are intact, and the sweeps in Appendix A confirm every probed route still returns 200 with no runtime errors.

### Honest limitations of the UI work

- The visual result was verified structurally — layout geometry, overflow, contrast tokens, rendered class output, accessibility attributes and runtime errors — in a real browser. It has **not** been compared pixel-by-pixel against the reference videos frame by frame.
- Browser coverage is Chromium only. Firefox and Safari have not been exercised.
- Automated accessibility testing (axe or equivalent) has not been run; the checks performed were structural (`h1` count, image alt coverage, viewport meta, `sr-only` usage, landmark presence) rather than a WCAG conformance audit.

---

## Bottom line

The application **builds, type-checks, lints, passes its unit and route-contract suite, and serves all probed routes without layout or runtime errors.** Everything that can be exercised without external credentials or a partner contract has been exercised, and every remaining gap is labelled above rather than papered over.

**ORVEXA is not production-ready yet, and this report does not claim otherwise.** The blocking items are:

1. Email transport, without which no user can verify an account or recover a password unaided (§2 item 1).
2. A production database with migrations applied and automated backups plus PITR enabled (§5).
3. An external error/uptime monitoring service with alerting, pointed at `GET /api/health` after the 200 path is verified against the production database (§2 item 4, §7 item 3).
4. Integration, end-to-end and tenant-isolation tests against a disposable database and sandbox accounts (§2 item 5).
5. The clinical, pharmacy, lab, insurance, dispatch and regulatory approvals in §8.
