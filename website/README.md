# FaithStream Website

Public website for FaithStream desktop and mobile companion apps.

## Run locally

```powershell
npm install
npm run dev
```

## Project structure

- `src/components/` contains shared navigation, footer, icons, and product visuals.
- `src/Routes/` contains the Home, Downloads, Plans, and not-found pages.
- `src/main.tsx` maps browser paths to pages.
- `public/faithstream-logo.png` is the website brand mark.

## Add the introduction video

Place the finished walkthrough at `public/videos/faithstream-introduction.mp4`, then set `INTRO_VIDEO_SRC` in `src/components/VideoShowcase.tsx` to `/videos/faithstream-introduction.mp4`.

## Publish downloads and subscription details

The Downloads page currently links to the FaithStream GitHub Releases page. Attach signed/release-ready desktop and Android builds there before announcing downloads. Update the plan information in `src/Routes/Plans.tsx` when prices and included features are finalized.
