import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Home } from './ui/pages/Home'
import { EditorPage } from './ui/pages/EditorPage'
import { Issues } from './ui/pages/Issues'
import { SettingsPage } from './ui/settings/SettingsPage'
import type { CloudBackend } from './core/cloud/backend'
import { CloudBootstrap, RequireUser, RequireWorkspace } from './ui/cloud/guards'
import { Landing } from './ui/cloud/Landing'
import { ProjectsPage } from './ui/cloud/ProjectsPage'
import { OpenProjectRoute } from './ui/cloud/OpenProjectRoute'

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
            <Route path="issues" element={<Issues />} />
            <Route path="settings/:tab?" element={<SettingsPage />} />
            {/* Old addresses of pages that are now Settings tabs (bookmarks, links in docs). */}
            <Route path="definitions" element={<Navigate to="/settings/definitions" replace />} />
            <Route path="hints" element={<Navigate to="/settings/hints" replace />} />
            <Route path="ai" element={<Navigate to="/settings/ai" replace />} />
            <Route path="project" element={<Navigate to="/settings/sharing" replace />} />
          </Route>
        </Routes>
      </HashRouter>
    </CloudBootstrap>
  )
}
