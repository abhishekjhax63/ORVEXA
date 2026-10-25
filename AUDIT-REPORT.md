# ORVEXA — Project Audit, Photo Integration, Authentication and Bug-Fix Report

**Report date:** 2026-10-25
**Repository:** `/Users/abhishekkumarjha/v3`
**Local URL verified:** http://localhost:3000 (Next.js 16.4.2, `next start`)
**Status vocabulary:** **PASS** = performed and evidenced · **FAIL** = attempted, does not work · **BLOCKED** = cannot be performed in this environment; the exact blocker is named.

Companion documents: [PHOTO-AUDIT.md](file:///Users/abhishekkumarjha/v3/PHOTO-AUDIT.md) (§1 detail), [RELEASE-READINESS.md](file:///Users/abhishekkumarjha/v3/RELEASE-READINESS.md) (Phase 12 production-readiness report).

---

## 0. How this was verified

Nothing below is inferred from a page rendering. Every claim is one of:

- a command run in this repo whose output is quoted,
- an HTTP status measured against the running server,
- a test that passes in `npm test`,
- or an explicit statement that the check could not be run.

**Two environment variables are absent from `.env.local` and gate most of this report:**

| Variable | Present? | What it blocks |
| --- | --- | --- |
| `DATABASE_URL` | **NO** | Every authenticated flow, all 166 API handlers that touch Prisma, migrations, and the 200 branch of `/api/health`. |
| `AUTH_SECRET` | **NO** | Signing the `orvexa_session` cookie. Sign-in and registration cannot complete without it. |

`.env.local` does contain 11 variables: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `BLUESMINDS_API_KEY`, `BLUESMINDS_BASE_URL`, `BLUESMINDS_MODEL` (= `openai/gpt-oss-20b`), `BLUESMINDS_VISION_MODEL` (= `meta/llama-3.2-11b-vision-instruct`), `AI_PROVIDER` (= `bluesminds`), `NEXT_PUBLIC_GEOAPIFY_API_KEY`, `GEOAPIFY_API_KEY`, `NEXT_PUBLIC_MAPS_PROVIDER` (= `geoapify`), `NEXT_PUBLIC_MAPS_ACCESS_TOKEN`.

Consequently **every item that requires a signed-in session is BLOCKED, and is marked BLOCKED rather than PASS.**

**Reverification pass (same day).** The full gate was re-run against the current tree and the running production server after the fixes in §5.1 items 7–10: `tsc --noEmit` exit 0 · `npm run lint` **0 errors / 0 warnings** · `npm test` **161/161** · `npm run build` exit 0, **142** static pages · `npm audit` **0 vulnerabilities** · all 24 probed routes answered `200`/`307` with none `404` · `/robots.txt` and `/sitemap.xml` now `200`. The Sakha vision path was re-tested live against the BluesMinds account (see §2.1).

---

## 1. Doctor and hospital photos from the Excel data and official website links

**Verdict: PASS for the audit and the integration · FAIL for the objective of publishing photos (0 of 103) · BLOCKED on a verified source.**

Full detail is in [PHOTO-AUDIT.md](file:///Users/abhishekkumarjha/v3/PHOTO-AUDIT.md). Summary:

| Question | Answer |
| --- | --- |
| Excel files found | 3 workbooks in `Downloads/` — `Patna_Doctors_Directory.xlsx`, `Patna_Hospitals_Doctors_Directory.xlsx`, and a byte-identical duplicate `Patna_Hospitals_Doctors_Directory (1).xlsx` |
| Sheets and rows read | `Doctors` (82 + 51), `Hospitals` (20), `Hospital contacts` (5), `Read me` (12 notes) |
| Records processed | **103** (83 doctors + 20 hospitals) after de-duplication |
| Photo URLs present in the workbooks | **0** |
| Photos added | **0** |
| Photos retained | **0** |
| Records marked photo-unavailable | **103** |
| Broken photo links | **0** — there were no links to break |
| Photos of a similarly-named doctor/hospital mixed up | **0** — none was used at all |
| AI-generated faces or unrelated stock used as a real person | **0** |

**Why zero, and why that is the correct outcome.** The workbook's own `Read me` sheet states that it links to *directory pages where profile photos may appear* and that *individual image files are not embedded*. Every one of the 103 records carries a `profileUrl` that is a listing page, not a per-entity profile page. The distinct official doctor-listing hosts were fetched and searched for `img src`, `data-src`, `srcset` and CSS `background-image`:

- `tmhpatna.com/our-doctors/` (14 doctors) and the only per-doctor profile page that exists in the set, `tmhpatna.com/doctor/28462` — **no portrait**.
- `modernhospitalpatna.com/doctors.html` (35 doctors) — one image URL, repeated beside 6+ different doctors, differing only by session signature, hosted on a third-party CDN (`p16-cc-image-search-sign-sg.ibyteimg.com`) with a time-limited `x-expires`. That is this pipeline's own image-search artefact, not the hospital's asset. Using it would have published one unknown person's face as six different doctors.
- `cmhospitalpatna.com`, `oxygenhospital.co.in/doctors/`, `aarogyamhdna.com/our-doctors` — **no images found**. `pmchpatna.in` — bot interstitial. `mhcs.org.in` — would not load. `rubanhospital.com` — parked domain.
- Two records (`Satyadev Multi Super Speciality Hospital`, `Sahyog Hospital`) have a `google.com/search?q=` URL because no official site exists; a search-results page is not attributable, so nothing was taken from it.

`robots.txt` was checked on each host: no image-reuse rule was the blocker — the absence of a usable image was.

**What was fixed instead.** The image plumbing existed but was dead:

- `getHospitalImage` / `getDoctorImage` in [images.ts](file:///Users/abhishekkumarjha/v3/src/lib/images.ts) were referenced nowhere outside their own file.
- [provider-cards.tsx](file:///Users/abhishekkumarjha/v3/src/components/provider/provider-cards.tsx) drew a generic icon and ignored `authenticImageUrl` entirely.

[provider-image.tsx](file:///Users/abhishekkumarjha/v3/src/components/provider/provider-image.tsx) is now the single renderer: it shows a real photo when one exists and a neutral generated placeholder otherwise, publishing `data-photo-status` as `verified` / `loading` / `unavailable` so the state is machine-checkable, with descriptive `alt`, lazy loading, reserved dimensions, and screen-reader text stating that no verified photograph is available.

**To unblock:** set `authenticImageUrl` (and `imageAttribution`) on a record in `src/data/provider-directory.json`. No code change is needed. A photo may only be set when it appears on the entity's own site or verified profile, the name on that page matches the record, reuse is permitted, and the URL is stable (not a signed, expiring CDN link).

---

## 2. Sakha chatbot and image understanding

**Verdict: PASS for image understanding against the live account · PASS for the honesty contract · BLOCKED for session-level UI testing (no `DATABASE_URL`) · BLOCKED for image search (no provider key).**

### 2.1 The vision path is real, and it reads images

The route is [route.ts](file:///Users/abhishekkumarjha/v3/src/app/api/assistant/vision/route.ts), and the provider call is [bluesminds.ts](file:///Users/abhishekkumarjha/v3/src/lib/ai/providers/bluesminds.ts#L207-L261), which sends `model: this.visionModel` — verified in the source at that line range.

**Measured end to end against the live BluesMinds account (this session):** a generated 16×16 PNG, red on the left half and blue on the right, was submitted through `AiProvider.visionQuestion` — the same call the route makes — and the reply was:

> "The image features red on the left side and blue on the right side."

That is a correct reading of the actual pixels, so the image reached a model that can see. The deployment's text model, `openai/gpt-oss-20b`, is text-only and, asked about the same image, answers *"I'm sorry, but I can't view images."* It is therefore the `defaultModel` and never the `visionModel` ([capabilities.ts](file:///Users/abhishekkumarjha/v3/src/lib/ai/capabilities.ts#L103-L158) records that finding). **Nothing in the code falls back from the vision model to the text model** ([config.ts](file:///Users/abhishekkumarjha/v3/src/lib/ai/config.ts#L92-L97)).

### 2.2 The chatbot never claims to have seen an image it did not receive

This is the specific failure the brief calls out, and it is structurally prevented:

| Situation | Behaviour |
| --- | --- |
| No AI provider configured | `503` — *"Image understanding is unavailable. Configure the server-side AI provider and vision model."* No answer is invented. |
| Provider configured but not vision-capable | `503` — *"The configured AI provider cannot analyse images."* |
| Provider rate-limits | `429` with `Retry-After`, **checked before any image work** |
| Provider times out / errors | `504` / `502` with the provider's failure text; never a fabricated description |
| Image format unsupported | `415` |
| Bytes do not match the declared MIME type (magic-byte sniff) | `415` |
| Empty, oversized or undecodable image | `413` / `415` |
| Not signed in | `401` |

**8 contract tests** pin these transitions in `test/unit/assistant-vision-route.test.ts`: unknown user → 401; over-long question → 400; type mismatch → 415; happy path → 200; crafted `system` role in the history is dropped; `rate_limited` → 429; `supports("VISION_IMAGE") === false` → 503; rate limit consumed before any image work. All pass.

### 2.3 Medical report images are handled cautiously

The system prompt ([bluesminds.ts](file:///Users/abhishekkumarjha/v3/src/lib/ai/providers/bluesminds.ts#L214-L224)) instructs the model to describe only visible features, state uncertainty, not diagnose or prescribe, not claim an image proves or rules out a condition, escalate red-flag presentations immediately, and — for report images specifically — explain only clearly legible text and identify anything unreadable or ambiguous. No chain-of-thought or reasoning field is ever presented as the model's answer.

### 2.4 Image search is a separate feature, and it does not fake results

Image search is **not** image understanding. It is its own Brave-backed integration at [image-search/route.ts](file:///Users/abhishekkumarjha/v3/src/app/api/assistant/image-search/route.ts), requiring `IMAGE_SEARCH_PROVIDER=brave` plus `IMAGE_SEARCH_API_KEY`.

**Neither is present in `.env.local`, so image search is BLOCKED — and the app says exactly that** rather than returning invented results: the route answers `503` with *"Image search is not configured. The site operator must configure the server-side Brave image-search provider."*, and the Sakha UI states the same to the user. There is no code path that returns fabricated image results.

### 2.5 What remains BLOCKED in §2

The full UI journey — sign in, open `/assistant`, attach a file, watch it reach the route — cannot be exercised without `DATABASE_URL` and `AUTH_SECRET`, because `/api/assistant/vision` requires a session. What is proven is the provider call (live) and the route contract (tests). **The browser-to-route hop is unverified, and is reported as unverified rather than assumed.**

---

## 3. Google sign-in

**Verdict: PASS for the code integration · BLOCKED for the live OAuth round trip (no client credentials).**

**No second authentication system was introduced.** The existing custom, database-backed session system (`orvexa_session` cookie, HMAC-SHA256 token digests, bcrypt passwords) is untouched. Google is layered onto it as OAuth 2.0 **Authorization Code flow with PKCE (S256)**.

What exists and was inspected:

- [google.ts](file:///Users/abhishekkumarjha/v3/src/lib/auth/google.ts) — `googleOAuthConfig()` returns `null` unless **both** `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are set; the authorize URL requests `openid email profile` with `code_challenge_method=S256`, `access_type=online`, `prompt=select_account`; `exchangeGoogleCode()` rejects any profile whose `email_verified !== true`; no code, token or profile is ever logged.
- `GET /api/auth/google/start` and `GET /api/auth/google/callback`, with a 600-second `orvexa_oauth_state` cookie carrying the state and PKCE verifier.
- One responsive "Continue with Google" button on both `/login` and `/register`, alongside — not instead of — the email/password and phone OTP forms.

What was measured on the running server:

- `GET /api/auth/google/start` → `307` to `/login?oauth=unconfigured`.
- `/login` and `/register` each render exactly one Google control, disabled, naming the missing variables.

So the integration completes as far as it can without credentials, and the missing configuration is stated in the UI rather than implied by a button that does nothing.

### 3.1 The exact remaining configuration

In **Google Cloud Console → APIs & Services → Credentials → Create credentials → OAuth client ID → Web application**:

1. **Authorised JavaScript origins**
   - `http://localhost:3000`
   - `https://YOUR_PRODUCTION_ORIGIN`
2. **Authorised redirect URIs**
   - `http://localhost:3000/api/auth/google/callback`
   - `https://YOUR_PRODUCTION_ORIGIN/api/auth/google/callback`
3. **Add to `.env.local`:**
   ``` bash
   GOOGLE_CLIENT_ID="…apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="…"
   # Only if the browser origin differs from the server's public base URL:
   # GOOGLE_OAUTH_REDIRECT_URI="https://YOUR_PRODUCTION_ORIGIN/api/auth/google/callback"
   ```
4. Restart the server. The button enables itself; no code change is required.

The same procedure is documented in [README.md](file:///Users/abhishekkumarjha/v3/README.md) and [.env.example](file:///Users/abhishekkumarjha/v3/.env.example).

---

## 4. Full inventory of tools, features, APIs and pages, with per-item verdicts

### 4.1 What the repository contains

| Item | Count |
| --- | --- |
| Pages (`page.tsx`) | 38 |
| API route handlers (`route.ts`) | 166 |
| Layouts | 4 (+ root) |
| Components (`.tsx` under `src/components`) | 91 |
| Library modules (`.ts` under `src/lib`) | 141 |
| Prisma migrations | 8 (+ `migration_lock.toml`) |
| Duplicate SQL set under `supabase/migrations` | 8 |
| Test files / test cases | 10 / 161 |

### 4.2 The largest defect found, and how it was fixed

The application's own navigation advertised **114 destinations. 98 of them were 404s.** Measured by sweeping every href the source declares against the running server:

| Result | Before | After |
| --- | --- | --- |
| `200 OK` | 14 | — |
| `307` redirect | 1 | — |
| **`404 Not Found`** | **99** | **0** |

`git log --oneline --all -- 'src/app/hospital'` (and `lab`, `insurer`, `pharmacy`, `care`) returns **0 commits each**: these trees were never written, so there was nothing to restore. Meanwhile the API layer is complete — 166 handlers exist for exactly those queues — and `console-shell.tsx` plus `console-page.tsx` were built to host pages that never arrived. **The front end and the back end were built in parallel and the front end stopped early.**

Four roles were sent straight into a 404 on the sign-in redirect: `HOSPITAL_ADMIN` → `/hospital`, `PHARMACY_PARTNER` → `/pharmacy/portal`, `LAB_PARTNER` → `/lab`, `INSURANCE_PARTNER` → `/insurer`.

**The fix**, in [roles.ts](file:///Users/abhishekkumarjha/v3/src/lib/auth/roles.ts):

- `IMPLEMENTED_ROUTES` is a single list of the routes that have a page behind them, and `navigationForRoles()` filters every section through it. A section left with no reachable item is dropped, so a link is shown only when a page exists.
- `landingPathForRoles()` takes a role's console route **only when that route is implemented**; otherwise `ROLE_CONSOLE_HOME` falls back to `/dashboard`. `landingPathForUser()` does the same for a hospital membership.
- **Nothing was deleted.** Every route is still declared with its permission gate, so building a page and adding its route to the list restores the link *and* the sign-in landing in one edit.
- A regression test derives every route from `src/app` on disk and fails if any role's landing path or any advertised link has no page ([auth-roles.test.ts](file:///Users/abhishekkumarjha/v3/test/unit/auth-roles.test.ts)). Before it existed, this defect was invisible to the test suite.

**Verified after the fix**, against the running server: all **32** routes the navigation now admits resolve — 31 × `200`, 1 × `307` (`/dashboard` → `/dashboard/consultations`), **0 × 404**.

The navigation each role now receives (measured by executing `navigationForRoles`, not by reading it):

| Role | Lands on | Links | Destinations |
| --- | --- | --- | --- |
| PATIENT | `/dashboard` | 11 | dashboard, hospitals, diagnostics, telemedicine, consultations, pharmacy, assistant ×2, emergency ×3 |
| DOCTOR | `/provider` | 8 | self-service ×3, assistant ×2, emergency ×3 |
| HOSPITAL_ADMIN | `/dashboard` | 8 | (as DOCTOR) |
| PHARMACY_PARTNER | `/dashboard` | 8 | (as DOCTOR) |
| LAB_PARTNER | `/dashboard` | 8 | (as DOCTOR) |
| AMBULANCE_PARTNER | `/dashboard` | 9 | adds `/dashboard` |
| INSURANCE_PARTNER | `/dashboard` | 8 | (as DOCTOR) |
| PLATFORM_ADMIN | `/admin` | 8 | (as DOCTOR) |
| platform staff row (e.g. `SUPPORT_AGENT`) | `/admin` | — | + emergency operations when that staff role grants it |
| hospital member (e.g. `NURSE`) | `/dashboard` | — | membership still grants `hospital.*`; there is no hospital page to open |

One consequential wording fix: [admin/page.tsx](file:///Users/abhishekkumarjha/v3/src/app/admin/page.tsx) labelled every surviving section a "queue available". With the platform queues withdrawn it would have called the pharmacy store a queue, so the section is now "What this account can reach" and counts "destinations".

### 4.3 Area-by-area verdicts

| Area | Verdict | Evidence / blocker |
| --- | --- | --- |
| Public and marketing routes (`/`, `/about`, `/services`, `/hospitals`, `/pharmacy`, `/diagnostics`, `/telemedicine`, `/insurance`, `/assistant`, `/ai-assistant`, `/emergency`, `/help`, `/contact`, `/privacy`, `/terms`) | **PASS** | All return `200` on the running server. |
| Auth pages (`/login`, `/register`, `/forgot-password`, `/reset-password`, `/verify-email`, `/access-denied`) | **PASS** (render) | All return `200`; the Google control, email/password and OTP forms coexist. |
| Sign-in / registration / session flows | **BLOCKED** | `DATABASE_URL` and `AUTH_SECRET` are absent. No credential can be checked and no session cookie signed. **Not claimed as working.** |
| Email/password reset round trip | **BLOCKED** | Needs the database, and `EMAIL_TRANSPORT_IMPLEMENTED` is `false`, so no mail can be sent. The screens say so. |
| Google OAuth round trip | **BLOCKED** | Code complete (PASS above); no client ID/secret. Exact steps in §3.1. |
| Emergency / SOS (`/emergency`, `/emergency/incidents`, `/emergency/contacts`, `/emergency/nearby`, incident detail, share link) | **PASS** (pages + API shape); **BLOCKED** (raising an incident) | Pages return `200`. Raising an incident needs a session. **No ambulance-dispatch claim is made anywhere: dispatch is `not-configured` and the UI says so.** |
| Sakha text assistant (`/assistant`, `/assistant/history`) | **PASS** (pages + provider configured) | `AI_PROVIDER` and `BLUESMINDS_API_KEY` present; `ai: configured` in `/api/health`. |
| Sakha image understanding | **PASS** | §2.1–2.3. Live model reading verified; 8 contract tests pass. |
| Sakha image search | **BLOCKED** | No `IMAGE_SEARCH_PROVIDER` / `IMAGE_SEARCH_API_KEY`. Honest `503`, no fabricated results. |
| Maps / geocoding (`geoapify`) | **PASS** (configured) | `/api/health` reports `maps: configured`. Client-side key and server-side key both present. |
| Pharmacy store (`/pharmacy`) | **PASS** (catalogue renders) | **Sample catalogue data only**, labelled as such. |
| Pharmacy partner console (`/pharmacy/portal/*`) | **FAIL (not built)** | 6 routes declared, 0 pages exist. Withdrawn from navigation; reported, not hidden. |
| Laboratory console (`/lab/*`) | **FAIL (not built)** | 5 routes declared, 0 pages exist. |
| Insurer console (`/insurer/*`) | **FAIL (not built)** | 6 routes declared, 0 pages exist. |
| Hospital workspace (`/hospital/*`) | **FAIL (not built)** | 15 routes declared, 0 pages exist. |
| Patient dashboard (`/dashboard/*`) | **FAIL (mostly not built)** | Only `/dashboard/consultations` exists; 13 other `/dashboard/*` routes declared, none built. |
| Personal health workspace (`/care/*`, `/mental-wellness`, `/health-education`, `/care-services`) | **FAIL (not built)** | 16 routes declared, 0 pages exist. |
| Provider console (`/provider/*`) | **FAIL (partially built)** | `/provider` and `/provider/telemedicine` exist; 7 further routes do not. |
| Platform console (`/admin/*`) | **FAIL (partially built)** | `/admin`, `/admin/emergency`, `/admin/emergency/integrations`, `/admin/emergency/[id]` exist; 29 declared queue routes do not. |
| Partner onboarding (`/onboarding`) | **FAIL (not built)** | Route declared and permission-gated; no page. |
| Payments | **PASS (sandbox) / BLOCKED (Razorpay)** | `/api/health` reports `payments: sandbox`. Sandbox moves no money and stamps every row `isSandbox`. Razorpay is selected only when both key id and secret are present; **no real charge was made and no test performs one.** |
| Telemedicine video | **PASS (sandbox) / BLOCKED (Daily.co)** | `video: sandbox`. The sandbox provider creates no external room and never reports a call connected. |
| Hospital / laboratory / insurer / report-exchange integrations | **BLOCKED** | `/api/health` reports `insurer`, `lab`, `reportExchange` as `not-configured`. |
| Ambulance dispatch partner | **BLOCKED** | `emergencyDispatch: not-configured`. No dispatch is claimed. |
| Push notifications, scheduled reminders, email and SMS transports | **BLOCKED (not built)** | No transport exists and no cron route exists, so `CRON_SECRET` is currently unused. |
| Health check `/api/health` | **PASS (failure path only)** | Answers `503` `unavailable` with a coarse `database.failure` and no internal host name. The `200` branch has never met a real database. |
| `/robots.txt`, `/sitemap.xml` | **PASS** | Implemented this pass as [robots.ts](file:///Users/abhishekkumarjha/v3/src/app/robots.ts) (disallows the private/back-office areas, links the sitemap) and [sitemap.ts](file:///Users/abhishekkumarjha/v3/src/app/sitemap.ts) (15 public routes). Both return `200` on the running server. |
| Dead buttons, placeholder responses, duplicate handlers | **PASS (no fabrication found)** | Spot-checked across the assistant, pharmacy and admin surfaces. Every capability that lacks a provider returns a typed error naming the gap. The one operational defect found was the navigation itself (§4.2). A full click-through of authenticated surfaces remains BLOCKED. |
| Console navigation honesty | **PASS** | §4.2 — 0 of the admitted links 404; regression-tested. |

---

## 5. Bugs fixed and stability checks

**Verdict: PASS.**

### 5.1 Defects fixed in this pass

1. **98 dead navigation links; four roles dead-ended on sign-in.** Fixed in `roles.ts` (§4.2), with a regression test.
2. **Misleading labels on the console landing page.** [admin/page.tsx](file:///Users/abhishekkumarjha/v3/src/app/admin/page.tsx) called every section a "queue available"; reworded to match what is actually shown.
3. **Dead image plumbing.** `getHospitalImage` / `getDoctorImage` were unreachable and the provider cards ignored `authenticImageUrl`. Now wired through `provider-image.tsx`, with a machine-checkable photo status (PHOTO-AUDIT.md).
4. **Lint error `@typescript-eslint/no-require-imports`** at `test/unit/google-oauth.test.ts:120`. Fixed by hoisting `import { createHash } from "node:crypto"`. Back to the 0-error baseline.
5. **`peer react@">=18 <19"` resolution failure from `@react-three/fiber@8.18.0`** against React 19.3.0. `@react-three/*` and `three` were referenced **only** in `package.json`, never imported, so they were removed; `prisma` was moved to `devDependencies`. This is what made `npm install` succeed at all.
6. **`/api/health` under-reported AI availability.** It read only `OPENAI_API_KEY` / `AI_PROVIDER_API_KEY`, so a correctly configured BluesMinds deployment reported AI as unconfigured. Now uses `isAiConfigured()`.
7. **`/robots.txt` and `/sitemap.xml` were `404`.** Both are now implemented as metadata routes ([robots.ts](file:///Users/abhishekkumarjha/v3/src/app/robots.ts), [sitemap.ts](file:///Users/abhishekkumarjha/v3/src/app/sitemap.ts)); the sitemap lists the 15 public routes and the robots file disallows the private/back-office areas.
8. **No lockfile.** `package-lock.json` is generated, so `npm ci` and `npm audit` work and installs are reproducible.
9. **3 high-severity dependency advisories (`deepmerge-ts`, GHSA-ggr8-5vv4-36mx).** Resolved by an `overrides` pin to `^8.0.0`; verified the Prisma CLI still validates the schema. `npm audit` → 0 vulnerabilities.
10. **14 lint warnings.** Cleared without disabling any rule for a real problem — see §5.2 for the itemised list.

### 5.2 The green gate, run after every change

| Check | Command | Result |
| --- | --- | --- |
| Type safety | `npx tsc --noEmit` | **PASS** — exit 0 under `strict` |
| Lint | `npm run lint` | **PASS** — **0 errors, 0 warnings** (the 14 baseline warnings were cleared this pass) |
| Unit and contract tests | `npm test` | **PASS** — 10 files, **161 tests**, 0 failures (~310 ms) |
| Production build | `npm run build` | **PASS** — compiled successfully, **142** static pages generated |
| Dependency audit | `npm audit` | **PASS** — **0 vulnerabilities** (3 high advisories resolved; see §5.3) |

The 14 baseline warnings were cleared this pass: six `_`-prefixed unused route/predicate parameters (now matched by an `argsIgnorePattern` in [eslint.config.mjs](file:///Users/abhishekkumarjha/v3/eslint.config.mjs), the naming convention the code already used), an unused `LabResultItem` type import in `medical-analysis-panel.tsx`, an unused `stringList` schema in `validation/platform.ts`, a stale `eslint-disable` in `security/sanitize.ts`, an ignored `size` parameter in [images.ts](file:///Users/abhishekkumarjha/v3/src/lib/images.ts#L90) (removed, with its four call sites updated), and two `exhaustive-deps` advisories in `emergency/map-view.tsx` and `emergency/nearby-explorer.tsx` (fixed at the source: the marker map is captured before the cleanup closes over it, and the empty facility list is memoised so it is a stable reference). **No test was disabled, no feature removed and no error suppressed to reach this result.**

### 5.3 Security

| Item | Verdict | Evidence |
| --- | --- | --- |
| Security headers on every response | **PASS** | `SECURITY_HEADERS` applied to `/:path*` in [next.config.ts](file:///Users/abhishekkumarjha/v3/next.config.ts); verified present on `/` |
| Sensitive areas marked `no-store` + `X-Robots-Tag: noindex, nofollow` | **PASS** | Verified on `/api/health` and applied to `/admin`, `/dashboard`, `/assistant`, `/emergency`, `/consult`, `/hospital`, `/api` |
| No wildcard CORS | **PASS** | A request with `Origin: https://evil.example` receives **no** `Access-Control-Allow-*` header |
| No committed secrets | **PASS** | Scanned `src`, `prisma` and `scripts` for `sk-…`, `rzp_…`, `AKIA…` and PEM blocks — nothing found. `.env.local` is git-ignored. |
| Secrets never reach the client | **PASS** | All AI, maps and payment configuration lives in `server-only` modules; the provider interface is not importable from a Client Component. |
| Dependency advisories | **PASS (fixed)** | Was 3 high-severity advisories from a single issue: `deepmerge-ts < 8.0.0` stack exhaustion (**GHSA-ggr8-5vv4-36mx**) via `@prisma/config` → `prisma`. Fixed by pinning `deepmerge-ts` to `^8.0.0` with an npm `overrides` entry rather than `audit fix --force`, which would have jumped to the breaking `prisma@7`. Verified the pin does not break the tooling: `npx prisma validate` reports *"The schema at prisma/schema.prisma is valid"* on Prisma 6.19.3 with `deepmerge-ts@8.0.2`, and `npm audit` now reports **0 vulnerabilities**. A `package-lock.json` was generated — the repository had none, so installs were previously not reproducible and `npm audit` could not run at all. |
| Rate limiting | **PASS (code)** | `consumeRateLimit` guards AI turns, image search, chat and auth; the AI path is contract-tested to consume the limit before touching an image. Live limits are **BLOCKED** without the database the counters live in. |

---

## 6. Running the project on localhost

**Verdict: PASS.**

The server was actually started and confirmed to respond. `next start` reports:

```
▲ Next.js 16.4.2
- Local:    http://localhost:3000
- Network:  http://10.48.89.107:3000
✓ Ready in 83ms
```

| Item | Value |
| --- | --- |
| **Local URL** | **http://localhost:3000** |
| Network URL (same LAN) | http://10.48.89.107:3000 |
| Port | **3000** |
| Restart (production build, current) | `npm run build && npm start` |
| Restart (development) | `npm run dev` — `next dev -p 3000 -H 0.0.0.0` |
| Free the port | `lsof -ti:3000 \| xargs -r kill` |

Verified on this server: `/` → `200`; all 32 admitted navigation routes → 31 × `200` + 1 × `307`, **0 × 404**; `/api/health` → `503` with `{"status":"unavailable","database":{"status":"down","failure":"unreachable"},"integrations":{"maps":"configured","ai":"configured","payments":"sandbox","video":"sandbox","email":"not-configured",…}}`.

**The 503 is correct behaviour, not a fault:** no database is configured. It will report `200 ok` once `DATABASE_URL` is set and reachable.

**Note:** `localhost:3000` is confirmed reachable from this machine. Whether it is reachable from your browser depends on your network; the network URL above is the same service bound to all interfaces.

---

## 7. Consolidated blockers, and what each one needs

| # | Blocker | Unblocks | Owner |
| --- | --- | --- | --- |
| 1 | `DATABASE_URL` absent from `.env.local` | Sign-in, registration, sessions, all 166 Prisma-backed handlers, migrations, the 200 branch of `/api/health` | **You** — you chose to add this yourself |
| 2 | `AUTH_SECRET` absent | Signing the `orvexa_session` cookie; without it sign-in cannot complete. Generate with `openssl rand -base64 32` | **You** |
| 3 | No verified doctor/hospital photo source | 0 of 103 records can show a photo | **You / the hospitals** — supply a stable, attributable image URL per record |
| 4 | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` absent | The live Google OAuth round trip. Steps in §3.1 | **You** |
| 5 | No image-search provider | Sakha image search. Set `IMAGE_SEARCH_PROVIDER=brave` + `IMAGE_SEARCH_API_KEY` | **You** |
| 6 | 98 console workspace pages were never written | The pharmacy, laboratory, insurer, hospital, care, patient-dashboard and platform-queue UIs | **Build work**, in tiers |
| 7 | No email or SMS transport; no cron route | Verification and reset mail, reminders; `CRON_SECRET` is currently unused | **Build work** |
| 8 | No integration, E2E, accessibility, payment-failure, refund, upload-privacy or tenant-isolation tests | Confidence beyond the unit and contract suite | **Build work** — needs a disposable PostgreSQL instance and sandbox accounts |
| 9 | ~~No lockfile; `deepmerge-ts` advisories~~ — **RESOLVED THIS PASS** | `package-lock.json` generated; `deepmerge-ts` pinned to `^8.0.0`; `npm audit` → **0 vulnerabilities**; Prisma CLI verified still valid | — |
| 10 | No CI, no Docker/Vercel artefacts | Deployment automation | **Build work** — `/robots.txt` and `/sitemap.xml` were **added this pass** |
| 11 | `supabase/migrations` duplicates `prisma/migrations` | Risk of the two sets diverging; only one should be authoritative | **Decision needed** |

### What I recommend next, in order

1. **Add `DATABASE_URL` and `AUTH_SECRET`.** Almost everything blocked above unblocks with them: `npx prisma migrate deploy` (never `reset`), then re-verify `/api/health` returns `200`, then exercise sign-in, registration, OTP and the consent flow. Every BLOCKED item marked "needs a session" becomes testable at that moment.
2. **Add the Google credentials** and complete one real round trip; the code path is already written and tested.
3. **Build the console workspaces in tiers**, against the 166 API handlers that already exist: patient dashboard → hospital workspace → platform queues → partner consoles. Each page added to `IMPLEMENTED_ROUTES` restores its navigation link and its sign-in landing automatically.
4. **Add a lockfile** and resolve the `deepmerge-ts` advisories.

---

## Bottom line

**Verified working:** the production build, type checking, lint, 161 unit and contract tests, the live Sakha vision call, the Google integration code, the security headers and CORS posture, and a running local server with **zero broken navigation links**.

**Verified broken and fixed:** 98 dead navigation links, four roles dead-ending on sign-in, dead image plumbing, one lint error, an unresolvable dependency set, and an under-reporting health check.

**Verified absent, and reported as such rather than papered over:** a database connection, an auth secret, all verified provider photographs, Google credentials, an image-search provider, email/SMS/reminder transport, and the console workspace UI itself.

ORVEXA is **not** production-ready. It is a well-built backend (166 handlers, 8 migrations, real provider abstractions, a genuinely tested AI safety layer) whose front end stops after the public and emergency surfaces. The distance to production is now measured rather than assumed, and the single highest-value action is adding `DATABASE_URL` and `AUTH_SECRET` — after which the majority of the BLOCKED items in §7 can be tested for real.
