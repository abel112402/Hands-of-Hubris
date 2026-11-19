import { useUiVersion } from '../core/uiVersion'
import { AppShell } from './AppShell'
import { AppShellV3 } from './v3/AppShellV3'
import { EditorPage } from './pages/EditorPage'
import { EditorPageV3 } from './v3/EditorPageV3'
import { Home } from './pages/Home'
import { Atlas } from './v3/Atlas'

/** The workspace frame for the interface generation chosen in Settings (core/uiVersion.ts). */
export function Shell() {
  return useUiVersion() === 'v3' ? <AppShellV3 /> : <AppShell />
}

/** The home page: the Atlas in v3, the three-pane workspace in Classic. */
export function HomeRoute() {
  return useUiVersion() === 'v3' ? <Atlas /> : <Home />
}

/** A planner page in the chosen interface generation. */
export function EditorRoute() {
  return useUiVersion() === 'v3' ? <EditorPageV3 /> : <EditorPage />
}
