# Locations v2 plan: playable, linked, engine-ready maps

Status: **in progress** — decisions D1–D6 accepted as recommended; phase 1 done (map `v: 2` with the v1 upgrade in `schema.ts`, `raster.ts`, `topology.ts`, `nav.ts`, analysis helpers `mapNav`, `mapGraph`, `entryPoint`, `keysOnMap`, `lockCheck`, `unreachableObjects`; tests in `tests/locationStructure.test.ts`). Phase 1 deviations: how each kind affects walking is a `nav` rule on its `KINDS` entry (effects painted in the order floor → water → cost → block → opening); where a type's rooms and links are is declared as `LocationTypeDef.topology`, its grid as `LocationTypeDef.nav` (cell 5 for dwellings, 8 dungeons, 10 otherwise); water is walkable at a high cost and tagged, so paths avoid it and `{ water: false }` forbids it; rooms are `walled` (a blocked ring half a cell wide) so neighbouring rooms connect only through doors; a new roll keeps `theme`, `params`, `masks`, `env`, `snapshots` and the hand-painted `navOverride` field. Phase 2 done (`zoning.ts`: Voronoi wards, `ZONE_RULES`, `zoneCounts`, `assignZones`; settlement layers `districts` and `alleys`; road `rank`; zone-aware houses and landmarks; share inputs `zoneMarket`, `zoneIndustry`, `zoneMilitary`, `zoneSacred`; tests in `tests/locationZoning.test.ts`). Phase 2 deviations: districts are `district` objects in their own layer (so reroll, lock, pin and stale work as for any layer) and the map-level `districts` field was dropped; the settled area is the convex hull of the wall (or of the oval a wall would follow), so a ward may poke slightly past a bulging wall; the trade routes are the existing edge → market square → edge roads ranked `main`, not shortest paths over the ward graph; alleys have their own layer and villages have none; a landmark goes to a district of its kind by its name (`LANDMARK_ZONES`); every special quarter gets at least one building of its kind, and villages draw a Chapel by default next to the Hall; districts are regenerate-only and a road's rank is not editable in the object panel yet (both belong to phase 7). Phase 3 done (`mission.ts` plans links, roles, locks and key rooms before drawing; `rooms.ts` room shapes rect/round/cross/L with `inRoom`, `roomOutline`, `roomAnchor`; inputs `branching`, `loops`, `deadEnds`, `keyLocks`; `key` object kind; padlocks on locked doors; tests in `tests/locationDungeon.test.ts`, 200 seeds solvable on the room graph and, every fourth seed, on the walkability grid). Phase 3 deviations: the plan is stored on the rooms (`props.node`, `links`, `region`, `keys`), so corridors, doors and contents can be rerolled alone and still follow it, and rooms without a plan (older maps, rooms added by hand) are still linked; secret rooms are picked first and hung off the tree as dead ends; the doors layer enforces the lock rule itself (any door from a shallower region into a room of region r carries lock r), so one lock may guard several doors; the contents layer places each key from the room graph as drawn (the planned room when it is reachable in time), which keeps every map solvable after rerolls and hand edits; corridors try eight right-angled shapes and fall back to a grid router that avoids rooms and corridors of other regions; rooms keep a band of rock to their neighbours; the "pillared hall" template is the existing large rectangular room with pillars; a door's lock is not editable in the object panel yet (phase 7). Phase 4 done (`noise.ts` seeded simplex and fractal noise; cave methods `cellular` (default), `noisy` and the earlier `carve`, all made one piece by `connect`; the floor stored as the `rock` field; a `chambers` layer of invisible `hollow` objects from a distance transform, linked where their floor meets; inputs `caveMethod`, `smoothing`; tests in `tests/locationCave.test.ts`). Phase 4 deviations: the chambers-and-tunnels carver stays as a third method; `LayerDef.generate` may return `{ objects, fields }`, and the cavern layer owns the `rock` field (0 floor, 1 rock), replaced whenever it is rerolled; cave rooms reach the room graph through `TopologySpec.planned` (rooms list their links in `props.links`, parsed by the shared `parseLinks`, which the dungeon uses too); caves get no locks and keys yet (that belongs with the content rules of phase 6); creatures prefer chambers away from the entrance; the cavern outline is still traced when it is generated, and redrawing it from a hand-edited rock field comes with the brushes in phase 7; an underground river may still cut across rock between open spots, as before (phase 6); test groups that generate many maps have explicit timeouts, because a busy machine can push them past the default. Builds on `LOCATIONS_MAP_PLAN.md` (implemented): the `Locations` section of `design.world`, the layered generator (`src/core/location/`), the parchment renderer and object-level editing all stay; this plan extends them. Read that plan's "Status" line first for what exists.

