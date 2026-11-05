# Gameplay authoring and playtests

- This repository is the complete real-time fork of Farmyard Commando. The
  `upstream` remote is read-only. Publish only to
  `Syntaxswine/farmyard-commando-realtime`; do not change or deploy the original
  turn-based repository. Preserve inherited content until the user requests cuts.
- The default game and editor's Farmyard playtest use the real-time scheduler.
  The explicit `rules=turn-based` proving-yard option exists for inherited
  regression comparisons. Real-time character, operation, town and tool storage
  must stay separate from the original game's browser storage.

- Previews, demos and test maps use the production game bootstrap, controls,
  renderer, simulation, equipment, ammunition, reload, grenade/flamethrower,
  health/fire, interaction and save systems. Do not silently disable gameplay
  for a test scene. A reduced mode requires an explicit user request.
- Every placed door is operational. Bind its visible leaf and hand interaction
  to the production open/close state, movement and sight/projectile collision,
  normal action costs, blocked-swing checks and save/resume. A decorative door
  mesh or an always-passable door gap does not satisfy this rule.
- Geographic maps follow evidence. Place doors/entrances and other real-world
  details only where source data or reviewed observations establish them.
  Preserve the source, coordinates, observation date and uncertainty. Unknown
  interiors and entrances remain unknown; do not invent them for testing.
- Verify placed objects through the actual game path, including import/editor
  playtest where applicable. Test fixtures may supply declared synthetic data,
  but must exercise the same production implementation as the shipped game.
