import { configure } from '@testing-library/react'

// findBy*/waitFor default to 1 s. Under a full parallel run a whole-app render can take longer
// (see testTimeout in vite.config.ts), which made tests that open the workspace flaky.
configure({ asyncUtilTimeout: 3000 })