Goal: the generated map is a **blueprint**, not a picture. It carries zoning and road hierarchy (macro), graph topology with lock-and-key logic (micro), architectural rules (dwellings), gameplay metadata (navigation, spawns, loot, light), links between scales (world → city → tavern → cellar → dungeon), live parameter sliders, themes, and exports for Unity/Godot/Tiled and VTTs. Manual edits stay non-destructive.

## 0. Decisions to confirm (recommended default first)

| # | Question | Recommendation | Why |
|---|---|---|---|
| D1 | Target engine for export | **Generic JSON + Tiled `.tmj`** (Unity via SuperTiled2Unity, Godot via its Tiled importer), no native Unity asset | `docs/` names Unity; Tiled is the one format all three engines import, and no editor plugin has to be written. |
| D2 | "Undo/redo history tree" | **History panel (labelled linear steps) + per-map named snapshots that can branch** | The store's undo is a linear Immer patch stack (`MAX_HISTORY = 200`); a true global tree would change every editor. Snapshots give the "try another version" part locally. |
| D3 | World map generation | **New location type `World`** (same layers, renderer, editing) that generates biome regions from the World › Biomes entries and places a marker per location; the existing Atlas canvas stays and can import the generated regions on request | Reuses everything; no second map engine. |
| D4 | Floors (tavern → cellar) | **Each floor is its own location** with `parent` + `floor`; stairs/doors link them | Keeps one map = one plane; drill-in already needs location links. |
| D5 | Brushes need raster data | **Add raster fields** (RLE-encoded cell grids) to the map for cave rock, terrain and the nav grid overrides; vectors stay for everything else | Carving a cave wall or painting terrain is a cell operation; vectorising it on every stroke is slow and fragile. |
| D6 | VTT export | **Universal VTT (`.dd2vtt`)** first (Foundry via Universal Battlemap Importer, Roll20 via its importer scripts), native Foundry scene JSON second | One format covers both VTTs. |

## 1. Data model changes (map `v: 2`)

All additions are optional, so a v1 map upgrades by adding defaults in `schema.ts` (`parseMap` reads v1 and v2, writes v2). Module version stays 3 unless an entity field needs migration (none planned: new entity fields start empty). `FORMAT_VERSION` unchanged.

```ts
// src/core/location/types.ts (additions)
export type MapObject = {
  …existing
  rank?: 'main' | 'street' | 'alley'              // roads
  zone?: string                                   // district id the object belongs to
  attach?: { to: string; t: number; side?: number } // glued to another object (door on wall, bridge on road)
  link?: { locationId: string; anchor?: string }  // drill-in target (house → dwelling, door → cellar)
  lock?: string; key?: string                     // lock id on doors/chests, key id on key items
  secret?: true                                   // hidden from the player export
  light?: { radius: number; color?: string; intensity?: number }
  spawn?: { role: 'enemy' | 'npc' | 'merchant' | 'boss'; refId?: string; count?: number }
}

export type RasterField = { cell: number; cols: number; rows: number; rle: string } // 0/1 or small palette

export type LocationMap = {
  v: 2
  …existing
  theme?: string                                  // MapTheme id; default from type
  params?: Record<string, number>                 // slider values (density, irregularity, depth…)
  fields?: Record<string, RasterField>            // 'rock', 'terrain', 'navOverride'
  masks?: { id: string; poly: [number, number][]; label?: string }[]   // keep-out regions for reroll
  districts?: { id: string; kind: ZoneKind; poly: [number, number][] }[]
  env?: { sun?: number; time?: 'day' | 'dusk' | 'night' }
  snapshots?: { id: string; label: string; at: string; map: Omit<LocationMap, 'snapshots'> }[] // cap 10
}
export type ZoneKind = 'residential' | 'market' | 'industrial' | 'military' | 'sacred'
```

