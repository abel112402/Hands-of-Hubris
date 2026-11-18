import { useEffect, useMemo, useRef, useState } from 'react'
import { create } from 'zustand'
import { useTranslation } from 'react-i18next'
import type { i18n as I18n } from 'i18next'
import { useStore } from '../../core/store/store'
import { costumeFor, wrongCostume, type CostumeId } from '../../core/mascots/cast'
import { isAprilFools } from '../../core/flavor/easter'
import { rankReflections, reflections, type Reflection } from '../../core/mascots/reflect'
import { AUTO_IDLE_MS, autoAllowed, fillParams, kindAt, nthLine, type LineKind } from '../../core/mascots/lines'
import { asLines, daySeed } from '../../core/flavor/pick'
import { splitByScope } from '../../core/hints/engine'
import { useHints } from '../hints/useHints'
import { useFlavorLevel } from '../flavor/Flavor'
import { useMoments } from '../flavor/moments'
import { hasPose, Mascot, type Pose } from './Mascot'
import { useWardrobe } from './wardrobeStore'

/** Session-only companion state: never in the project, undo/redo, autosave or exports. */
type CompanionState = {
  /** "Not now": Hubi only speaks when clicked, for the rest of the session. */
  quiet: boolean
  autoCount: number
  setQuiet: () => void
  countAuto: () => void
}
export const useCompanion = create<CompanionState>((set) => ({
  quiet: false,
  autoCount: 0,
  setQuiet: () => set({ quiet: true }),
  countAuto: () => set((s) => ({ autoCount: s.autoCount + 1 })),
}))

type Said = { kind: LineKind | 'dressUp'; text: string; costume: CostumeId }

/** Delay after a costume change before Hubi remarks on it, so he has popped back up first. */
const DRESS_UP_DELAY_MS = 700

/** How Hubi stands while he talks: thinking over a report, pointing at a tip, cheering for a joke or a new outfit. */
const POSE_BY_KIND: Record<Said['kind'], Pose> = { reflect: 'think', tip: 'point', joke: 'cheer', dressUp: 'cheer' }

const linesOf = (i18n: I18n, key: string) => asLines(i18n.getResource(i18n.resolvedLanguage ?? i18n.language, 'translation', key))

/** The `step`-th thing Hubi says on this planner. Skips a kind that has no text (e.g. no reflections). */
export function companionLine(i18n: I18n, costume: CostumeId, refl: Reflection[], step: number, jokes: boolean, seed: string): Said | null {
  for (let tries = 0; tries < 3; tries++) {
    const s = step + tries
    const kind = kindAt(s, jokes)
    const round = Math.floor(s / (jokes ? 3 : 2))
    if (kind === 'reflect') {
      const r = refl[round % Math.max(refl.length, 1)]
      const line = r && nthLine(linesOf(i18n, `mascot.reflect.${r.key}`), `${seed}|${r.key}`, round)
      if (r && line) return { kind, costume: r.costume, text: fillParams(line, r.params) }
    } else {
      const line = nthLine(linesOf(i18n, `mascot.${costume}.${kind}`), `${seed}|${kind}`, round)
      if (line) return { kind, costume, text: line }
    }
  }
  return null
}

/**
 * Hubi peeking from the bottom corner of the editor, dressed for the planner. Click for a reflection on the
 * project, a tip or a joke. At Full personality he also speaks up by himself after a quiet minute, rarely.
 */
