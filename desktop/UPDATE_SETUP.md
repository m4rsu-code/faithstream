# FaithStream Studio updates

The Windows app now checks a Squirrel.Windows update feed. The update button is beside the FaithStream Studio name in the title bar. It checks for updates, downloads available releases in the background, and offers **Restart to update** when the download is ready.

## Configure the release feed

1. Copy `.env.example` to `.env` in the `desktop` folder.
2. Set `FAITHSTREAM_UPDATE_FEED_URL` to the HTTPS folder that will host the Windows update files. Do not include `/RELEASES` at the end. For example: `https://downloads.example.com/faithstreamstudio/win32/x64`.
3. Build the installer with `npm run make` from `desktop`.
4. Publish the generated `RELEASES` file and the matching full `.nupkg` from `out/make/squirrel.windows/x64` together in that folder. Keep the prior package files available if the generated `RELEASES` references them.
5. Install the newly built installer once on existing computers. The updater cannot be used by copies installed before the updater was included.

For each release, increase `version` in `package.json`, rebuild, and publish the new Squirrel `RELEASES` and `.nupkg` files to the same feed. The installer (`Setup.exe`) is for first-time installs; installed copies receive future versions through the in-app button.

The feed URL is embedded at build time. `.env` is ignored by Git; configure the same value on whichever computer or build service creates the production installer. The updater currently targets packaged Windows builds. Development runs show the button but do not download updates.
