import type { EngineAdapter, EngineId } from '../adapter'
import { unity } from './unity'

/** Engines that can be exported to. Godot and Unreal join here as new adapters (plans/UNITY_INTEGRATION_PLAN.md, phases G and U). */
export const ENGINE_ADAPTERS: EngineAdapter[] = [unity]

export const getAdapter = (id: EngineId | string) => ENGINE_ADAPTERS.find((a) => a.id === id)
