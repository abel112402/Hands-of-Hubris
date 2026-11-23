# Changelog

## 0.15.0

- Player progression (`PlannerProgression`, id “progression”): XP from completed quests (`PlannerQuestCompleted.Xp`) and defeated enemies (`PlannerEnemyDefeated.Xp`), levels by the plan's XP table up to the cap, skill and stat points per level (counted); `PlannerLevelUp`; an on-screen level label. Saved as `PlannerStateKind.Progression`.
- Trading (`PlannerTrade`, id “trade”, after “interaction” and “inventory”): a wallet (starting money, limit) that quests' Reward money fills; `PlannerMerchant` (interactable, “Trade with …”) sells and buys at the planned prices while it has money for buying (`CanBuy`/`Buy`/`CanSell`/`Sell` with the reason why not); an IMGUI trade panel and money label; `PlannerTraded`. Saved as `PlannerStateKind.Trade` (money and each merchant's purse).
- Day and night (`PlannerClock`, id “time”): an in-game clock at the planned day length from the start hour; the current day phase dims the sun to its visibility and gives `MonsterStrength`, which `PlannerCombat` multiplies enemy damage by (`PlannerCombat.Clock`); `PlannerDayPhaseChanged`; an on-screen clock. Saved as `PlannerStateKind.Time`.
- The player self-test checks the level for the XP gathered, a purchase and sale at the planned prices, and the clock's rate and light by phase.
- PlayMode tests: XP from quests and enemies, levels and the cap, a saved progression; buying, selling, the merchant's purse, the wallet limit, a saved trade; the clock's rate, phases and light, night monster strength, a saved time.

## 0.14.0

