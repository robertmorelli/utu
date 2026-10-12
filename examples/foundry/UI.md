# Foundry — UI specification

The three implementations (wutu, React, Leptos) build the same interface. Each
uses its framework's own idioms for state, components, and styling; what they
show and how they respond is the same.

## Frame loop

Every animation frame: run `speed` simulation ticks (0 when paused; 1, 2, or
4), redraw the map canvas, then update every visible panel and the HUD with
the new state. Nothing is throttled: all open panels refresh every frame. That
is deliberate: the game exists to measure live updates.

## Layout

```
┌──────────────────────────────── HUD ────────────────────────────────┐
│ day/time · power meter · research bar · 8 item counters · speed · menu │
├──────────┬───────────────────────────────────────────┬──────────────┤
│ palette  │                 map canvas                │  inspector   │
│ (tabs of │                                           │  (selected + │
│ machines)│                                           │  pinned      │
│          │                                           │  panels)     │
├──────────┴──────────────────────┬────────────────────┴──────────────┤
│ alerts feed                     │ minimap · hovered tile info         │
└─────────────────────────────────┴─────────────────────────────────────┘
```

**HUD**: time of day (hour:minute from `tick % 25200`, with a sun or moon);
power satisfaction meter with supply and demand; current research name and
progress (or "No research"); counts produced per minute for iron plate, copper
plate, steel, gears, circuits, plastic, red science, green science (from the
last 60 seconds of production samples); pause/1×/2×/4× buttons; buttons for
the Research, Production, Power, and Saves windows.

**Palette**: one tab per machine category (extraction, smelting, production,
logistics, storage, energy, science, circuits). Each machine button shows a
glyph and name, is disabled while locked, and shows speed/power in its
tooltip. Below: the rotation (N/E/S/W, `R` to rotate) and a remove tool (`X`).
`Escape` clears the tool.

**Map**: 24 px tiles; drag (or WASD/arrows) pans, the wheel zooms between 12 and
48 px. Tiles show water, resources (colored by ore), fog for unrevealed
chunks, and entities as squares in their category color with a two-letter
glyph and a direction tick. Belts draw their items as dots at their position.
Busy machines show a small activity bar; lit lamps glow. Hovering shows a
placement preview (green or red) for the current tool. Clicking with a tool
places or removes; clicking without one selects the entity under the cursor.

**Inspector**: the selected entity's panel, plus pinned panels (a pin button
on every panel header). Every panel header shows the glyph, name, id,
position, direction, and buttons to rotate, pin/unpin, and remove.

**Footer**: alerts (the last 8: "No power" when satisfaction < 500, "Research
complete: …", "<machine> output full" for crafters whose products are at their
limit, newest first, deduplicated per entity); a minimap (one pixel per tile,
redrawn every 30 frames); the hovered tile's coordinates, terrain, resource,
and entity.

## Machine panels

Every machine type has its own panel:

| machine | panel body |
| --- | --- |
| burner miner | fuel slot and burn bar, ore and amount under it, mining progress, output buffer |
| electric miner | 3×3 grid of the mining area (ore color, amount), power meter, progress, output buffer |
| offshore pump | flow rate (600/s while pumping), fill of the target pipe |
| pumpjack | yield %, oil field amount, crude buffer gauge, progress |
| stone furnace | flame indicator, fuel slot, input slot, output slot, current recipe, progress |
| steel furnace | stone furnace contents plus a temperature gauge |
| electric furnace | power draw, input and output slots, progress, crafts |
| assembler 1 | recipe grid (allowed recipes as buttons), ingredient have/need, output, progress ring |
| assembler 2 | recipe drop-down, ingredient table, crafts, effective speed with beacon bonus |
| assembler 3 | recipe search box and filtered list, beacon count, effective speed, progress |
| chemical plant | recipe drop-down, fluid gauges for fluid ingredients/products, solid slots |
| oil refinery | crude input gauge, petroleum output gauge, crafts, progress |
| centrifuge | spin progress, U-238 and U-235 counts, crafts until the next U-235 |
| belt | a lane strip with each item at its position, item list |
| fast belt | lane strip, compression (items × 64 / 256 as %) |
| express belt | lane strip, "blocked" when the front item waits at the end |
| splitter | priority radio (alternate/front/side), filter item select, next output |
| underground belt | role toggle (entrance/exit), linked exit distance or "no exit", lane strip |
| pipe | fluid name, amount bar of 100, connections to neighboring pipes |
| storage tank | tank fill graphic of 2500, fluid, percent |
| inserter | state (idle/carrying/returning), swing bar, hand item, moved count, source and target names |
| long inserter | inserter fields plus a 5-tile reach diagram |
| fast inserter | state, hand, moved count, average moves per minute (moved × 3600 / tick) |
| filter inserter | filter item picker (grid of items), state, moved |
| stack inserter | stack size slider (1–4), hand and count, moved |
| wooden chest | 16-slot grid, used slots |
| steel chest | 48-slot grid, used-slot bar, item totals sorted by count |
| requester chest | per-item table with stack fill bars |
| steam engine | fuel and burn, water buffer bar, running indicator, output |
| solar panel | sun arc showing light, current output |
| accumulator | charge bar of 5000, charging/discharging/idle |
| lab | research name, the three science pack counts, unit progress, research progress |
| radar | sweep progress, chunks revealed |
| beacon | crafters in range, bonus per crafter |
| decider combinator | item select, operator select, value input, source count, signal |
| lamp | a large lit/unlit lamp, the controlling combinator |
| rocket silo | parts progress (of 20), part progress, ingredient counts, Launch button, rockets launched |

Panel controls issue the commands in SPEC.md (`recipe`, `filter`, `priority`,
`stack`, `role`, `condition`, `launch`, `rotate`, `remove`).

## Windows

- **Research**: a card per technology (name, cost in packs × units, unlocks),
  grouped as done, available, and locked; clicking an available card starts
  it. The current card shows progress.
- **Production**: a row per item with produced-per-minute and a 60-sample
  sparkline (one sample per second). A 1 min / 10 min toggle switches between
  per-second and per-10-second samples.
- **Power**: supply and demand graphs (last 60 seconds), satisfaction, and a
  table of demand by machine type.
- **Saves**: save to and load from three local slots, export the save as JSON
  text, import JSON text, and start a new game (starter map or a factory
  scenario).

## Benchmark protocol

URL parameters, read at startup:

- `save=<url>`: load this save instead of the starter map.
- `panels=<n>`: pin panels for the first `n` entities of distinct machine types,
  in id order.
- `windows=a,b`: open these windows (`research`, `production`, `power`).
- `speed=<n>`: ticks per frame (default 1).
- `bench=<frames>`: run that many frames, then write JSON into
  `<pre id="bench-result">`: `{ "frames", "intervalAvg", "intervalP95",
  "workAvg", "workP95", "hash" }`. `interval` is the time between frames
  (everything, including style, layout, and paint); `work` is the frame
  callback's own time (simulation, canvas, and UI update). `hash` is the
  simulation's state hash, so a run can be checked against the reference.
