import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Home } from './ui/pages/Home'
import { EditorPage } from './ui/pages/EditorPage'
import { Definitions } from './ui/pages/Definitions'
import { Issues } from './ui/pages/Issues'
import { AiSettings } from './ui/ai/AiSettings'
import { HintsPage } from './ui/hints/HintsPage'
import type { CloudBackend } from './core/cloud/backend'
import { CloudBootstrap, RequireUser, RequireWorkspace } from './ui/cloud/guards'
import { Landing } from './ui/cloud/Landing'
import { ProjectsPage } from './ui/cloud/ProjectsPage'
import { OpenProjectRoute } from './ui/cloud/OpenProjectRoute'
import { ProjectSettings } from './ui/cloud/ProjectSettings'

/**
 * `cloudBackend`: undefined = use the build configuration (local-only when none is set);
 * tests pass a fake backend or null.
 */
export function App({ cloudBackend }: { cloudBackend?: CloudBackend | null } = {}) {
  return (
    <CloudBootstrap backend={cloudBackend}>
      <HashRouter>
        <Routes>
          <Route path="welcome" element={<Landing />} />
          <Route path="projects" element={<RequireUser><ProjectsPage /></RequireUser>} />
          <Route path="projects/:projectId/*" element={<RequireUser><OpenProjectRoute /></RequireUser>} />
          <Route element={<RequireWorkspace><AppShell /></RequireWorkspace>}>
            <Route index element={<Home />} />
            <Route path="doc/:docId" element={<EditorPage />} />
            <Route path="definitions" element={<Definitions />} />
            <Route path="issues" element={<Issues />} />
            <Route path="hints" element={<HintsPage />} />
            <Route path="ai" element={<AiSettings />} />
            <Route path="project" element={<ProjectSettings />} />
          </Route>
        </Routes>
      </HashRouter>
    </CloudBootstrap>
  )
}
