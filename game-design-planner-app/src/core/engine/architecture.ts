import type { EngineIR, IrClass } from './ir'

/**
 * The architecture guard (plans/UNITY_INTEGRATION_PLAN.md § 7, I18) for engines without assemblies (Godot, Unreal):
 * each planned module with the folders its code lives in, the modules its Depends on allows, and the names that give
 * its classes away (class names, header file names). The engine bridge reads ProjectFiles/architecture.json and
 * reports a file in one module's folder that uses a class of a module it may not use.
 */
export type ArchModule = { name: string; folders: string[]; allows: string[]; tokens: string[] }
export type ArchitecturePlan = { format: 'hoh-architecture'; v: 1; match: 'identifier' | 'include'; modules: ArchModule[] }

export function architecturePlan(ir: EngineIR, match: ArchitecturePlan['match'], folders: (moduleId: string, words: string[]) => string[], tokens: (c: IrClass) => string[]): ArchitecturePlan | undefined {
  const modules = ir.setup.modules
  if (modules.length < 2) return undefined
  const names = new Map(modules.map((m) => [m.id, m.name]))
  return {
    format: 'hoh-architecture',
    v: 1,
    match,
    modules: modules.map((m) => ({
      name: m.name,
      folders: [...new Set(folders(m.id, m.words))],
      allows: m.dependsOn.map((d) => names.get(d)).filter((x): x is string => !!x),
      tokens: [...new Set(ir.classes.filter((c) => c.module?.id === m.id).flatMap(tokens))],
    })),
  }
}

export const architectureFile = (plan: ArchitecturePlan | undefined) => (plan ? [{ path: 'ProjectFiles/architecture.json', content: JSON.stringify(plan, null, 2) + '\n' }] : [])
