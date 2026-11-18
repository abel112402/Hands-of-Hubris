# Locations & procedural maps plan (World & Biomes)

Status: **implemented** (foundation, parchment renderer, generators for all five types, Gallery and Map views with per-layer regenerate, show/hide and lock, SVG export, object-level editing: select, move, resize, rotate, bend curves by waypoint, add, duplicate, delete, pin, plus hints, help, guide steps, examples and concept card). Not done: a biome dossier link to its locations, and hints about map content (e.g. a boss without a boss room). Deviations from the plan below: Village and City share one engine (`types/settlement.ts`, differing only in a `Plan`), with helpers common to all types in `types/shared.ts`; `LocationTypeDef.layers` is the drawing order and `generationOrder()` derives the generation order from `dependsOn`, so corridors and entrance tunnels are drawn under what they were routed between; the City uses a ring street with radial lanes instead of Voronoi wards; the Cave carves chambers and tunnels on a grid (connected by construction) and traces the outline from edge midpoints instead of marching squares, and the cavern outline itself is regenerate-only; curves store their waypoints in `MapObject.ctrl` next to the sampled `points`; what the editor may do with each kind lives in `objects.ts` (`KINDS`), and `LayerDef.addable` lists the kinds a layer accepts by hand; bridges and gates do not follow a road that is moved (regenerate or move them); the module version stays 3 because no stored data changes shape; the Map view keeps the standard inspector for the inputs instead of a drawer; the SVG tree lives in `render/node.ts` (not `prims.ts`). Adds a `Locations` tab to `design.world` where cities, villages, dungeons, caves and dwellings are described with input fields and get a procedurally generated, layered, hand-editable top-down map drawn as an inked parchment card.

## Decisions (confirmed with the user)

| Question | Decision |
|---|---|
| Tabs | **One `Locations` section** (collection) with a `type` field; the type decides which input groups and which generator apply. |
| Look | **Code-drawn SVG parchment map**: parchment ground, ink outlines, hand-drawn roofs/walls/trees, ornate card frame with title banner. No image assets (fits the CSP, exports as SVG). |
| Manual editing | **Object level**: select, move, resize, rotate, delete, add, pin; road/wall points draggable. Free-hand brushes are out of scope (possible phase 2). |
| Dwelling | **Floor plan of one building** (rooms, doors, furniture). |

Assumptions I made (change if wrong): one floor per dungeon/dwelling in v1; maps export as SVG files next to `world_biomes.md` (same mechanism as UI wireframes); the generator is a planning sketch, not game-ready level data.

## 1. Precedent to copy

The **UI wireframe** feature is the same shape of problem: a collection whose entities carry a drawable layout, a dedicated full-width view, a pure SVG renderer and zip export.

| Need | Existing pattern |
|---|---|
| Per-entity drawing stored on the entity | `screen.layout` read through `layoutOf()` in `src/core/ui.ts` |
| Full-width view without the default inspector | `view.kind !== 'wireframe'` checks in `src/ui/editors/CollectionEditor.tsx` |
| View split into stage and panels | `src/ui/editors/wireframe/` (`WireframeView`, `Artboard`, `Panels`) |
| Pure SVG string for thumbnails and export | `layoutSvg()` in `src/core/ui.ts`, `exportAssets()` in `src/core/export/markdown.ts` |
| Type-dependent field groups | `groupFilter: { field: 'type', static: … }` (see merchants in `src/modules/design.ts`) |
| Seeded randomness | LCG in `simulateLoot` (`src/core/items.ts`), `hashString` (`src/core/flavor/pick.ts`) |
| Drag with coalesced undo steps | `update(fn, 'cv-<id>')` in `src/ui/editors/CanvasEditor.tsx` |

## 2. Data model

New section in `design.world`, placed after `outposts`; module `version: 4`. Existing section ids and field keys stay untouched.

