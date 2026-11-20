// Writes the Unity .meta file of every file and folder in a package that has none.
// A package installed from a git URL is read-only in Unity, so assets without a committed .meta are ignored.
// GUIDs are derived from the package name and the path, so running this again gives the same GUIDs.
// Usage: node engine-packages/unity/make-meta.cjs engine-packages/unity/com.handsofhubris.planner-bridge
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const root = path.resolve(process.argv[2] || path.join(__dirname, 'com.handsofhubris.planner-bridge'))
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).name
const tail = ['  externalObjects: {}', '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ']

function importer(file, isDir) {
  if (isDir) return ['folderAsset: yes', 'DefaultImporter:', ...tail]
  const ext = path.extname(file).toLowerCase()
  if (ext === '.cs') return ['MonoImporter:', '  externalObjects: {}', '  serializedVersion: 2', '  defaultReferences: []', '  executionOrder: 0', '  icon: {instanceID: 0}', '  userData: ', '  assetBundleName: ', '  assetBundleVariant: ']
  if (ext === '.asmdef') return ['AssemblyDefinitionImporter:', ...tail]
  if (path.basename(file) === 'package.json') return ['PackageManifestImporter:', ...tail]
  if (['.json', '.md', '.txt', '.xml', '.csv'].includes(ext)) return ['TextScriptImporter:', ...tail]
  return ['DefaultImporter:', ...tail]
}

let written = 0
function walk(dir) {
  for (const name of fs.readdirSync(dir).sort()) {
    if (name.endsWith('.meta') || name.startsWith('.')) continue
    const full = path.join(dir, name)
    const isDir = fs.statSync(full).isDirectory()
    const meta = full + '.meta'
    if (!fs.existsSync(meta)) {
      const rel = path.relative(root, full).split(path.sep).join('/')
      const guid = crypto.createHash('md5').update(`${pkg}/${rel}`).digest('hex')
      fs.writeFileSync(meta, ['fileFormatVersion: 2', `guid: ${guid}`, ...importer(full, isDir), ''].join('\n'))
      written++
    }
    if (isDir) walk(full)
  }
}
walk(root)
console.log(`${written} .meta file(s) written in ${root}`)
