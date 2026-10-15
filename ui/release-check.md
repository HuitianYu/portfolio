# Pre-release check — 2026-10-15

All four Labs are retained. No scientific models or parameters changed in this pass.

## Layout fixes

- MPCrystal playback and export/reset share a vertical centre after wrapping.
- Lab fold switches sit centrally beside the section row.
- Scrolling section tabs have a separate viewport ending 8px before the fold
  switch; tab clicks cannot slide beneath that fixed control.
- Shared toolbar actions remain 32px, section tabs 36px, parameter fields 44px.
  Site navigation is 46px. These sizes express different control roles.

## Validation

- In-app browser: all four standalone Labs at 390px and 1440px; 320px Parameters
  (where present) and Display; 844x390 landscape headers. No document horizontal
  overflow observed. Inspected screenshots for alignment and spacing.
- MPCrystal playback/export measured at identical y and 32px height after repair.
- Final narrow and landscape nav bounds end 8px before the fold switch.
- Newly loaded site header uses the 22px SVG menu in a 46px control. Existing open
  pages require reload to obtain changed HTML/styles. Content-versioned asset
  URLs are already present; no forced experiment-discarding reload was added.
- `npm run build`: formatting, shared asset consistency, 38 script syntax checks,
  scientific model/worker/camera/presentation checks, and clean Hugo build passed.
- Generated HTML audit: 24 pages, zero missing local targets or duplicate IDs.

This is an in-app Chromium preview check, not an iOS Safari or Firefox device test.

## Size and next cleanup

Lab MP4s occupy approximately 258.6 MiB; JavaScript files 152.7 MiB, principally
crystal demo-data payloads; GIFs 28.4 MiB. These are source resources, not a claim
that the homepage downloads all of them. Large application refactors will not
remove those data bytes. The next separate cleanup should consolidate legacy
per-Lab toolbar CSS into shared modules, one Lab at a time with visual comparisons.
See `ui/README.md` for ownership and release instructions. No resources were deleted.


## Structural release review — 2026-10-15

- Four Labs now share the content shell, tab-panel contract and footer renderer. OrbitalFlatness parameter/design/results wrappers are independent panels.
- Paper lists and detail pages use one author component, with explicit role and equal-contribution notes.
- StableGSensor Library uses the existing case catalogue; all files remain local and remote activation is deferred until publication and verification.
- Regression checks cover panel switching, wrapper/form separation, footer markers and recording source policy.
- No Lab, scientific model, or local media asset was removed.

## Global shell and cloud update

Lab routes now show the global site-footer from baseof.html, with their embedded guide footers hidden. Conference entries explicitly label Presenter (2022 onward) or Research contributor / Not the presenter. StableGSensor enables cloud sources except Case 3, retains local media files, and shows an accessible unavailable message and Retry on failure. A real unpublished Case 1 request was tested and reached the unavailable state. No scientific calculations changed.

## Final shared-progress cleanup

Progress styles own task state only; shell owns library layout; states owns the single breathing-light keyframe. Active lights alternate their normal colour with white. Removed superseded source and loading-button declarations. Added regression checks for shared progress clamping, paused steps and accessible value text. Seed/Refresh background feedback remains a smooth 2.2 second round trip.