```ts
// src/core/location/types.ts
export type LocationTypeId = 'City' | 'Village' | 'Dungeon' | 'Cave' | 'Dwelling'

export type MapObject = {
  id: string
  kind: string                    // glyph id: 'house', 'wall', 'road', 'room', 'door', 'tree', 'label', …
  x: number; y: number            // anchor, map units, rounded to integers
  w?: number; h?: number; rot?: number
  points?: [number, number][]     // polylines and polygons (roads, walls, cave outline, rivers)
  label?: string
  refId?: string                  // entry this object stands for (building, enemy, boss, quest)
  props?: Record<string, string | number | boolean>   // glyph variants: roof colour, storeys, room role
  pinned?: true                   // survives regeneration of its layer
}

export type MapLayer = { nonce: number; hidden?: true; locked?: true; stale?: true; objects: MapObject[] }

export type LocationMap = {
  v: 1
  seed: number
  w: number; h: number            // logical size; rendering scales to fit
  layers: Record<string, MapLayer>   // keyed by LayerDef.id; order comes from the type definition
}
```

- Stored as `location.map` on the entity, written only through `useStore.mutate`.
- A layer's random stream is `rng(hash(map.seed, layerId, layer.nonce))`. Regenerating one layer bumps only its `nonce`; "New map" changes `seed` and resets nonces.
- Generators never call `Math.random` or `Date`, so the same inputs and seed always give the same map (tests rely on this).
- Imported data is untrusted: `mapOf(entity)` parses with a Zod schema (`src/core/location/schema.ts`), drops malformed objects, clamps coordinates and caps object count (about 2 000 per map). The renderer escapes all text.
- Geometry is stored as vectors (cave outlines as polygons, not grids) to keep the project file small.

### Input fields (the "data as input" side)

`groupFilter` on `type` shows only the groups that apply.

| Group | Applies to | Fields |
|---|---|---|
| Identity | all | `type`, `biome` (ref biomes), `size` (Small/Medium/Large), `faction` (ref), `quests` (multiref story quests), `description` |
| Settlement | City, Village | `population`, `walls` (None/Palisade/Stone), `gates`, `water` (None/River/Coast), `density`, `landmarks` (multiref town buildings), `districts` (list) |
| Dungeon | Dungeon | `rooms`, `layoutStyle` (Rooms and corridors/Labyrinth), `secretRooms`, `traps`, `enemies` (multiref), `boss` (ref), `loot` (multiref items) |
| Cave | Cave | `chambers`, `openness`, `water` (None/Pools/Underground river), `entrances`, `enemies`, `resources` (multiref catalog) |
| Dwelling | Dwelling | `footprint` (Hut/House/Manor/Tower), `rooms`, `owner` (ref NPC archetype), `furnishing` (Sparse/Lived-in/Rich) |

Refs feed the map: each landmark becomes a labelled special building, the boss gets a boss room, enemies and loot are distributed over rooms, a quest gets a marker. Biome picks the ground palette and vegetation.

## 3. Architecture

Everything domain-related is pure TypeScript under `src/core/location/`; React only draws and dispatches edits. Two registries are the extension points.

```
src/core/location/
  types.ts        data types above
  schema.ts       Zod parsing and sanitising, mapOf()
  rng.ts          seeded PRNG (mulberry32), hash, pick/range/shuffle helpers
  geometry.ts     rect/polygon helpers, jitter, offset, point-in-polygon, marching squares, simple Voronoi/BSP
  registry.ts     LOCATION_TYPES, getLocationType(), layer order and dependencies
  generate.ts     generateMap(), regenerateLayer(), regenerateFrom()
  edit.ts         moveObject, resizeObject, rotateObject, movePoint, addObject, removeObjects, togglePin, setLayerFlag
  analysis.ts     counts and checks used by hints, export and the gallery
  types/          city.ts, village.ts, dungeon.ts, cave.ts, dwelling.ts  (one LocationTypeDef each)
  render/
    theme.ts      MapTheme (palette, stroke widths, fonts); 'parchment' is the first theme
    prims.ts      Prim = path | circle | text | group, plus toSvgString()
    glyphs.ts     GLYPHS: kind → (obj, theme, rand) => Prim[]
    frame.ts      card frame, title banner, compass, scale bar, parchment texture
    svg.ts        locationPrims(location, map) and locationSvg() (string, for export and thumbnails)
```