Entity fields added to `locations` (inputs): `parent` (ref location), `floor` (number), `theme`, zone shares (`zoneMarket`, `zoneIndustry`, `zoneMilitary`, `zoneSacred` as %), dungeon `loops`, `deadEnds`, `branching`, `keyLocks`, `depth`; cave `method` (Cellular automata / Simplex noise), `smoothing`; dwelling `privacy` (Low/Normal/Strict). Hidden in the right groups via the existing `groupFilter`.

Caps in Zod: raster ≤ 256×256 cells, snapshots ≤ 10, masks ≤ 50, links must point to existing location ids (dangling links kept but flagged).

## 2. Generation (sections 1 of the request)

### 2.1 Settlements: zoning and road hierarchy (`types/settlement.ts`)

- **New `districts` layer** between `walls` and `roads`. City: Voronoi wards (a small Fortune-free version: Lloyd-relaxed seeds, cells clipped to the wall polygon, implemented in `geometry.ts` as half-plane clipping, enough for ≤ 40 cells). Village: 2–4 soft zones around the crossroads.
- **Zone assignment by rules** (data table `ZONE_RULES`, scored per cell, highest wins until shares are met): market → touches the main road and near the centre/gates; military → touches the wall and a gate; sacred → highest/most central or quiet cell; industrial → downstream river bank or edge, away from sacred; residential → the rest. Inputs are shares; the result is drawn as faint tinted wards with a hatched border and a label.
- **Road hierarchy**: `rank` on roads. `main` = trade routes gate→market→gate (shortest paths over the ward graph), `street` = ward borders, `alley` = generated inside blocks (short dead-end-allowed lanes). Width, casing and colour per rank in glyphs; buildings face the highest-rank road they touch.
- Buildings read their zone: density, lot size, roof palette and special buildings (smithy/workshop in industrial, stalls in market, barracks in military, shrine in sacred).

### 2.2 Dungeons: graph topology and lock-and-key (`types/dungeon.ts`, new `topology.ts`)

- `topology.ts` (pure): `graphOf(map)` turns rooms into nodes and corridors/doors into edges (corridors store `props.from`/`props.to`); `metrics(graph)` → loops (cyclomatic number), dead ends, branching factor, depth from entrance; `reachable(graph, opened)`; `solvable(map)` simulates collecting keys from the entrance.
- Generation in two steps: **mission graph first, then layout**. Build a graph with target metrics (spanning tree grown from the entrance with a branching probability, then add `loops` extra edges between rooms at graph distance ≥ 3, prune or add leaves to hit `deadEnds`), then embed it: rooms placed by the existing grid placement, corridors routed per edge.
- **Lock-and-key**: pick up to `keyLocks` edges on the entrance→boss path; for each, place the key in a room reachable without crossing that lock or any later one (BFS with locked edges removed), preferring dead ends. Doors get `lock`, key items get the matching `key`. `solvable` is asserted in tests for 200 seeds and checked in hints after manual edits.
- **Modular rooms**: room shapes from a template list (rect, cross, round, L, pillared hall) chosen by role; snapped to a grid so corridors meet walls cleanly.

### 2.3 Caves: cellular automata / noise (`types/cave.ts`)

- `method = Cellular automata`: random fill by `openness`, 4–5 smoothing passes (B5678/S45678 rule), keep the largest region, tunnel the rest to it, then the same outline tracing. `method = Simplex noise`: a small seeded 2D simplex implementation in `noise.ts` (no dependency), threshold + domain warp. Both write the `rock` raster field, so brushes can edit it (2.6), and the outline is derived from the field.
- Chambers = distance-transform maxima; their graph feeds the same `topology.ts` metrics and lock logic (gates/rubble instead of doors).

