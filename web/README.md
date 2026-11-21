# CUE Attendance Web

A Next.js App Router application for tracking CUE attendance in a browser. React components provide the attendance dashboard and pending claims projection. Attendance and claims are stored locally in the browser.

## Use the app

1. Select a semester or create a new one.
2. In CUE, open **Attendance → Course Overview** and select **Download Report**. In the tracker, open **Import from CUE**, choose the PDF, and click **Review import**. Check the semester and hours, then click **Save import**. You can also download the converted CSV or paste attendance text.
3. Set an overall target. Use **Edit** on each subject to set its target and the number of hours per class.
4. Record a class with **Attended** or **Missed**. Each subject’s bunk allowance respects both targets and assumes all missed classes are in that subject.

PDFs are read locally with Mozilla PDF.js (see [license](public/PDFJS-LICENSE.txt)). Use the original CUE report with selectable text. Re-importing replaces matching subject hours and keeps their targets and class lengths. Attendance is saved in the browser profile for the site’s address. Clearing site data removes its records.

## Project co-curricular claims

Open **Claims projection** and select the semester whose attendance is already saved. Choose **Add pending claims**, enter whole-hour claims for each subject, and save. Enter only hours still awaiting credit in CUE. The co-curricular values in CUE’s Absent Details CSV are already included in its attendance totals.

The projection adds manually entered pending claim hours to attended hours while keeping total hours held the same. It shows projected percentages, remaining absences, recovery requirements, and bunk allowances using your saved targets and class lengths. These results assume all entered claims are approved.

Claims are stored locally per semester. **Edit pending claims** updates the saved hours. Use 0 to remove hours for a subject, or **Clear claims** to remove the projection. Previously imported CSV claims are excluded from projections. Successfully importing fresh attendance clears saved claims to prevent already credited hours from being counted twice. Enter any claims still awaiting credit afterwards.

## Run locally

Use Node.js 22 or newer. From the repository root, run:

```sh
cd web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Attendance is stored separately for each browser origin. Records from the live domain remain available when the new app is deployed on that same domain.

To check the production export locally:

```sh
npm run build
npm start
```

The build generates static files in `web/out`, including the `/` attendance page, `/claims/` projection page, PDF.js assets, and feedback form registration. The former `/#claims` link redirects to `/claims/` after loading.

## Host on Netlify

The repository's `netlify.toml` sets the base directory to `web`, the build command to `npm run build`, and the publish directory to `out`. Keep the existing domain to preserve users’ saved attendance. Netlify installs dependencies before building. For another static host, upload the contents of `web/out` and serve `.mjs` files as JavaScript.

Feedback uses Netlify Forms. Enable form detection for the project and keep the existing email notification for `tracker-feedback`. The build includes `public/__forms.html` so Netlify can detect the message and attachment fields. Submissions post to `/__forms.html`. Text, image, and file feedback are available on the live Netlify domains. Local previews show a link to the live tracker.

## PostHog analytics

Copy `web/.env.example` to `web/.env.local` and set `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` and `NEXT_PUBLIC_POSTHOG_HOST`. On Netlify, configure the same public environment variables before building. Next.js embeds `NEXT_PUBLIC_` values into the browser bundle, so use the public project token. Rebuild after changing them. The old root `.env` file is superseded by `web/.env.local`.

Analytics is optional. The tracker loads successfully when these variables are absent. PostHog is installed as an npm dependency. Pageviews are captured when navigating between Attendance and Claims projection. Existing attendance, class, semester, and feedback events are retained.

## Verify

From `web`, run `npm test` and `npm run build`. From the repository root, the tests also run with `node --test tests/*.test.mjs`.

The tests cover exact attendance calculations, import validation, pending claims, and compatibility with the original local-storage format, including failed writes. For browser verification, import a PDF, change targets, log attended and missed classes, switch semesters and views, enter pending claims, and reload. Check desktop and mobile layouts. Feedback delivery requires a Netlify deployment.
