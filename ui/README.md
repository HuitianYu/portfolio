# Interface architecture

## Ownership

| Layer | Source of truth | Responsibility |
|---|---|---|
| Site/Lab shell | layouts/_default/baseof.html, labs-data.html, lab-app.html | Shared header/footer, existing page relationships, standalone delivery |
| Interaction | static/js/ui-controls.js | Disclosures, outside clicks, touch timing, roving keyboard focus |
| Workspace context | static/js/lab-interface.js | Tabs, toolbar layout, resize bridge, suspension; no scientific state |
| Task presentation | static/js/lab-runtime.js | Isolated task snapshots, source labels, progress, button fill, accessible state, synchronized lights |
| Media transport | static/js/lab-media.js | Playback intent, time, synchronized videos, seek, buffering and stale play requests |
| Data adapters | recording-sources.js, Curvature data-loader.js | Source policy and format-specific loading; no playback or calculations |
| Lab application | Each app.js | Connect model/adapter state to shared presentation and user commands |
| Scientific model | Each engine.js / schema.js / chart-schema.js | Numerical model, parameters, units and scientific chart definitions |

## Unified task contract

Use `LabUI.task({root, button, kind, state, value, message, detail, present})`.
The kinds are download, calculation and playback. They are independent snapshots:
`LabUI.taskState(owner, kind)`. A background update with `present: false` cannot
replace the current progress UI. `value: null` means an honest percentage is unavailable.

The visible caption contains exactly one Local/Cloud badge on the left. Fully local
calculations show Local. Status text and the right-aligned percent/step/frame detail
use the same component across all Labs. Task kind is internal, not another badge.
Idle controls are dark and actionable, running/paused controls show light-to-dark progress, completed tasks
are dark. Cancel/retry and pause/resume are model-specific commands, not aliases.

`LabMedia.create` owns one playback clock. Seeking preserves playing/paused intent;
synchronization does not fight in-flight seeking. A new Play request can load first
and start once playable. Case changes, cancellation and suspension revoke that request.
`LabMedia.availability` distinguishes playable media from continuously buffered full
recordings. `canplay` never proves a complete download. Buffering belongs to playback
and does not replace the seek slider with an initial download screen. Full buffering
is recorded independently; no fictional byte-download percentage is shown.

## Layout and style sources

Edit ui/styles/ only. manifest.json owns cascade order; generated site.css and
design-system.css are delivery artifacts. shell.css owns containers/library layout;
progress.css owns task/source presentation; states.css owns status lights. tokens.css
owns dimensions and theme roles. Source palette appears in one shared module.

Controls are 32px compact, 36px standard and 44px fields/CTA. Preserve scientific
values rather than truncating them for layout. The global footer stays in ordinary
document flow after main. The Lab frame and host use the same --site-header-size;
never add an independent larger iframe minimum height.

Controller off/reset makes all module lights inactive; pause stops breathing.
Active lights share a wall-clock phase with no recurring JS timer. Seed/Refresh
feedback uses the same smooth 2.2 second background round trip. Reduced-motion
turns animations off.

## Optional content

Checks discover actual Lab folders; only present Labs receive model-specific checks.
Remove the entire Lab folder to exclude it. Incomplete retained Labs still fail.
Paper/Lab associations use site.GetPage. Missing local Markdown content links become
plain text; missing related-paper links in generated workspaces are also guarded.
The update installer skips files belonging to already-removed Labs.

## Scientific boundaries and assets

Curvature engine.js owns pure geometry, smoothing, classification and weighting;
worker.js imports that engine. Do not serialize scientific functions into workers.
MPCrystal schema.js owns parameters, chart-schema.js owns chart definitions, and its
engine owns simulation history. Do not seek simulated steps using a media transport.
OrbitalFlatness reports actual solver progress. UI changes must not alter precision,
units, solver rules or data.

Large datasets/MP4 recordings dominate the source package. Abstraction reduces
coupling, not media bytes. Do not delete assets or reintroduce Base64 copies.
StableGSensor uses Cloud except Case 3. Reserved DOI: 10.5281/zenodo.23324825.
Public files must match recording-sources.js naming; never put credentials in config.

## Build and verification

Use Hugo extended 0.167.0 on PATH and run npm run build. It synchronizes generated
assets, checks formatting/shared copies, tests runtime and scientific models, then
builds the site. Test 320/390px portrait, low-height landscape and 1440px desktop;
include first Play, Display-only navigation, playing/paused seek, unavailable Cloud,
calc cancel, simulation pause/step, reset, footer flow and reduced-motion.
Tests also cover absent Labs/related articles. No Lab or post is removed from the
working copy as part of a cleanup.

Execution commands never switch the selected Lab section. A first media Play may load and then play, but keeps the current section; viewing Display is always an explicit navigation action.

Section navigation never starts media loading. StableGSensor loads recordings through Play or an explicit case/method selection; first Display remains ready without a transient Cancel state.

The shared Lab host observes natural body height and pins the Lab control row within the content boundary. The website owns the only page scroller and footer. No wheel/touch interception, nested viewport height, or scroll relay is allowed. Standalone Labs retain their independent document layout.

Site content has two levels: category overviews and detail pages. Both share baseof.html; detail pages add the context/return row. Lab controls and internal sections are local content navigation. Shared assets use Hugo resource fingerprints to invalidate preview/deployment caches. Search and Contact share one centered homepage code using the crystal silhouette and HYU; the footer remains text links only.

LabData owns bounded Local requests and explicit source fallback. Curvature reads bundled payloads as data without script execution; media retries bundled recordings before eligible Cloud fallback. Cancellation never starts fallback. Cache/UI source labels retain the actual source. Build checks validate all bundled crystal payloads, local case recordings and Lab script/style dependencies.
Homepage QR is generated from config.yaml and colour tokens during build, using vector HYU outlines; no QR library or font is downloaded by visitors.
