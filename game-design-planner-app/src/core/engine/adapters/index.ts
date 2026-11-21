import type { EngineAdapter, EngineId } from '../adapter'
import { unity } from './unity'
import { godot } from './godot'
import { unreal } from './unreal'

/** Engines that can be exported to; a new engine is a new adapter here (plans/UNITY_INTEGRATION_PLAN.md). */
export const ENGINE_ADAPTERS: EngineAdapter[] = [unity, godot, unreal]

export const getAdapter = (id: EngineId | string) => ENGINE_ADAPTERS.find((a) => a.id === id)
