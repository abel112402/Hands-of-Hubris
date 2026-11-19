import { useUiVersion } from '../core/uiVersion'
import { AppShell } from './AppShell'
import { AppShellV3 } from './v3/AppShellV3'

/** The workspace frame for the interface generation chosen in Settings (core/uiVersion.ts). */
export function Shell() {
  return useUiVersion() === 'v3' ? <AppShellV3 /> : <AppShell />
}
