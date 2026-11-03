import type { ChecklistData } from '../core/model/types'

const item = (makeId: () => string, text: string) => ({ id: makeId(), text, done: false })

/** Seed for the release checklist (docs/04_production/release_checklist.md). */
export const releaseSeed = (makeId: () => string): ChecklistData['groups'] => [
  { id: makeId(), title: 'Build', items: [item(makeId, 'Version number and changelog'), item(makeId, 'Builds for all target platforms')] },
  { id: makeId(), title: 'Quality', items: [item(makeId, 'No blocking bugs'), item(makeId, 'Performance targets met')] },
  { id: makeId(), title: 'Content and legal', items: [item(makeId, 'Licenses, credits, EULA / privacy')] },
  { id: makeId(), title: 'Launch and marketing', items: [item(makeId, 'Store page, trailer, screenshots')] },
  { id: makeId(), title: 'Post-launch', items: [item(makeId, 'Monitoring and hotfix process')] },
]
