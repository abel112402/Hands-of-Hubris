# Changelog

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
