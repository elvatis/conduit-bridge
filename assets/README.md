# Demo recording

`demo.gif` is an English tour of chat, model effort, execution evidence, Git
history, repository analytics, local session insights, original-message links,
Help examples, the introduction, page search and resizable navigation. All displayed
content is illustrative. The recording never starts a provider, submits a
task or changes a repository.

The reproducible recording script is `assets/demo.mjs`. It captures the
current dashboard source with Playwright and encodes the frames using FFmpeg.
The browser fixtures are shared with the functional tests.

The insights scene uses the current evidence classifier on seven synthetic
messages. It asserts that a question and two test-echo messages are omitted,
that four supported statements keep their expected categories, and that the
numbered source link opens the matching original message. The displayed report
is illustrative; the recording makes no model inference requests.

```bash
npm ci --ignore-scripts
npx playwright install chromium
npm run demo:record
```

FFmpeg must be on `PATH`, or set `FFMPEG_BIN` to its executable path. To use an
installed Microsoft Edge on Windows:

```powershell
$env:CONDUIT_TEST_BROWSER = 'msedge'
npm run demo:record
```

The output is `assets/demo.gif` at 1200 x 800 pixels and 10 frames per second.
Source frames and the timed storyboard are saved under `.ai/logs/demo/` for
inspection. Inspect the GIF after changing the recording or dashboard, then
commit it through the normal PR process. The recording uses no screenshots
or media from another project.
