import { HashRouter, Route, Routes } from 'react-router-dom'
import { AppShell } from './ui/AppShell'
import { Home } from './ui/pages/Home'
import { EditorPage } from './ui/pages/EditorPage'
import { Definitions } from './ui/pages/Definitions'
import { Issues } from './ui/pages/Issues'
import { HintsPage } from './ui/hints/HintsPage'

export function App() {
  return (
    <HashRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route index element={<Home />} />
          <Route path="doc/:docId" element={<EditorPage />} />
          <Route path="definitions" element={<Definitions />} />
          <Route path="issues" element={<Issues />} />
          <Route path="hints" element={<HintsPage />} />
        </Route>
      </Routes>
    </HashRouter>
  )
}
