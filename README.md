# CUE Attendance Tracker

Track Christ University CUE attendance using the Next.js web application or the local browser extension.

## Web application

```sh
cd web
npm ci
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). See [web setup and deployment](web/README.md) for attendance import, pending claims, Netlify Forms, and PostHog configuration. The repository includes Netlify build settings for the Next.js static export.

Existing web attendance stays available on the same domain after migration.

## Install in Chrome or Brave

1. On GitHub, choose **Code → Download ZIP**, then unzip the download. If you cloned the repository, use the folder created by the clone.
2. Open `chrome://extensions` in Chrome or `brave://extensions` in Brave.
3. Turn on **Developer mode**, click **Load unpacked**, and select the extracted or cloned folder that contains `manifest.json`.
4. Open [CUE Attendance](https://cue.christuniversity.in/main/attendence) and sign in.
5. Choose your semester and open **Course Overview**. Once CUE finishes loading, open **CUE Attendance Tracker** from the browser’s Extensions menu and click **Refresh from CUE**.

## Use the tracker

- Enter an overall target and save it. Set each subject’s target and how many portal hours one class counts for. A blank target clears it. The default is one hour per class.
- **Attend** gives the minimum consecutive attended time needed to reach the corresponding target. **Can bunk** gives the consecutive misses a subject can absorb while satisfying both targets. The overall card reports hours. Subject allowances are independent scenarios and cannot be added together.
- Refresh after attendance changes. The semester selector in the popup shows previously imported terms. To refresh a different term, select it on the CUE page first.
- Imports and settings are stored in the current browser profile. The extension reads the visible CUE page on demand and makes no requests to an external service.

## Verify

Run `node --test tests/*.test.mjs` from this folder.

For a browser check, import two terms from CUE, set different targets for each, and switch between them in the popup. Close and restart the browser to check that the imports and settings persist. On a different tab, click **Refresh from CUE** and check that the error leaves the previously saved counts visible.