```ts
export type GenContext = {
  project: Project
  location: Entity                        // the input fields
  map: LocationMap                        // upstream layers, including manual edits
  rand: Rng                               // this layer's stream
  size: { w: number; h: number }
}
export type LayerDef = {
  id: string; label: string
  dependsOn: string[]                     // layers whose objects this one reads
  generate: (ctx: GenContext) => MapObject[]
  addable?: string[]                      // glyph kinds the user may add by hand to this layer
}
export type LocationTypeDef = {
  id: LocationTypeId; label: string
  size: (location: Entity) => { w: number; h: number }
  layers: LayerDef[]                      // bottom to top
}
```

**Adding a location type** = one file in `types/` plus one line in `registry.ts` and an enum option. **Adding a drawable thing** = one entry in `GLYPHS`. **Adding a visual style** = one `MapTheme`.

Glyphs return **primitives, not markup**. The editor maps primitives to React SVG elements and the exporter serialises the same primitives to a string, so screen and export cannot drift and no `dangerouslySetInnerHTML` is needed.

### Layers and partial regeneration

| Type | Layers, bottom to top |
|---|---|
| City | ground → water → walls and gates → streets → blocks and buildings → landmarks → vegetation and props → labels |
| Village | ground → water → roads → fields → buildings → landmarks → vegetation and props → labels |
| Dungeon | rock → rooms → corridors → doors → features (traps, stairs, secret rooms) → contents (enemies, boss, loot) → labels |
| Cave | rock → cavern outline → water → entrances → features (stalagmites, ore) → contents → labels |
| Dwelling | plot → walls and rooms → doors and windows → furniture → labels |

Rules for regeneration:
1. `generateMap` runs the layers in order; each reads upstream objects from `ctx.map`, so manual edits upstream are respected.
2. `regenerateLayer(id)` bumps the nonce, replaces the layer's **unpinned** objects and keeps pinned ones. New objects avoid pinned footprints.
3. A manual edit pins the object automatically (unpin from the inspector). A `locked` layer is skipped by both editing and regeneration.
4. After a layer changes, layers that depend on it are marked `stale`. The panel shows a badge and offers "Regenerate dependent layers"; nothing downstream is overwritten silently.
5. Each generate or regenerate is one undo step.

### Generators (algorithms)

| Type | Approach |
|---|---|
| Village | Road spine (1–3 jittered polylines through a centre), houses placed along roads facing them, well/green at the centre, fields as striped polygons outside, optional palisade as offset hull. |
| City | Irregular wall polygon from a noisy ellipse, gates on it, main streets from gates to a plaza, wards by Voronoi cells clipped to the wall, blocks subdivided into building lots, landmarks in the largest lots, river or coast cut first. |
| Dungeon | BSP split of a grid into rooms, corridors along the BSP tree plus a few loops, doors where corridors meet rooms, roles assigned by graph distance from the entrance (boss farthest, treasure in dead ends), labyrinth variant by maze carving. |
| Cave | Cellular automata on a coarse grid, flood fill to keep the largest region and tunnel to stragglers, outline traced with marching squares and smoothed, chambers found by distance transform. |
| Dwelling | Footprint rectangle (or L-shape/round for Manor/Tower) recursively split into rooms, room functions by size and adjacency, doors on shared walls plus one entrance, furniture from a per-function list. |

### Visual style ("medieval card")

- Parchment ground: warm gradient plus an SVG `feTurbulence` grain filter and darkened edges.
- Ink lines: every outline goes through a seeded jitter so it looks hand-drawn; hatching for shadows, rock and water edges.
- Flat watercolour fills from a small palette (roofs in 3–4 tones, fields, water, forest), biome-tinted.
- Card frame: double border with corner ornaments, a title banner with the location name, type and biome in the footer, compass rose and scale bar.
- Colours are fixed in `MapTheme` (like the wireframe export), because a map must look the same in light and dark mode and in the exported file. Editor chrome around it (panels, handles, selection) uses the CSS variables as usual.

## 4. UI

```
src/ui/editors/location/
  LocationMapView.tsx   view shell: location picker, toolbar, stage, side panels
  MapStage.tsx          SVG stage: pan/zoom, selection, drag/resize/rotate handles, point handles
  LayerPanel.tsx        layer list: visibility, lock, stale badge, regenerate, object count
  ObjectPanel.tsx       selected object: kind, label, linked entry, variant props, pin, delete; "Add object" palette
src/ui/editors/locationViews.tsx   LocationGalleryView (cards with SVG thumbnails)
```

