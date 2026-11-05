# Farmyard Commando Real Time

**[Play the real-time edition](https://syntaxswine.github.io/farmyard-commando-realtime/)**
· **[Turn-based original](https://syntaxswine.github.io/farmyard-commando/)**

The complete game was forked from `Syntaxswine/farmyard-commando` at
`9104d55a7638bf60efd6618265e07db1faea46da`. All 4,109 tracked files and the
upstream Git ancestry were retained: animals, equipment, art and animation,
three original operations, Mount Dora, editors, library, survey/house tools,
source data and provenance. This repository deploys independently; the original
turn-based game is unchanged. Nothing was removed for this first playable.

Start with **Quiet Shift**, an additional encounter in the existing Mill 04
warehouse and records office. Approach unseen, choose when to enable **Fire at
Will**, recover the shift orders and return to the arrival point. Killing the
guards is optional. All original operations remain in the selector.

- Fire at Will / Hold Fire: top right switch or Space. Hold for nearest,
  weakest or biggest-threat priority. Only detected targets with an actual
  clear projectile path can be chosen. Tap an opponent to pin and inspect it.
- Aim: switch above the joystick or Q. Hip / aimed / full persist between
  shots; more aim takes longer, including before the first shot.
- Empty guns reload automatically from finite carried ammunition. R or Options
  reloads early. Move while reloading; a weapon swap cancels without wasting
  reserve. Each weapon has its own firing and reload timing.
- Standing runs by default. Crouch and crawl are progressively slower. Sneak
  halves the current posture's speed. An opening hit on an unaware opponent
  while sneaking deals bonus damage.
- Weapons, grenades, flame/tank explosions, fire, injury, doors, loot, equipment,
  extraction and saves use the production systems. No turn or AP budget stops
  combat. Guards act continuously and search last-known positions.
- Options and other dialogs pause the encounter. Leaving or hiding the app
  pauses too. Each animal's kill-earned weapon and sneak skills carry to later
  operations. All saves and editor storage are separate from the original.

Full rules, timings, retained tools and limitations are in
[the real-time edition notes](docs/real-time-edition.md). The inherited README
is preserved in [the upstream notes](docs/turn-based-upstream.md);
[fork provenance](fork-provenance.json) records the exact source snapshot.

## Run and verify

Node.js 22+ runs the game. Browser acceptance uses the locked test dependencies
and Chromium (Node.js 24 in CI).

```sh
npm run check
npm run build
npm run serve
npm ci --ignore-scripts --prefix sites/tactical-animal/browser-tests
cd sites/tactical-animal/browser-tests
npx playwright install chromium
cd ../../..
node tools/test-realtime.mjs
```

The preview listens on `http://127.0.0.1:4495` and automatically retires after
30 minutes. Browser acceptance owns a separate temporary server and browser,
stops both in `finally`, enforces a ten-minute deadline, and records cleanup.

The Pages workflow checks, builds and runs native desktop/phone acceptance
before deploying `main`. Asset URLs are relative to this fork's Pages path.
The original Sites deployment identity was removed from this copy to prevent
accidental publication over the older preview.
