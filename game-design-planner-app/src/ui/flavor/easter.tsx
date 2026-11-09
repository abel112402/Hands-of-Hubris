import { useEffect } from 'react'
import { useStore } from '../../core/store/store'
import { brandClicks, isAprilFools, isLongAbsence, konamiStep, KONAMI, timeBucket, undoSpree } from '../../core/flavor/easter'
import { daySeed } from '../../core/flavor/pick'
import { useFlavor, useFlavorLevel } from './Flavor'
import { useMoments } from './moments'

const GREETED_KEY = 'hohplan:flavor:greetedOn'
const LAST_VISIT_KEY = 'hohplan:flavor:lastVisit'

function storageGet(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function storageSet(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage unavailable: the extra may repeat, which is harmless */
  }
}

// Decided once per page load, so re-renders and Strict Mode never flip it, and leaving and
// returning to the workspace in the same session keeps the same greeting.
let greetToday: boolean | undefined
function shouldGreet(): boolean {
  if (greetToday === undefined) {
    const today = daySeed()
    greetToday = storageGet(GREETED_KEY) !== today
    if (greetToday) storageSet(GREETED_KEY, today)
  }
  return greetToday
}

/** First workspace visit of the day: a line for the time of day. Full personality only. */
export function Greeting() {
  const full = useFlavorLevel((s) => s.level === 'full')
  const line = useFlavor({ keys: `flavor.greeting.${timeBucket(new Date())}`, min: 'full' })
  if (!full || !line || !shouldGreet()) return null
  return <p className="flavor intro-greeting">{line}</p>
}

/** Loading text; on April Fools' Day (Full personality) it gets suitably grandiose. */
export function useLoadingLine(): string | null {
  const full = useFlavorLevel((s) => s.level === 'full')
  return useFlavor({ keys: full && isAprilFools(new Date()) ? ['flavor.loadingAprilFools', 'flavor.loading'] : 'flavor.loading' })
}

const isEditable = (t: EventTarget | null) => {
  const el = t as HTMLElement | null
  return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable)
}

function spinBrand() {
  for (const el of document.querySelectorAll('.brand-mark')) {
    el.classList.remove('spin')
    // Restart the animation if it is already spinning.
    void (el as HTMLElement).getBoundingClientRect()
    el.classList.add('spin')
    setTimeout(() => el.classList.remove('spin'), 1200)
  }
}

/** Welcome back, undo sprees, Konami code, logo clicks. Mount once (AppShell). All need Full personality. */
export function useEasterEggs() {
  useEffect(() => {
    const full = () => useFlavorLevel.getState().level === 'full'
    const say = (keys: string, force = false) => useMoments.getState().announce({ keys, min: 'full' }, force)

    // Returning after a long break. The visit is recorded whatever the level, so turning Full on later doesn't misfire.
    const now = Date.now()
    const last = Number(storageGet(LAST_VISIT_KEY)) || null
    storageSet(LAST_VISIT_KEY, String(now))
    if (full() && isLongAbsence(last, now)) say('flavor.welcomeBack')

    let konami = 0
    const onKey = (e: KeyboardEvent) => {
      if (isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      konami = konamiStep(konami, e.key)
      if (konami === KONAMI.length) {
        konami = 0
        if (!full()) return
        spinBrand()
        say('flavor.konami', true)
      }
    }

    let clicks: number[] = []
    const onClick = (e: MouseEvent) => {
      if (!(e.target as HTMLElement | null)?.closest?.('.brand') || !full()) return
      const r = brandClicks(clicks, Date.now())
      clicks = r.times
      if (r.hit) {
        spinBrand()
        say('flavor.brandClicks', true)
      }
    }

    let undos: number[] = []
    const unsub = useStore.subscribe((s, prev) => {
      const undid = s.future.length === prev.future.length + 1 && s.past.length === prev.past.length - 1
      if (!undid || !full()) return
      const r = undoSpree(undos, Date.now())
      undos = r.times
      if (r.hit) say('flavor.undoSpree')
    })

    window.addEventListener('keydown', onKey)
    document.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      document.removeEventListener('click', onClick, true)
      unsub()
    }
  }, [])
}
