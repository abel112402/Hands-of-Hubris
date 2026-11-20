import { describe, expect, it } from 'vitest'
import { createProject } from '../src/core/model/project'
import { ARCH_DOC } from '../src/core/architecture'
import { DATA_DOC } from '../src/core/dataDriven'
import { classIssues, classModel, mergeImported, parseClassField, parseMermaid, parseMethod, toMermaid } from '../src/core/classes'
import { buildIR } from '../src/core/engine/ir'
import { unity } from '../src/core/engine/adapters/unity'
import { buildBundle } from '../src/core/engine/bundle'
import type { Entity } from '../src/core/model/types'

function project(classes: Entity[]) {
  const p = createProject('Ember Keep', false)
  p.documents[ARCH_DOC] = {
    moduleVersion: 2,
    data: {
      layers: [{ id: 'core', name: 'Core', order: 0 }, { id: 'game', name: 'Gameplay', order: 3 }],
      modules: [{ id: 'mc', name: 'Core', layer: 'core' }, { id: 'mg', name: 'Combat', layer: 'game', assembly: 'Ember.Combat', dependsOn: ['mc'] }],
      classes,
    },
  }
  p.documents[DATA_DOC] = { moduleVersion: 3, data: { formats: [{ id: 'format-so', name: 'Native data asset' }], schemas: [{ id: 'it', name: 'Item', format: 'format-so', required: ['name: string'] }] } }
  return p
}
const DAMAGEABLE = { id: 'dmg', name: 'IDamageable', kind: 'Interface', module: 'mc', methods: ['TakeDamage(amount: float): float'] }
const HEALTH = { id: 'hp', name: 'Health', kind: 'Component', module: 'mg', implements: ['dmg'], fields: ['-max: float', '+current: float', '-drops: Item[]', 'static count: int'], methods: ['+TakeDamage(amount: float): float', '-Die()'] }
const ENEMY = { id: 'en', name: 'EnemyAI', kind: 'Actor / prefab root', module: 'mg', requires: ['hp'], fields: ['-target: Transform', '-health: Health'], methods: ['Update()'] }
const DIED = { id: 'ev', name: 'DiedEvent', kind: 'Event channel', module: 'mg', fields: ['who: EnemyAI', 'at: Vector3'] }
const STATE = { id: 'st', name: 'AiState', kind: 'Enum', module: 'mg', fields: ['Idle', 'Chase', 'Attack'] }

describe('class members', () => {
  it('reads visibility, static, types and signatures', () => {
    const p = project([HEALTH, ENEMY])
    expect(parseClassField(p, '+static count: int')).toMatchObject({ name: 'count', visibility: 'public', isStatic: true, type: { k: 'neutral', list: false } })
    expect(parseClassField(p, '-drops: Item[]')).toMatchObject({ visibility: 'private', type: { k: 'schema', list: true } })
    expect(parseClassField(p, 'health: Health')!.type).toMatchObject({ k: 'class' })
    expect(parseClassField(p, 'target: Transform')!.type).toMatchObject({ k: 'engine', name: 'Transform' })
    const m = parseMethod(p, '#Hit(amount: float, from: EnemyAI): bool')!
    expect(m).toMatchObject({ name: 'Hit', visibility: 'protected', params: [{ name: 'amount' }, { name: 'from', type: { k: 'class' } }], returns: { k: 'neutral' } })
    expect(parseMethod(p, 'Update()')).toMatchObject({ visibility: 'public', returns: null, params: [] })
    expect(parseMethod(p, 'not a method')).toBeNull()
  })
})

describe('class model and checks', () => {
  it('draws inherit, implement, require, use and data lines', () => {
    const { edges } = classModel(project([DAMAGEABLE, HEALTH, ENEMY, DIED]))
    const kinds = edges.map((e) => `${e.from.id}-${e.kind}-${e.to.id}`)
    expect(kinds).toEqual(expect.arrayContaining(['hp-implements-dmg', 'en-requires-hp', 'en-uses-hp', 'ev-uses-en', 'hp-data-it']))
  })

  it('finds loops, wrong kinds and layer breaks', () => {
    const msgs = classIssues(
      project([
        DAMAGEABLE,
        { id: 'a', name: 'A', kind: 'Class', base: 'b' },
        { id: 'b', name: 'B', kind: 'Class', base: 'a' },
        { id: 's', name: 'S', kind: 'Struct', base: 'a' },
        { id: 'x', name: 'X', kind: 'Class', base: 'dmg', implements: ['a'] },
        { id: 'core', name: 'Pathing', kind: 'Class', module: 'mc', fields: ['enemy: EnemyAI'] },
        ENEMY,
        HEALTH,
        { id: 'bad', name: 'Bad', kind: 'Class', methods: ['oops'] },
      ]),
    ).map((i) => `${i.level}: ${i.message}`)
    expect(msgs).toEqual(
      expect.arrayContaining([
        'error: A: inherits from itself (A → B → A).',
        'error: B: inherits from itself (B → A → B).',
        'error: S: a struct cannot inherit from another class.',
        'error: X: cannot inherit from the interface IDamageable; list it under Implements.',
        'error: X: implements A, which is not an interface.',
        'warning: Pathing (Core) uses EnemyAI (Combat), a higher layer.',
        'warning: Bad: “oops” is not a field (name: Type) or method (Name(arg: Type): Type).',
      ]),
    )
  })
})

