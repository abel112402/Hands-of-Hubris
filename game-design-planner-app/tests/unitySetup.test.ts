import { describe, expect, it } from 'vitest'
import { deserializeProject } from '../src/core/persistence/serialize'
import { buildIR } from '../src/core/engine/ir'
import { unity } from '../src/core/engine/adapters/unity'
import { editorconfig } from '../src/core/engine/adapters/unitySetup'

const fs: { readFileSync: (path: string, enc: string) => string } = await import('node:fs' as string)
const cinderholm = () => deserializeProject(fs.readFileSync('examples/cinderholm.hohplan.json', 'utf8')).project
const files = () => new Map(unity.emit(buildIR(cinderholm()).ir).map((f) => [f.path, f.content]))

describe('Unity project set-up from the plan', () => {
  it('takes code style, naming rules, folders, modules and LFS into the IR', () => {
    const { setup } = buildIR(cinderholm()).ir
    expect(setup.style).toEqual({ indent: 'spaces', indentSize: 4, lineLength: 120, braces: 'newline' })
    expect(setup.naming.find((r) => r.target === 'Interface')).toMatchObject({ casing: 'PascalCase', prefix: 'I', automated: true })
    expect(setup.folders.find((f) => f.path === 'Assets/_Project/Scripts/Core.Data')).toMatchObject({ module: 'vGaXv7CC', assembly: true })
    expect(setup.lfs).toEqual(expect.arrayContaining(['*.psd', '*.fbx', '*.wav', '*.ogg', '*.png']))
  })

  it('writes .editorconfig from the style and naming rules', () => {
    const text = files().get('ProjectFiles/.editorconfig')!
    expect(text).toContain('indent_style = space\nindent_size = 4\nmax_line_length = 120')
    expect(text).toContain('csharp_new_line_before_open_brace = all')
    expect(text).toContain('dotnet_naming_style.interface_style.required_prefix = I')
    expect(text).not.toMatch(/namespace_style\.required_prefix/)
    expect(text.indexOf('# Constant')).toBeLessThan(text.indexOf('# Private field'))
    expect(text).toContain('dotnet_naming_rule.class_struct.severity = suggestion')
  })

  it('maps casings, severities and hand-reviewed rules', () => {
    const text = editorconfig({
      style: {},
      naming: [
        { target: 'Constant', casing: 'UPPER_SNAKE', severity: 'Blocker', automated: true },
        { target: 'Private field', casing: 'camelCase', prefix: '_', severity: 'Major', automated: false },
        { target: 'Prefab', casing: 'PascalCase', severity: 'Minor', automated: true },
        { target: 'Method', casing: 'kebab-case', severity: 'Minor', automated: true },
      ],
      folders: [],
      modules: [],
      lfs: [],
      ignore: [],
    })
    expect(text).toContain('dotnet_naming_style.constant_style.capitalization = all_upper\ndotnet_naming_style.constant_style.word_separator = _')
    expect(text).toContain('dotnet_naming_rule.constant.severity = error')
    expect(text).toContain('dotnet_naming_symbols.private_field.applicable_accessibilities = private, protected, private_protected')
    expect(text).toContain('dotnet_naming_style.private_field_style.required_prefix = _')
    expect(text).toContain('dotnet_naming_rule.private_field.severity = suggestion')
    expect(text).not.toContain('prefab')
    expect(text).not.toContain('method')
    expect(text).toContain('indent_size = 4')
  })

  it('writes .gitattributes with Unity YAML merge and LFS, and .gitignore with the planned highlights', () => {
    const f = files()
    const attrs = f.get('ProjectFiles/.gitattributes')!
    expect(attrs).toContain('*.prefab merge=unityyamlmerge eol=lf')
    expect(attrs).toContain('*.psd filter=lfs diff=lfs merge=lfs -text')
    const ignore = f.get('ProjectFiles/.gitignore')!
    expect(ignore).toContain('/[Ll]ibrary/')
    expect(ignore.endsWith('# From the plan\nLibrary/\nTemp/\nBuilds/\n')).toBe(true) // *.csproj is already a Unity default
  })

  it('plans the folders and one assembly per module that references the generated code and its dependencies', () => {
    const setup = JSON.parse(files().get('ProjectFiles/setup.json')!)
    expect(setup.generatedAssembly).toBe('CinderholmExample')
    const data = setup.folders.find((f: { path: string }) => f.path === 'Assets/_Project/Scripts/Core.Data')
    expect(data.asmdef).toEqual({ name: 'Cinder.Core.Data', rootNamespace: 'Cinder.Core.Data', references: ['CinderholmExample', 'Cinder.Core.Events'] })
    expect(setup.folders.find((f: { path: string }) => f.path === 'Assets/_Project').asmdef).toBeUndefined()
  })
})