- Navigation (`PlannerNavigation`, id “navigation”): a navigation mesh baked when the game starts from the levels' solid colliders (every `PlannerLocation`, or the given roots; triggers left out), and paths over it (`Path`, `OnMesh`). It needs Unity's AI module (`com.unity.modules.ai`, define `HOH_UNITY_AI`): without it the module still starts, says so once, and movers walk straight.
- The enemy behaviour template (`PlannerEnemy`): `PlannerEnemyState` Guard / Patrol / Chase / Return. It guards its post or walks its patrol route (`Route`, round and round); unless passive, it sees the player within `SightRange` when no wall is between them (`Sees`), chases over the navigation mesh and hits within reach; it goes back after losing sight for `ForgetAfter` seconds or (with `GiveUp`) once that far from its post or route, and only comes again for a player within that range. Event `PlannerEnemyStateChanged`. A loaded game sends every enemy back.
- The player self-test checks the navigation mesh and, before the fights, that every enemy patrols its route, chases a player it sees and goes back.
- Movers (the player's `PlannerMovement` and enemies) set their CharacterController's `minMoveDistance` to 0: at a high frame rate every step was below the default and dropped, so they stood still.
- PlayMode tests: a path round a wall, walking round it to its post, patrol, sight blocked by a wall and by range, chase and going back, giving up past its range, a passive enemy.

## 0.13.0

- Several locations in one scene (the planner's loading profile “one scene”): `PlannerLocation` on each location's level root (planner ID, name, the ground it covers); `PlannerLocation.At(point)` says which location a point is in.
- `PlannerPassage` (an `IPlannerInteractable`, prompt “Go to …”): a map object of the plan that opens another location of the prototype; interacting moves the player to its arrival, at the way back on the other map, keeping the facing. Event `PlannerTravelled` (passage, from, to).
- The player self-test goes through every passage, checks where the player arrives, and saves in the last location reached, so a load brings the player back there.
- PlayMode tests: which location a point is in, a passage there and the way back, a passage without an arrival.

## 0.12.0

- Quick save and quick load while playing (`PlannerQuickSave`): the plan's Quick save and Quick load controls (`IPlannerSaveSource`, the input source's QuickSave and QuickLoad actions) save the game into the first manual slot and load it back through the game's save system; a short message says what happened (`PlannerQuickSaveResult`: saved, loaded, nothing to load, failed). A save that cannot be loaded is reported and changes nothing.
- PlayMode tests: the actions save and load the slot, a damaged save is reported without changes, no save system.

## 0.11.0

- NPC dialogue (`PlannerDialogue`, id “dialogue”, after “interaction” and, when used, “quests” and “inventory”): the plan's typed Dialogue lines. `Start(speaker)` shows the line that starts a character's conversation; the lines that answer the current line are its `Options` (allowed or the reason why not); `Pick` shows the picked line and, the first time only, makes its story choice through the quest graph (offered only while the graph allows it — one option per decision) and gives its items (offered only when they fit). Events `PlannerDialogueLineShown` (the extension point for animation and voice), `PlannerDialoguePicked`, `PlannerItemAcquired`. Starting fails, with every reason, on unknown lines, choices or items.
- `PlannerNpc` (an `IPlannerInteractable`, prompt “Talk to …”) and `PlannerDialoguePanel` (IMGUI: the line, one button per option, disabled with the reason; Leave).
- `IPlannerQuestGraph`: `KnowsChoice`, `CanChoose`, `HasChosen`, `IsDecided`, `Choose` (the export's generated PlannerQuestGraph implements them over PlannerQuestLog). A graph written for 0.10.0 must add them.
- Saving: `PlannerStateKind.Dialogue` (the options already picked; the choices are saved with the quests). The player self-test talks to each NPC, picks its first allowed option and checks that the consequences run once and the decision's other options close.
- PlayMode tests: talking by interacting, a choice and items once, the decision's other option closed, no room, an option without consequences, unknown references, a save.

## 0.10.0

- Combat, the first supported model only (`PlannerCombat`, id “combat”, after “movement”): melee. On the Attack action (`IPlannerCombatSource`, the input source's Attack action) the player hits the nearest living enemy in reach, at most the weapon's attacks per second, for the plan's damage formula (`IPlannerDamageFormula`, the export's generated PlannerDamageFormula) with attack, armor, resist and crit = 1; enemies hit the player the same way. A defeated player is put back at the player start with full health.
- `PlannerHealth`, `PlannerEnemy` (planned HP, damage, rate, armor, resistances, speed, aggression; chases within the aggro radius, hits in reach) and `PlannerLoot` (the guaranteed loot, taken once by interacting). Events `PlannerHit`, `PlannerEnemyDefeated` (with XP), `PlannerPlayerDefeated`.
- Saving: `PlannerStateKind.Combat` (the player's health and each enemy's health, defeated and looted). HUD: the Health stat bar (`bind-survivalStat-health`). `PlannerInventory.CanAddAll`. The player self-test fights each enemy and takes its loot.
- PlayMode tests: hits by the formula at the weapon's rate, resistances and weaknesses, nothing in reach, chase and enemy rate, passive enemies, respawn, loot once, the fight saved and loaded, no formula refused.

## 0.9.0

- Crafting module (`PlannerCrafting`, id “crafting”, after “inventory” and, when a recipe is unlocked by quests, “quests”): the plan's recipes as typed rules (item inputs, one output, unlocking quests); `CanCraft` says why not (locked, which input is missing, no room); `TryCraft` takes the inputs and gives the output in one change (`PlannerInventory.TryExchange`) or changes nothing. Events `PlannerItemCrafted` and `PlannerItemAcquired`. Starting fails, with every reason, on unknown items or quests.
- `PlannerCraftingPanel` (IMGUI): opened with the planned crafting control (`IPlannerMenuSource`, the input source's Crafting action); each recipe with have/need and Craft, or why not.
- The player self-test crafts every recipe it can and checks the exact amounts.
- PlayMode tests: exact result, nothing consumed when an input is missing or the output does not fit, an unlocking quest, unknown references, the panel, a crafted state saved and loaded.

## 0.8.0

- `PlannerSelfTest`: a built player started with `-hohSelfTest` (and `-hohSelfTestReport <file>`) checks its first scene — the runtime runs, no script is missing, each pickup is taken once, every quest whose goal is held is done and rewarded, and a save loads into a fresh game unchanged with no reward while loading — writes a JSON report and quits with 0 or 1. The planner's Unity gate runs it.
- `IPlannerSaveSystem.Delete`.

## 0.7.0

- Saving (`PlannerGameState`): the state of the saved parts the plan links to a runtime state — player position and facing; the inventory together with the map pickups taken; the quests with the quest graph's log and the rewards given — as JSON. `Check` validates a part without changing anything (damaged JSON, unknown items or pickups, counts over a stack, more filled slots than planned throw `PlannerStateException`); `BeginRestore`/`EndRestore` pause the quests so a restored inventory never rewards a quest again. `IPlannerSaveSystem` is implemented by the export's generated PlannerSaveSlice over PlannerSave.
- `IPlannerQuestGraph.SaveState`/`LoadState`; `PlannerQuests.CaptureState`/`CheckState`/`RestoreState`/`Paused`; `PlannerInventory.Check`/`Restore`; `PlannerPickup.SetTaken`; `PlannerPlayer.Teleport`.
- PlayMode tests: a fresh game loads where the player left it without a second reward, a damaged part refused before anything changes, inventories and pickups the plan does not allow, a position that is not one.

## 0.6.0

- Quest module (`PlannerQuests`, id “quests”, after “inventory”): quests with a typed rule start when the plan's quest graph (`IPlannerQuestGraph`, the generated PlannerQuestGraph over PlannerQuestLog) lets them; the goal (hold these items) is checked after every inventory change; when reached, the graph records the quest done and the item reward goes into the inventory all or nothing, exactly once — while it does not fit, the quest waits (`PlannerQuestRewardWaiting`) and gets it when there is room. A quest the graph already had done is not rewarded again. Events: `PlannerQuestStarted`, `PlannerQuestCompleted` (items, money, XP). Starting fails with every reason when the graph is missing or a rule names an unknown quest or item.
- `PlannerInventory.TryAddAll`: several items, all or nothing, one change notice.
- `PlannerHudBinding`: the quest tracker (`bind-quest`, `bind-quest-<quest ID>`) shows the quest's name and goal progress, or that it is done.
- PlayMode tests: goal only from inventory changes and reward once, the planned graph, a full inventory delaying the whole reward, no reward for a quest done before, refusing unknown references or a missing graph.

## 0.5.0

- Inventory module (`PlannerInventory`, id “inventory”): planned slots, each holding one item up to its planned stack size; items matched by planner ID; all-or-nothing `TryAdd`/`TryRemove` (unknown item, count below 1 or no room changes nothing); `Changed` and `PlannerInventoryChanged` on the event bus.
- `IPlannerItemReceiver`: a pickup is taken only when the inventory took everything; otherwise it stays and its prompt says “Inventory full”.
- `PlannerHudBinding`: binds the plan's HUD UXML to the inventory — `bind-inventory` gets a cell per slot, each `bind-item-<item ID>` the count — and updates on every change.
- PlayMode tests: stacking, full inventory, unknown items and bad counts, removing, pickups into the inventory, the HUD binding.

## 0.4.0

- Interaction module (`PlannerInteractor`, id “interaction”, after “movement”): targets the nearest usable `IPlannerInteractable` within the planned range of the player on the ground plane and uses it on the Interact action, once per press; acts only while its runtime runs. `TargetChanged` for feedback, `PlannerInteractionPrompt` shows “[E] Pick up …” (IMGUI).
- `PlannerPickup`: an item placement that gives its planned item and amount once (`PlannerItemAcquired` on the runtime's event bus) and disappears; a placement without an item or with a count below 1 is no target.
- PlayMode tests: pick up once, holding is not pressing again, out of range, invalid pickups, nearest target and prompt, nothing without a running runtime.

## 0.3.0

- `PlannerPlacement`: an object placed from a location map of the plan (player start, item pickup with its planner and record IDs and count, or another spawn role). The bridge's prototype scene puts one on each placement; interaction and inventory (later phases) read it.

## 0.2.0

- Movement module (`PlannerMovement`, id “movement”): CharacterController walking at the planned speed relative to the camera yaw, turning to where it walks, with gravity.
- Third-person follow camera (`PlannerThirdPersonCamera`): planned distance and height behind the player, fixed yaw.
- `PlannerPlayer.Create` makes a player and its camera from `PlannerPlayerSettings`; input through `IPlannerMoveSource`.
- `HoHPlanner.Runtime.InputSystem` (compiles only with the Input System package): `PlannerInputSystemSource` reads Move and Interact from the generated action asset.
- PlayMode tests for movement and camera, and with a virtual keyboard.

## 0.1.0

- Service lifecycle (`IPlannerService`, `PlannerRuntime`): dependency order, all start problems reported at once, rollback on a failed start, reverse shutdown that continues past failures.
- Typed event bus (`PlannerEvents`).
- Scene host (`PlannerRuntimeHost`) with required modules from the plan.
- Environment checks for the URP + Input System profile (`PlannerEnvironment`).
- EditMode and PlayMode tests.
