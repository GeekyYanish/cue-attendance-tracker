# CUE Attendance Web

Track your CUE attendance in a browser. The web app uses no extension, backend, or build step.

## Use the app

1. Select a semester or create a new one.
2. In CUE, open **Attendance → Course Overview** in grid view. Copy the subject cards, paste them into **Import from CUE**, and review the counts before saving. You can also add subjects manually or paste one line per subject as `Subject name, attended hours, total hours`.
3. Set an overall target. Use **Edit** on each subject to set its target and the number of hours per class.
4. Record a class with **Attended** or **Missed**. Each subject’s bunk allowance respects both targets and assumes all missed classes are in that subject.

Attendance is saved in the browser profile for the site’s address. Clearing that site’s browser data removes its records.

## Run locally

From the repository root, run:

```sh
python3 -m http.server 8765 --bind 127.0.0.1 --directory web
```

Open [http://127.0.0.1:8765/](http://127.0.0.1:8765/).

## Host it

Upload the contents of this folder to an HTTPS static host, or set its publish directory to `web`. Keep `index.html`, `style.css`, and the three `.mjs` files together. Serve `.mjs` files with a JavaScript MIME type.

The [hosted version](https://cue-attendance-web.nativeturtle1.chatgpt.site) is private and requires the owner’s ChatGPT login.