- New `CollectionView` kinds `locationMap` and `locationGallery` (types, `v` helpers, `VIEW_LABEL`, dispatch). Section views: `[v.locationGallery(), v.locationMap(), v.table([...]), v.kanban('type')]`.
- The **Map** view keeps the standard inspector closed (like the wireframe view) and shows its own panels; the input fields stay reachable via an "Inputs" drawer that reuses the existing `Inspector`.
- Toolbar: Generate / New map (new seed), seed field, Regenerate dependent layers, zoom to fit, Export SVG.
- Keyboard: Delete, arrow-key nudge, Ctrl+D duplicate, Esc deselect; undo/redo comes from the store.
- Empty state: a teaching sentence plus one "Generate map" button; changing inputs after generation marks all layers stale instead of regenerating.
- Controls a guide step points at get `data-guide` attributes.

## 5. Integration

| Area | Change |
|---|---|
| `src/modules/design.ts` | `locations` collection, `version: 4`, `migrateWorld` stays valid (new section starts empty; verify old documents get `[]`) |
| `src/core/model/types.ts`, `src/modules/helpers.ts`, `CollectionEditor.tsx` | the two view kinds |
| `src/core/export/markdown.ts` | `locationPath()`, world branch in `exportAssets()`, `locationsSummaryMd()` (table per type, image link per map) |
| `src/core/hints/rules/world.ts` | `suggest`-or-below hints: location without biome, without map, stale layers, dungeon with boss ref but no boss room, biome without any location; en and hu keys |
| `src/ui/help.ts`, `src/modules/guides/world.ts` | help tips, guide steps (add a location, generate, pin and regenerate a layer), 2–3 examples, empty-state text, one concept card on layers |
| `src/core/world.ts` | `locationsOf()`, optional link from a biome dossier to its locations |
| `src/styles.css` | `loc-*` classes for panels and handles |
| `.claude/skills/workspace-map/SKILL.md` | add this plan to the index, `src/core/location/` to the layout table |

No new dependencies. No persisted-format change beyond the new section (`FORMAT_VERSION` unchanged).

## 6. Phases

Each phase ends green on `npm run typecheck`, `npm run lint` and the listed tests, and is usable on its own.

1. **Foundation**: `types`, `schema`, `rng`, `geometry`, `registry`, `generate` orchestration with a stub type. Tests: determinism, nonce isolation, pinned objects survive, stale marking, schema rejects junk.
2. **Renderer and first type (Village)**: theme, prims, glyphs, frame, `locationSvg`; `locations` section with fields; read-only Map view with Generate and New map; gallery thumbnails. Check the look in the browser before going on, since the style is the riskiest part.
3. **Editing**: `edit.ts`, stage interactions, layer panel, object panel, add palette, per-layer regenerate, keyboard, undo coalescing.
4. **Remaining generators**: Dwelling, Dungeon, Cave, then City (most complex last). One test file section per generator: object counts follow inputs, everything inside bounds, dungeon and cave fully connected, no overlapping buildings.
5. **Integration**: export assets and summary, hints, help, guide, i18n, workspace-map index.
6. **Verification**: full test run, build, browser pass with a realistic project (large city, 30-room dungeon), light and dark mode, export zip opened and checked.

Tests go in `tests/location.test.ts` (core), `tests/locationUi.test.tsx` (view), plus additions to `tests/world.test.ts` and `tests/guides.test.ts`.

## 7. Risks

| Risk | Mitigation |
|---|---|
| The style does not look good enough | Phase 2 ends with a visual review on one type before four more generators are written; the theme and glyphs are isolated so they can be redrawn without touching generators. |
| City generation complexity | Done last; shares street and building placement with Village; a simpler ward grid is an acceptable first version. |
| Large maps slow to drag | Memoise primitives per layer on object identity (Immer keeps untouched layers stable); during a drag only the moved object re-renders; object cap. |
| Project file growth | Integer coordinates, vector outlines, object cap, no stored render output. |
| Regeneration destroying manual work | Auto-pin on edit, stale badges instead of automatic downstream regeneration, one undo step per regeneration. |

## 8. Out of scope (candidates for later)

Free-hand terrain/wall brushes, multiple floors, PNG export, tileset or sprite themes, placing locations on the world map sketch as linked markers, game-ready level data export.
