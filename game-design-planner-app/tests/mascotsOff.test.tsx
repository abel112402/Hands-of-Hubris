import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanup, render } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import i18n from '../src/core/i18n'
import { MASCOTS_ENABLED } from '../src/core/mascots/config'
import { HubiSays, Mascot } from '../src/ui/mascots/Mascot'
import { Flavor, useFlavorLevel } from '../src/ui/flavor/Flavor'
import { FlavorToast, useMoments } from '../src/ui/flavor/moments'
import { createProject } from '../src/core/model/project'
import { useStore } from '../src/core/store/store'
import { Issues } from '../src/ui/pages/Issues'
import { act } from '@testing-library/react'

afterEach(cleanup)

/** Hubi is switched off for now (2026-11-15): his lines stay as plain asides, no pictures anywhere. */
describe('mascots switched off', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en')
    useFlavorLevel.setState({ level: 'full' })
    useStore.setState({ project: createProject('Test', false), readOnly: false })
  })

  it('is off in the app config', () => {
    expect(MASCOTS_ENABLED).toBe(false)
  })

  it('shows no picture, and speech bubbles become plain asides', () => {
    expect(render(<Mascot costume="knight" />).container.innerHTML).toBe('')
    const { container } = render(<HubiSays costume="suit" className="intro-greeting">Hello</HubiSays>)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('.hubi-bubble')).toBeNull()
    expect(container.querySelector('p.flavor.intro-greeting')?.textContent).toBe('Hello')
  })

  it('keeps flavor lines and moments without Hubi', () => {
    const { container } = render(<MemoryRouter><Flavor keys="flavor.noHints" costume="suit" /><Issues /><FlavorToast /></MemoryRouter>)
    act(() => {
      useMoments.setState({ moment: null, lastAt: null })
      useMoments.getState().announce({ keys: 'flavor.phaseDone' }, true)
    })
    expect(container.querySelectorAll('p.flavor').length).toBeGreaterThan(0)
    expect(container.querySelector('.flavor-toast')).not.toBeNull()
    expect(container.querySelector('img.mascot')).toBeNull()
  })
})
