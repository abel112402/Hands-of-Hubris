import { useTranslation } from 'react-i18next'
import { engineTarget } from '../core/engine/target'
import { useStore } from '../core/store/store'
import { exportEngineZip, importEngineReport } from './actions'

/** “Export for <engine> (.zip)”, named after the project's target engine. */
export function EngineExportButton() {
  const { t } = useTranslation()
  const engine = useStore((s) => engineTarget(s.project).label)
  return <button onClick={() => void exportEngineZip()}>{t('actions.exportEngine', { engine })}</button>
}

/** “Import engine report…”: the state of the plan in the engine project (hoh-engine-report.json). */
export function EngineReportButton() {
  const { t } = useTranslation()
  return <button onClick={() => void importEngineReport()}>{t('actions.importEngineReport')}</button>
}
