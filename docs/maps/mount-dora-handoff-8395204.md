# Mount Dora handoff to Farmyard Fighters and Nautilus Engine

The user requested this handoff on November 12, 2026. The receiving project's
architect owns its integration and release. This handoff does not change either
receiving checkout or supersede its current work.

## Fixed source

- Repository: https://github.com/Syntaxswine/farmyard-commando-realtime
- Reviewed and deployed commit: `8395204ce6b60aa20cc8936fc89fe4a40192920c`.
- Play: https://syntaxswine.github.io/farmyard-commando-realtime/game.html?activity=mount-dora
- Passing release: https://github.com/Syntaxswine/farmyard-commando-realtime/actions/runs/43364973122
- Project SHA-256: `1ddbb524831dbb5fee570f065f137f0f53b343645080dab598343580f8e8c34e`.
- Art revision: `4251a5b38f7be7e22da36cc17acad8b448188e7e3bfa65c3342faf5066a79351`.

The local package is `outputs/mount-dora-8395204-handoff.zip` in this checkout.
Its adjacent `.sha256` file identifies the archive. `SOURCE-MANIFEST.json`
inside the archive lists every source file's Git blob ID and SHA-256, together
with the source commit, map metrics and preservation requirements. `HANDOFF.md`
is a copy of this note. Source files keep their repository-relative paths.

The archive contains the complete `maps/mount-dora` tree, production Mount Dora
art, the town-specific runtime adapters, source notices, map-generation tools,
map tests, gameplay acceptance scripts and review documentation. It is a
content/adaptation handoff, not a standalone game build. Existing AFT and
Nautilus dependencies must come from the fixed source commit or the consumer's
explicitly reviewed equivalent. Read source Git objects; do not import an
active worker's files.

## Content and coordinate contract

- 6 columns by 7 rows: 42 sectors, each 240 by 240 metres; town extent 1,440 by
  1,680 metres. One tile is one metre. Source geography and authored geometry
  are both retained.
- 1,076 buildings; 6 m public carriageways and 2 m sidewalks; 19 raised piers;
  disused railway; 13 measured boathouse roofs.
- 17,171 trees, including 3,802 newly placed LiDAR canopy trees. Keep all
  **106 retained mature specimens**: 52 pines and 54 broadleaves. The retention
  plan is `maps/mount-dora/source/retained-mature-trees.json`. Match its current
  coordinates and variants exactly; do not apply its historical moves again.
- Mature models are in `mount-dora-pines.js` and `mount-dora-broadleaf.js`.
  Only their trunks are solid. Preserve walking under crowns, trunk sliding,
  brush concealment and foliage cutaway behavior when adapting them.
- 42 guards with existing mixed weapons and patrol records across the land
  sectors. The older walking-tour introduction predates this real-time
  population; use this release's project and production runtime as authority.
- Native files use `aft-map-v2`. The pinned workshop audit accepts 39 land
  sectors and explicitly refuses the 3 water-only sectors. Keep the water;
  do not invent starts or platforms to make a validator accept those sectors.
- Town/art coordinates increase east and south. Farmyard game coordinates are
  **town minus (0.5, 0.5)**. Native wall endpoints already contain that offset:
  add only the sector origin. Do not apply the half-metre conversion twice.
- The game renders a moving 3 by 3 window of 24 m blocks. Rendering residency
  must not change authoritative collision, patrols, resources or saved state.

## Preserve the depot

The former depot is `osm-way-557494933`. Preserve its reviewed placement,
footprint, solids, facade, eave overhangs, chimney, sash/trim layout,
`wallFinish: painted-white`, `roofFinish: stamped-tin` and nested `depot`
treatment. It remains aligned to Alexander Street with 4.6 m east-eave clearance
to the sidewalk. Its current town anchor is `[313.5, 677]`.

The depot placement's SHA-256, using UTF-8 JSON with sorted keys and compact
separators, is `d46f5b653e73255257ab99e990eb64ad6eb962b0c60c8dfad1b9cc70b8f73e93`.
The house-part export includes this treatment. Preserve its relative-only
depot fields through export/import rather than translating them as world points.

## Receiving-project work

**Farmyard Fighters:** compare the map, art and town adapters against this pin;
much of the pier/LiDAR work originated in Fighters and may already be present.
Bring across the retained mature-tree plan/models, depot treatment and any
remaining map fixes without replacing Fighters' application, rules, storage
namespace or unrelated content. Keep the map/art digest and sector hashes in
step. Regenerate hash-pinned route fixtures and workshop audits after any
intentional local map regeneration.

**Nautilus Engine:** intake the map as evidence-backed native sector content
with an explicit source pin, provenance and separate consumer adapters.
Preserve original upstream bytes, mature-tree metadata, authored art and the
depot treatment. A successful native import alone is not visual integration;
report or reject unsupported rendering/collision features explicitly. Keep the
engine's current pins and consumer releases under its architect's control.

Every placed door must use the consumer's production interaction, collision,
cost and persistence systems. This snapshot adds no unverified geographic
entrances. Preserve that evidence boundary.

## Acceptance and known limits

The source release passed 544 game tests, desktop/phone real-time gameplay,
the production walking tour and movement tests, all 39 land-sector native
imports, and workshop editing/history/export/reopen on C03, C05 and A01.
A01 needed an isolated rerun after a native-import wait timed out; that rerun
passed without changing the production test or extending its timeout. All
temporary test helpers were stopped. Public verification matched 57 files,
including all 42 sectors, to the released commit.

After adaptation, verify actual gameplay with equipment, ammunition, reloads,
grenades/flamethrowers, health/fire, interactions and save/resume enabled.
Check an unchanged mature-tree specimen, depot sidewalk clearance, the Rusty
Anchor covered pier (body height 0.4 m and overhead-roof fade), Palm Island's
boardwalk, sector travel, guard patrols and import/export metadata retention.
Use the consumer's normal required checks. Reuse existing evidence for bytes
that are unchanged; test the consumer's integration differences.

Map generation and source notices are in `maps/mount-dora/README.md`,
`maps/mount-dora/reference/lidar/README.md`, `maps/mount-dora/art/source` and
`docs/art/mount-dora`. The 13 boathouse roof shapes/heights come from December
2018 LiDAR; their supports are inferred and kept clear of pier decks. Some
roof classifications and geographic fits still need review; retain the
limitations recorded in `docs/maps/mount-dora/grid-shapes-followups.md`.
Unknown interiors remain unknown. This is a flat-terrain exterior
approximation with deliberate grid generalization, not a current survey.
