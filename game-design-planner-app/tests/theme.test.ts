import { beforeEach, describe, expect, it, vi } from 'vitest'
import { applyTheme, getThemePref, initTheme, resolveTheme, setThemePref, THEME_KEY } from '../src/core/theme'

let prefersLight = false
const changeListeners: (() => void)[] = []

beforeEach(() => {
  localStorage.clear()
  prefersLight = false
  vi.stubGlobal('matchMedia', (q: string) => ({
    media: q,
    get matches() {
      return prefersLight
    },
    addEventListener: (_: string, l: () => void) => changeListeners.push(l),
    removeEventListener: () => {},
  }))
  document.head.innerHTML = '<meta name="theme-color" content="#111316" />'
  delete document.documentElement.dataset.theme
})

describe('theme preference', () => {
  it('defaults to system, and ignores unknown stored values', () => {
    expect(getThemePref()).toBe('system')
    localStorage.setItem(THEME_KEY, 'sepia')
    expect(getThemePref()).toBe('system')
  })

  it('system follows the OS, with dark when it has no light preference', () => {
    expect(resolveTheme('system')).toBe('dark')
    prefersLight = true
    expect(resolveTheme('system')).toBe('light')
    expect(resolveTheme('dark')).toBe('dark')
  })

  it('applies the theme to <html> and the browser theme colour', () => {
    setThemePref('light')
    expect(localStorage.getItem(THEME_KEY)).toBe('light')
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(document.querySelector('meta[name="theme-color"]')!.getAttribute('content')).toBe('#f6f7f9')
    setThemePref('dark')
    expect(document.documentElement.dataset.theme).toBe('dark')
  })

  it('choosing system clears the stored value and follows OS changes', () => {
    setThemePref('dark')
    setThemePref('system')
    expect(localStorage.getItem(THEME_KEY)).toBeNull()
    initTheme()
    prefersLight = true
    changeListeners.forEach((l) => l())
    expect(document.documentElement.dataset.theme).toBe('light')
    expect(applyTheme()).toBe('light')
  })
})
