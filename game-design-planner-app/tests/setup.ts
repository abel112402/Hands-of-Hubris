import { beforeEach } from 'vitest'
import { configure } from '@testing-library/react'
import { resetUiVersionOverride, UI_VERSION_KEY } from '../src/core/uiVersion'

// findBy*/waitFor default to 1 s. Under a full parallel run a whole-app render can take longer
// (see testTimeout in vite.config.ts), which made tests that open the workspace flaky.
configure({ asyncUtilTimeout: 3000 })

// The Design Atlas (v3) is the default interface, but most UI tests cover the Classic one, which stays
// available: they start in Classic. Tests of v3 choose it themselves (tests/v3*Ui.test.tsx), and
// tests/v3ShellUi.test.tsx checks that a browser with no stored choice gets v3.
beforeEach(() => {
  if (typeof localStorage !== 'undefined') localStorage.setItem(UI_VERSION_KEY, 'v2')
  resetUiVersionOverride()
})