### 2.4 Dwellings: functional floor plans (`types/dwelling.ts`, new `architecture.ts`)

- **Programme first**: from footprint and room count pick rooms with a zone each (`public`: hall, common room, kitchen; `private`: bedroom, study; `service`: pantry, storage, stair).
- **Rules as data** (`ROOM_RULES`): `entranceTo: ['hall', 'common']`, `noDoor: [['bedroom','kitchen'], ['bedroom','pantry']]`, `privateBehind: 'public'` (private rooms only reachable through public/hall), `kitchenNear: ['pantry','common']`, sizes per room.
- **Search**: assign the programme to the split rectangles with a small backtracking search scored by the rules (adjacency bonus, forbidden adjacency = no door, depth of private rooms in the access graph); doors only on allowed shared walls; fallback to the best scoring layout.
- `validatePlan(map)` returns rule violations; the Object panel lists them and a hint points at them after manual edits.

### 2.5 World map (type `World`, D3)

Layers: `land` (noise elevation + coast), `regions` (one Voronoi region set per biome, sized by biome level range and role, ordered along the biome unlock path so neighbours match the Atlas), `rivers` (downhill from highlands), `roads` (between settlement markers), `sites` (one marker per location, placed in its biome's region), `labels`. Markers carry `link`, so clicking opens that location's map (section 4).

### 2.6 Brushes and stamps (non-destructive editing, part of section 2 of the request)

- Brush tools in the stage toolbar: **carve / fill** (raster `rock` and `terrain` fields, round brush, size slider), **wall line** (draws a wall polyline in dwellings/dungeons, splits rooms where it crosses), **road / river redraw** (freehand stroke resampled into `ctrl` waypoints, replaces the selected curve), **stamps** (drop a room template, a building cluster, a pond).
- Each stroke is one undo step (`mutate` with a stroke key). Strokes pin what they touch; raster edits mark the layers that read the field stale.

### 2.7 Smart snapping and auto-healing (`heal.ts`)

- Snapping while dragging: grid, edges of neighbouring rooms/buildings, road axes (shown as guide lines).
- **Attachments** (`attach`) replace today's free-floating doors, windows, bridges and gates: their position is a parameter `t` along the host's outline or polyline. After every edit `heal(map, changedIds)` runs per type:
  - generic: re-project attached objects onto their host; drop them with a warning if the host is gone;
  - dungeon: re-route corridors whose `from`/`to` room moved, re-add the door where the new corridor meets the wall;
  - dwelling: when a room edge moves, the neighbour sharing that wall follows (shared-wall graph), so no gaps or overlaps appear;
  - settlement: buildings attached to a moved road shift with it if not pinned; bridges re-snap to road × river crossings.
- Heal is pure and deterministic, runs inside the same `mutate` as the edit (one undo step), and never moves pinned objects.

### 2.8 Masks

A mask is a polygon (drawn with the lasso tool or "Mask selection" on selected objects). Regeneration keeps everything inside a mask in every layer, and generators treat masks as obstacles. Masks are listed in the layer panel (show, rename, delete). Pinning stays for single objects.

## 3. Gameplay metadata layers (section 3 of the request)

- **Navigation** (`nav.ts`): `navGrid(map, cell)` rasterises walkability from geometry (floors, corridors, roads walkable; walls, rock, buildings blocked; doors passable unless locked; water/rubble cost) plus the `navOverride` field painted by hand. A* over the grid (`path(grid, a, b)`) is used for validation (every spawn reachable from the entrance, every key reachable before its lock) and shown as an overlay with optional test path. Derived, not stored; cached per map object identity.
- **Content layer** (`contents` generalised for all types): spawn points (`spawn` role + linked enemy/NPC/merchant entries), chests (with loot table ref), traps, secret doors (`secret`), keys. Rule checks: no key behind its own lock, boss in boss room, merchants on walkable market cells, traps not on the only path unless marked intended.
- **Lighting layer**: light sources (torches, braziers, windows, lamps) placed by generators by rule (torches at corridor junctions and doors, windows on exterior walls, lamps on main roads). `lightGrid` computes light per cell with simple shadow casting against walls; dark zones shown as an overlay and exported. Outdoor maps: `env.sun` direction draws building/tree shadows as offset polygons, `env.time` tints the theme.
- Overlay toggles in the Map view: Navigation, Light, Zones, Secrets.

## 4. Linked maps (section 4 of the request)

- Objects with `link` show a small door/zoom icon; double-click (or Enter) opens the linked location in the same view; a breadcrumb (`World › Oakham › The Prancing Pony › Cellar`) navigates back. "Create linked map" on a house, landmark or door creates the child location (type, `parent`, name from the label) and links it.
- **Entrance consistency**: the child generator receives `ctx.anchor` from the parent object: for a house, the facade facing its road and the door offset along it; for a cellar door, the stair position. Dwelling puts its entrance exactly there (footprint rotated to match); a dungeon under a cellar starts with a stairs-up entrance room. If the parent object moves or rotates, the child's affected layers become stale (stored `anchorStamp` hash compared on open), never silently regenerated.
- Gallery shows the hierarchy as a tree; hints flag broken links and children whose anchor changed.

## 5. UX (section 5 of the request)

- **Live sliders**: each type exposes `params` (`{ id, label, min, max, step, layers }` in `LocationTypeDef`): density, scale, irregularity, depth, loops, smoothing… Moving a slider regenerates only the listed layers into a **draft** (not stored) on `requestAnimationFrame`; releasing commits one undo step. Budget: < 30 ms for Medium maps; measured in a test with a generous bound; a Web Worker (`worker-src` would need `'self' blob:` in the CSP) only if measurements require it.
- **History panel**: `HistoryEntry` gets an optional `label` (passed through `mutate(fn, key, label)`), the panel lists the steps and can jump back N steps. **Snapshots** per map: save, restore (itself an undoable step), compare thumbnails; restoring an older snapshot and editing is the branch.
- **Themes**: `MapTheme` grows `glyphs?: Partial<typeof GLYPHS>` overrides and a frame style. Themes: Parchment (default), Stone dungeon, Dark swamp, Sci-fi deck (blueprint lines, bulkhead doors), Modern plan (clean architectural). Picker in the toolbar; per-location `theme` field; export uses the chosen theme.

## 6. Export (section 6 of the request) — `src/core/location/export/`

| File | Content |
|---|---|
| `json.ts` | `hoh-location/1`: size, cell size, layers with entities (id, kind, coords, rot, props, links, locks/keys, spawns, lights), districts, nav grid (RLE + legend), light grid, graph (nodes/edges). Documented JSON Schema in the plan appendix. |
| `tiled.ts` | Tiled `.tmj` + generated `.tsx` tileset (a small tileset PNG rendered from the theme): tile layers floor/wall/water from the nav raster, object layers for entities with custom properties. Imports into Unity (SuperTiled2Unity), Godot and Tiled. |
| `raster.ts` | PNG via `<canvas>` from the SVG string (CSP already allows `img-src data: blob:`), scale 1×–4×. |
| `visibility.ts` | `playerView(map)` strips `secret` objects, GM labels, spawns and traps; used by SVG/PNG "Player" exports. |
| `vtt.ts` | Universal VTT `.dd2vtt` (image + walls from blocking edges, doors as portals, lights, grid size); Foundry scene JSON as a second option. |

Map view: an Export menu (SVG/PNG × Player/GM, JSON, Tiled, VTT). Project ZIP export (`exportAssets`) gets the JSON per location next to the SVG.

## 7. Code layout and extension points

```
src/core/location/
  topology.ts  architecture.ts  nav.ts  light.ts  heal.ts  noise.ts  raster.ts(RLE)  zoning.ts
  export/      json.ts tiled.ts raster.ts vtt.ts visibility.ts
  types/       …existing + world.ts
  render/      themes/ (one file per theme), overlays.ts
src/ui/editors/location/
  Toolbar.tsx (tools, theme, export)  ParamSliders.tsx  HistoryPanel.tsx  Breadcrumb.tsx  brushes.ts (pointer → stroke)
```

New extension points: rules are data (`ZONE_RULES`, `ROOM_RULES`, light placement rules), `heal` hooks per `LocationTypeDef`, `params` per type, themes as files, exporters as a registry (`EXPORTERS: { id, label, run(map, location) → Blob }`). Domain stays pure; React only draws and dispatches.

## 8. Phases (each ends green on the narrow tests, `typecheck`, `lint`, and is usable alone)

| # | Phase | Main deliverables | Key tests |
|---|---|---|---|
| 1 | Model v2 + analysis core | `v:2` schema and v1 upgrade, `raster.ts` RLE, `topology.ts`, `nav.ts` + A* | v1 maps load unchanged; RLE round-trip; nav blocks walls; graph metrics on hand-made maps |
| 2 | Settlement zoning & road ranks | Voronoi wards, `ZONE_RULES`, `rank`, alley generation, zone-aware buildings, glyphs | shares respected ±1 ward; market touches a main road; every building reachable on the nav grid |
| 3 | Dungeon topology & lock-and-key | mission graph → layout, metrics inputs, keys/locks, room templates | metrics within tolerance for 200 seeds; `solvable` always true; keys never behind their lock |
| 4 | Cave CA / noise | `noise.ts`, CA pipeline, rock field, chamber graph | connected for 200 seeds; method switch deterministic |
| 5 | Dwelling rules | `architecture.ts`, `ROOM_RULES`, search, `validatePlan` | entrance opens to hall/common; no bedroom–kitchen door; private rooms behind public |
| 6 | Metadata layers | contents for all types, spawns with refs, lights + `light.ts`, sun shadows, overlays, secret flag | spawns reachable; light grid shadows behind walls |
| 7 | Non-destructive editing | `attach` + `heal.ts`, snapping guides, masks, brushes and stamps | moving a room re-routes corridors and keeps doors on walls; masked area survives reroll; one undo step per stroke |
| 8 | Linked maps & world | `link`, breadcrumb, create linked map, anchors + entrance consistency, `World` type | child door matches parent facade; stale after parent rotate; world markers inside their biome |
| 9 | UX | param sliders with draft preview, history labels/panel, snapshots, themes (5) | draft not stored until release; snapshot restore undoable; every theme renders every kind |
| 10 | Export | JSON, Tiled, PNG, player/GM, Universal VTT, Foundry | JSON validates against its schema; player export has no `secret`; `.tmj` opens (structure test) |
| 11 | Integration & verification | hints (unsolvable keys, broken links, rule violations, stale anchors), help, guide steps/examples, en+hu, workspace-map; browser pass with a large city and a 30-room dungeon | full suite, build, browser check light/dark |

Order rationale: phase 1 gives every later phase its validators; generation upgrades (2–5) are independent of each other and could run in parallel sessions; editing (7) comes after attachments exist in the generators; export last because it serialises everything before it.

## 9. Risks

| Risk | Mitigation |
|---|---|
| Scope (this is larger than v1) | Phases are independent and shippable; each type's upgrade can stop at "good enough"; rules are data, tuned later. |
| Generation too slow for live sliders | Per-layer drafts, rAF throttling, measured budget; worker only if needed (CSP change noted). |
| Heal surprises the user | Heal never touches pinned objects, runs in the same undo step, and reports what it moved in a toast. |
| Raster fields bloat files | RLE, ≤ 256² cells, only for caves/terrain/overrides. |
| Export formats drift from tools' specs | Structure tests against minimal reference files kept in `tests/fixtures/`; formats documented in the plan appendix. |
| Floor-plan search fails for odd inputs | Bounded backtracking with a best-score fallback plus listed violations instead of failure. |

## 10. Out of scope

3D/heightmap terrain export, native Unity `.asset`/prefab generation, multi-user editing, AI-generated art, true global undo tree (D2), Roll20 direct API upload.
