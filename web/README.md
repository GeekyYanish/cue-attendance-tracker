# CUE Attendance Web

Track your CUE attendance in a browser. The web app uses no extension, backend, or build step.

## Use the app

1. Select a semester or create a new one.
2. In CUE, open **Attendance → Course Overview** and select **Download Report**. In the tracker, open **Import from CUE**, choose the PDF, and click **Review import**. Check the semester and hours, then click **Save import**. You can also download the converted CSV or paste attendance text.
3. Set an overall target. Use **Edit** on each subject to set its target and the number of hours per class.
4. Record a class with **Attended** or **Missed**. Each subject’s bunk allowance respects both targets and assumes all missed classes are in that subject.

PDFs are read locally with Mozilla PDF.js (see [license](PDFJS-LICENSE.txt)). Use the original CUE report with selectable text. Re-importing replaces matching subject hours and keeps their targets and class lengths. Attendance is saved in the browser profile for the site’s address. Clearing site data removes its records.

## Run locally

From the repository root, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Host it

Upload the contents of this folder to an HTTPS static host, or set its publish directory to `web`. Keep every file in this folder together, including the PDF.js worker. Serve `.mjs` files with a JavaScript MIME type.

The [hosted version](https://cue-attendance-web.nativeturtle1.chatgpt.site) is private and requires the owner’s ChatGPT login.

## PostHog analytics

To enable analytics on the production tracker, set `publicToken` and `apiHost` in [analytics.mjs](analytics.mjs) to the public project token and API host from your [PostHog JavaScript setup](https://posthog.com/docs/libraries/js). For a different production site, also update `productionHost`. Leave either setting blank to disable analytics.

After deploying, check **Activity** in PostHog for `$pageview`. Save a sample import, change a target, and log a class to verify `attendance_imported`, `attendance_target_saved`, and `class_logged`. Successful feedback submissions send `feedback_submitted`.

Analytics runs on the configured production hostname. The tracker sends the import method and target scope as event details. Attendance records, target percentages, and report or feedback contents stay out of analytics. Session replay and automatic interaction capture are disabled.