export function MascotCompanion({ docId }: { docId: string }) {
  const { t, i18n } = useTranslation()
  const level = useFlavorLevel((s) => s.level)
  const readOnly = useStore((s) => s.readOnly)
  const project = useStore((s) => s.project)
  const { all } = useHints(docId)
  const hintsHere = useMemo(() => splitByScope(all, { docId }).here.length, [all, docId])
  const hintsTotal = all.length
  // April Fools' Day (Full only): the wrong costume, and his first line owns up to it.
  const april = level === 'full' && isAprilFools(new Date())
  const costume = april ? wrongCostume(costumeFor(docId)) : costumeFor(docId)
  const muted = useWardrobe((s) => s.muted)
  const refl = useMemo(
    () => rankReflections(reflections(project, { docId, hintsHere, hintsTotal })).filter((r) => !muted.includes(r.costume)),
    [project, docId, hintsHere, hintsTotal, muted],
  )
  const [step, setStep] = useState(0)
  const [said, setSaid] = useState<Said | null>(null)
  const jokes = level === 'full'
  const seed = `${daySeed()}|${docId}`

  // A new planner: Hubi changes costume and starts his round again.
  const [shownDoc, setShownDoc] = useState(docId)
  if (shownDoc !== docId) {
    setShownDoc(docId)
    setStep(0)
    setSaid(null)
  }

  const say = (s: number) => {
    const aprilLine = april && s === 0 ? nthLine(linesOf(i18n, 'mascot.aprilFools'), seed, 0) : undefined
    setSaid(aprilLine ? { kind: 'joke', costume, text: aprilLine } : companionLine(i18n, costume, refl, s, jokes, seed))
    setStep(s + 1)
  }

  // Changing costume: at Full personality, now and then, Hubi says something about the new outfit.
  // Shares the "speaks by himself" limit, so a quick tour of planners doesn't turn into a fashion show.
  const lastCostume = useRef(costume)
  useEffect(() => {
    const prev = lastCostume.current
    lastCostume.current = costume
    if (prev === costume || level !== 'full' || readOnly) return
    const id = setTimeout(() => {
      const c = useCompanion.getState()
      const m = useMoments.getState()
      const now = Date.now()
      if (c.quiet || m.moment || !autoAllowed(now, m.lastAt, c.autoCount)) return
      const text = nthLine(linesOf(i18n, `mascot.${costume}.dressUp`), `${daySeed()}|${prev}>${costume}`, 0)
      if (!text) return
      useMoments.setState({ lastAt: now })
      c.countAuto()
      setSaid({ kind: 'dressUp', costume, text })
    }, DRESS_UP_DELAY_MS)
    return () => clearTimeout(id)
  }, [costume, level, readOnly, i18n])

  // Speaking up by himself: Full only, after a quiet minute on this planner, and rarely.
  const sayRef = useRef(say)
  const openRef = useRef(false)
  useEffect(() => {
    sayRef.current = say
    openRef.current = !!said
  })
  useEffect(() => {
    if (level !== 'full' || readOnly) return
    const id = setTimeout(() => {
      const c = useCompanion.getState()
      const m = useMoments.getState()
      const now = Date.now()
      if (c.quiet || openRef.current || m.moment || !autoAllowed(now, m.lastAt, c.autoCount)) return
      useMoments.setState({ lastAt: now })
      c.countAuto()
      sayRef.current(0)
    }, AUTO_IDLE_MS)
    return () => clearTimeout(id)
  }, [docId, level, readOnly])

  useEffect(() => {
    if (!said) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setSaid(null)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [said])

  // A muted planner costume hides the companion; other costumes' remarks are already filtered out.
  if (level === 'off' || readOnly || muted.includes(costume)) return null
  const costumeName = t(`mascot.costume.${costume}`)
  return (
    <div className="hubi-companion-anchor">
      <div className="hubi-companion">
        {said && (
          <div className="hubi-companion-bubble" role="status" aria-live="polite">
            <span className="hubi-kind">{t(`mascot.companion.kind.${said.kind}`)}</span>
            <p>{said.text}</p>
            <div className="hubi-companion-actions">
              <button className="small" onClick={() => say(step)}>{t('mascot.companion.more')}</button>
              <button className="small" onClick={() => { useCompanion.getState().setQuiet(); setSaid(null) }}>{t('mascot.companion.notNow')}</button>
              <button className="banner-close" aria-label={t('mascot.companion.close')} onClick={() => setSaid(null)}>×</button>
            </div>
          </div>
        )}
        <button
          key={costume}
          className={'hubi-peek' + (!said && hasPose(costume, 'peek') ? ' has-peek' : '')}
          aria-label={t('mascot.companion.open', { costume: costumeName })}
          title={t('mascot.companion.open', { costume: costumeName })}
          aria-expanded={!!said}
          onClick={() => (said ? setSaid(null) : say(step))}
        >
          {said ? <Mascot costume={said.costume} pose={POSE_BY_KIND[said.kind]} size={120} /> : hasPose(costume, 'peek') ? <Mascot costume={costume} pose="peek" size={62} /> : <Mascot costume={costume} size={120} />}
        </button>
      </div>
    </div>
  )
}
