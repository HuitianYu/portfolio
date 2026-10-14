# Interface ownership

## Styles

Edit `ui/styles/`, never the generated `static/css/site.css` or `design-system.css`.
`manifest.json` lists modules in cascade order. `tokens.css` owns shared colours,
type, and dimensions. The photo theme overrides colour roles at runtime.

`npm run sync:shared` builds both browser stylesheets and copies shared assets
into each standalone Lab. Generated delivery remains two flat CSS files: no
additional imports, network requests, or offline dependency are introduced.
`npm run check:shared` rejects either stale generated CSS or stale Lab copies.

The source modules preserve the existing cascade. Some legacy overrides remain
inside them; move or remove a rule only after checking its desktop, narrow, and
embedded contexts. Do not append another global override to fix one local card.

## Runtime layers

- `static/js/ui-controls.js`: disclosure timing, outside/touch handling, and roving
  arrow-key focus for both static and rebuilt choice rows.
- `static/js/lab-runtime.js`: section/panel selection, plot font, playback presentation.
- `static/js/lab-interface.js`: workspace layout, keyboard navigation, menus,
  resize reporting, and page lifecycle. It owns no scientific state.
- Each Lab `app.js`: application state, rendering, and scientific orchestration.
- Each Lab engine/schema: model definitions and calculations. UI code must not
  silently change numerical precision, units, parameters, or solver behaviour.

`connectPanels` connects one sibling group at a time. Child selection survives
parent navigation. `selectSection` owns top-level sections. Both set panel
visibility and accessible relationships; keyboard handling lives in the interface.

`LabUI.playback` keeps label, pressed state, colour state and disabled state together.
It does not start timers or simulation: the application remains responsible for
start, pause, resume, reset and cancellation.

`LabCharts.config` owns local Plotly defaults and removes cloud-share controls.
Views retain their export format/size and additional modebar exclusions. Never
change chart units or data precision through presentation defaults.

## Layout and copy

- Workspace actions: compact 32px. Standard controls: 36px. Parameter fields/CTA:
  44px. Use token names; do not force every type of control to the same height.
- Keep related controls together. Wrapped utility groups align left; groups that
  fit share the right edge. Local tab rows may scroll; the document must not.
- Keep changing button labels in a reserved footprint. Give icon-only actions an
  accessible name. Use text or an icon, except restrained external/return marks.
- Short sentence-case labels explain a group; omit labels that merely repeat the
  heading. Keep model terms and units precise. Never truncate scientific values
  to make a card fit; allow the value region to adapt.

## Verification

Run `npm run format`, `npm run sync:shared`, `npm run format:check`,
`npm run check:shared`, `npm run check`, then a clean Hugo build.
Check 320px portrait, 844px landscape, and 1440px desktop; include nested tabs,
open menus, running/paused states, and independent Lab pages.
