# ORVEXA — Doctor and Hospital Photo Audit

**Audit date:** 2026-10-25
**Dataset:** `src/data/provider-directory.json` (generated from the spreadsheets in `Downloads/`)
**Source workbooks inspected:**

| File | Sheets | Rows read |
| --- | --- | --- |
| `Patna_Doctors_Directory.xlsx` | `Doctors`, `Hospital contacts`, `Read me` | 82 doctors, 5 hospital contacts, 12 notes |
| `Patna_Hospitals_Doctors_Directory.xlsx` | `Hospitals`, `Doctors` | 20 hospitals, 51 doctors |
| `Patna_Hospitals_Doctors_Directory (1).xlsx` | `Hospitals`, `Doctors` | byte-identical duplicate of the above (deduplicated) |

`visioncount-report.csv` is unrelated session analytics and contains no directory data.

## Headline result

| Metric | Count |
| --- | --- |
| Total records processed | **103** (83 doctors + 20 hospitals) |
| Verified photos added | **0** |
| Existing photos retained | **0** |
| Records missing a photo (marked unavailable) | **103** |
| Broken photo links | **0** (there were no photo links to break) |
| Records needing manual verification | **103** |
| Photo URLs present in the source workbooks | **0** |

**Every record renders the neutral placeholder and reports `data-photo-status="unavailable"`.** No photograph was invented, substituted, or borrowed from an unrelated person.

## Why no photo was added

This is not an incomplete search. Three independent findings each rule out the available sources.

### 1. The workbooks contain no image URLs

The columns that look like photo columns hold *directory pages*, not image files. The workbook's own `Read me` sheet states it directly:

> the workbook includes links to official doctor directory pages where profile photos may appear. Individual image files are not embedded in this workbook.

Examples of what those columns actually contain:

- doctor rows → `https://www.tmhpatna.com/our-doctors/`
- hospital rows → `https://aiimspatna.edu.in/patient`, `https://igims.org/Datafiles/cms/LIST%20OF%20EMPLOYEE-2026.pdf`

Verified against the imported data: **0 of 103 records carry an `authenticImageUrl`**, and every one of the 20 hospitals and 83 doctors carries a `profileUrl` that is a listing or contact page — never a per-entity profile with an image.

### 2. The reachable official pages publish no attributable photographs

All distinct doctor-listing hosts were fetched and searched for image references (`img src`, `data-src`, `srcset`, CSS `background-image`):

| Host | Result |
| --- | --- |
| `modernhospitalpatna.com/doctors.html` | 35 doctors listed. **One** image URL present, repeated beside 6+ different doctors. It is a **different** URL only by session signature, and it is hosted on `p16-cc-image-search-sign-sg.ibyteimg.com` with a time-limited `x-expires` — an artefact of the fetch pipeline's own image search, **not the site's asset**. Attributing it would mean publishing one unknown person's face as six different doctors, and the URL expires. |
| `tmhpatna.com/our-doctors/` | 14 doctors listed, **no images found**. |
| `tmhpatna.com/doctor/28462` (official per-doctor profile) | **No portrait found** — name, qualifications, speciality, fee, languages, booking CTA only. |
| `cmhospitalpatna.com/doctors` | **No images found.** |
| `oxygenhospital.co.in/doctors/` | **No images found.** |
| `aarogyamhdna.com/our-doctors` | **No images found.** |
| `pmchpatna.in` | Bot interstitial; no content retrievable. |
| `mhcs.org.in` | Failed to load on repeat attempts. |
| `rubanhospital.com` | Parked Hostinger domain — not an operating hospital site. |

The only per-doctor profile page that exists in this set is TMH's, and it carries no photograph. There is therefore **no verified, correctly attributable doctor photo to use**.

### 3. The two "official search" links are not photo sources

Two hospital records — `Satyadev Multi Super Speciality Hospital` and `Sahyog Hospital` — carry a `https://www.google.com/search?q=…` URL as their `profileUrl` because no official site was located. A search-results page is not an attributable photo source, so no image was taken from it. These two are flagged for manual verification.

`robots.txt` on each host was checked and contains no image-copying or redistribution rule; the blocker is the absence of a usable image, not a permission denial.

## What was changed instead

The image plumbing existed but was never wired up, so no record could display a photo even if one had been found:

- `getHospitalImage` / `getDoctorImage` in [images.ts](file:///Users/abhishekkumarjha/v3/src/lib/images.ts) were **dead code** — referenced nowhere outside their own file.
- [provider-cards.tsx](file:///Users/abhishekkumarjha/v3/src/components/provider/provider-cards.tsx) drew a `Building2` icon for hospitals and a `UserRound` icon for doctors, ignoring `authenticImageUrl` entirely.

That path is now live and honest:

- [provider-image.tsx](file:///Users/abhishekkumarjha/v3/src/components/provider/provider-image.tsx) is the single component that renders a provider photo. It renders the record's photo when one exists, otherwise a neutral inline-SVG medical placeholder. It reports one of three states on `data-photo-status` — `verified` (loaded from a real URL), `loading`, `unavailable` — so the state is machine-checkable rather than implied.
- Every card now carries descriptive `alt` text (`"<name>, <locality>, <city>"`), lazy loading, explicit `width`/`height` to reserve space and avoid layout shift, and screen-reader-only text stating that no verified photograph is available.
- When a record does carry an image, the component also exposes its source attribution to screen readers.
- The placeholder is generated, not photographic: it cannot be mistaken for a real person or a real building.

Because 0 of 103 records carry a photo URL, all 103 currently render `data-photo-status="unavailable"`.

## To resolve manual verification

A verified photo can be added later without code changes — set `authenticImageUrl` (and `imageAttribution`) on the record in `src/data/provider-directory.json`. The component picks it up automatically. A photo should only be set when:

1. it appears on the entity's own official site or verified profile page,
2. the name on that page matches the record (guard against the `Dr. S. K. Jha` / `Dr. (Lt. Col.) S. K. Jha` and duplicate `Dr. Dhiraj Kumar` listings already flagged in the dataset),
3. the site's terms permit reuse, and
4. the URL is stable — not a signed, expiring CDN link.
