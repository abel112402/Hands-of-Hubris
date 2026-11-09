import { useNavigate } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import type { GuideStep, ModuleGuide } from '../../core/guides/types'
import { useStore } from '../../core/store/store'
import { useProject } from '../hooks'
import { stepDone, toggleManual, useGuideUi, useManualDone } from './guideStore'
import { Flavor } from '../flavor/Flavor'

/** Opens a step: goes to its section and spotlights its control. */
export function useOpenStep(docId: string) {
  const nav = useNavigate()
  const setSpotlight = useGuideUi((s) => s.setSpotlight)
  return (step: GuideStep) => {
    nav(`/doc/${docId}?s=${step.section}`)
    setSpotlight(`${docId}/${step.id}`)
  }
}

export function runStepAction(step: GuideStep) {
  const a = step.action
  if (!a) return
  if ('examples' in a) useGuideUi.getState().openPicker(a.examples)
  else useStore.getState().mutate((p) => a.run(p))
}

/** Guided setup: ordered steps that tick themselves from the data, with a jump and a quick action each. */
export function GuidePanel({ docId, guide }: { docId: string; guide: ModuleGuide }) {
  const { t } = useTranslation()
  const project = useProject()
  const manual = useManualDone(project, docId)
  const open = useOpenStep(docId)
  const nav = useNavigate()
  const done = guide.steps.map((s) => stepDone(s, project, manual))
  const count = done.filter(Boolean).length
  const next = done.indexOf(false)
  return (
    <div className="guide-panel">
      <div className="progress" title={`${count}/${guide.steps.length}`}>
        <div style={{ width: `${(count / guide.steps.length) * 100}%` }} />
        <span>{t('guide.steps', { done: count, total: guide.steps.length })}</span>
      </div>
      <ol className="guide-steps">
        {guide.steps.map((step, i) => {
          const isDone = done[i]
          const current = i === next
          return (
            <li key={step.id} className={(isDone ? 'done' : '') + (current ? ' current' : '')} data-testid={`guide-step-${step.id}`}>
              <div className="guide-step-head">
                <span className="guide-check" aria-label={isDone ? t('guide.done') : t('guide.notDone')}>{isDone ? '✓' : i + 1}</span>
                <button className="link-btn" onClick={() => open(step)}>{step.title}</button>
              </div>
              {current && <p className="muted">{step.body}</p>}
              {current && (
                <div className="hint-actions">
                  <button className="primary" onClick={() => open(step)}>{t('guide.showMe')}</button>
                  {step.action && (
                    <button
                      onClick={() => {
                        nav(`/doc/${docId}?s=${'examples' in step.action! ? step.action!.examples : step.section}`)
                        runStepAction(step)
                      }}
                    >
                      {step.action.label}
                    </button>
                  )}
                </div>
              )}
              {!step.done && (
                <label className="row guide-manual">
                  <input type="checkbox" checked={isDone} onChange={() => toggleManual(docId, step.id)} /> {t('guide.markDone')}
                </label>
              )}
            </li>
          )
        })}
      </ol>
      {next === -1 && <><p className="muted">{t('guide.allDone')}</p><Flavor keys="flavor.allDone" ctx={docId} /></>}
    </div>
  )
}