describe('Mermaid', () => {
  it('round-trips the diagram', () => {
    const p = project([DAMAGEABLE, HEALTH, ENEMY])
    const text = toMermaid(p)
    expect(text).toContain('IDamageable <|.. Health')
    expect(text).toContain('Health <.. EnemyAI : requires')
    const back = parseMermaid(text)
    expect(back.problems).toEqual([])
    const list: Entity[] = []
    let n = 0
    expect(mergeImported(list, back.classes, () => `id${n++}`)).toEqual({ added: 3, updated: 0 })
    const health = list.find((c) => c.name === 'Health')!
    expect(health).toMatchObject({ kind: 'Component', fields: ['-max: float', '+current: float', '-drops: Item[]', '-static count: int'], methods: ['+TakeDamage(amount: float): float', '-Die()'] })
    expect(health.implements).toEqual([list.find((c) => c.name === 'IDamageable')!.id])
    expect(list.find((c) => c.name === 'EnemyAI')!.requires).toEqual([health.id])
  })

  it('reads common Mermaid spellings and fills only empty fields', () => {
    const { classes, problems } = parseMermaid('classDiagram\n  Animal <|-- Duck\n  class Duck{\n    <<MonoBehaviour>>\n    +String beakColor\n    +swim()\n    +quack(int times) bool\n  }\n  Duck : +int age\n  note "hi"\n')
    expect(problems).toEqual(['Skipped: note "hi"'])
    const duck = classes.find((c) => c.name === 'Duck')!
    expect(duck).toMatchObject({ base: 'Animal', kind: 'Component', fields: ['+beakColor: String', '+age: int'], methods: ['+swim()', '+quack(times: int): bool'] })
    const list: Entity[] = [{ id: 'd', name: 'duck', fields: ['keep: int'] }]
    expect(mergeImported(list, classes, () => 'new')).toEqual({ added: 1, updated: 1 })
    expect(list[0]).toMatchObject({ fields: ['keep: int'], kind: 'Component', base: 'new' })
  })

  it('refuses very long input', () => {
    expect(parseMermaid('x'.repeat(200_001)).classes).toEqual([])
  })
})

describe('classes in the Unity export', () => {
  const p = project([DAMAGEABLE, HEALTH, ENEMY, DIED, STATE])
  const files = new Map(unity.emit(buildIR(p).ir).map((f) => [f.path, f.content]))

  it('writes the generated part with fields, attributes and partial signatures', () => {
    const health = files.get('Scripts/Generated/Classes/Health.Generated.cs')!
    expect(health).toContain('namespace Ember.Combat')
    expect(health).toContain('using EmberKeep.Core;')
    expect(health).toContain('public partial class Health : MonoBehaviour, IDamageable')
    expect(health).toContain('[SerializeField] private float max;')
    expect(health).toContain('public float current;')
    expect(health).toContain('[SerializeField] private List<ItemDefinition> drops;')
    expect(health).toContain('private static int count;')
    expect(health).toContain('public partial float TakeDamage(float amount);')
    expect(health).toContain('private partial void Die();')
    const enemy = files.get('Scripts/Generated/Classes/EnemyAI.Generated.cs')!
    expect(enemy).toContain('[RequireComponent(typeof(Health))]')
    expect(enemy).toContain('[SerializeField] private Transform target;')
    expect(files.get('Scripts/Generated/Classes/IDamageable.Generated.cs')).toContain('float TakeDamage(float amount);')
    expect(files.get('Scripts/Generated/Classes/DiedEvent.Generated.cs')).toContain('public void Raise(EnemyAI who, Vector3 at) => Raised?.Invoke(who, at);')
    expect(files.get('Scripts/Generated/Classes/AiState.Generated.cs')).toMatch(/public enum AiState\s+\{\s+Idle,\s+Chase,\s+Attack,/)
  })

  it('writes your own file once per class that needs one', () => {
    const own = files.get('Scripts/Classes/Combat/Health.cs')!
    expect(own).toContain('never overwrites it')
    expect(own).toContain('public partial float TakeDamage(float amount)\n        {\n            throw new NotImplementedException();')
    expect(own).toContain('private partial void Die()\n        {\n            // TODO')
    expect(files.has('Scripts/Classes/Combat/DiedEvent.cs')).toBe(true)
    expect(files.has('Scripts/Classes/Core/IDamageable.cs')).toBe(false)
    expect(files.has('Scripts/Classes/Combat/AiState.cs')).toBe(false)
  })

  it('carries class checks into the export', () => {
    const b = buildBundle(project([{ id: 's', name: 'S', kind: 'Struct', base: 'dmg' }, DAMAGEABLE]), 'unity', 'T')
    expect(b.issues.some((i) => i.code === 'class.check' && i.level === 'error')).toBe(true)
    expect(JSON.parse(b.files.find((f) => f.path === 'ir/engine-ir.json')!.content).classes).toHaveLength(2)
  })
})

describe('example project', () => {
  it('has a class diagram that keeps every rule', async () => {
    const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
    const { deserializeProject } = await import('../src/core/persistence/serialize')
    const p = deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
    expect(classIssues(p).filter((i) => i.level !== 'info')).toEqual([])
    const files = unity.emit(buildIR(p).ir).map((f) => f.path)
    expect(files).toContain('Scripts/Classes/GameplayPlayer/PlayerController.cs')
    expect(files).toContain('Scripts/Generated/Classes/NeedChangedEvent.Generated.cs')
  })
})
