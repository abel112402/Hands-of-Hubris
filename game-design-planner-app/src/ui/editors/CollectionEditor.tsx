import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import type { CollectionSection, CollectionView, Entity, FieldDef } from '../../core/model/types'
import { makeId } from '../../core/model/project'
import { AiBadge } from '../ai/AiBadge'
import { findUsages, resolveSource } from '../../core/references/refs'
import { downloadText } from '../../core/persistence/file'
import { sectionCsv } from '../../core/export/markdown'
import { getModule } from '../../core/modules/registry'
import { useNewlyAdded, useSection, useProject } from '../hooks'
import { dragCue } from '../motion'
import { FieldInput, displayValue, isLongField } from '../FieldInput'
import { Link, useSearchParams } from 'react-router-dom'
import { RadarView, Grid2dView, TimelineView, LadderView, ProgressionView, CompareView, RangesView, EconomyView } from './views'
import { BondLadderView, EventOddsView, LifespanView, NeedChainView, NeedsBalanceView, PopulationView, RoutineView, StatPreviewView, WorkforceView } from './npcViews'
import { BuildPlannerView, DepletionView, LevelCurveView, SkillTreeView } from './playerViews'
import { GuideEmpty } from '../guides/GuideEmpty'
import { hiddenGroups } from '../../core/groupFilter'
import { ItemLinks } from './ItemLinks'
import { CombatSandboxView, PhaseBarsView, ThreatCurveView, WeaknessMatrixView } from './combatViews'
import { CombatLinks } from './CombatLinks'
import { BiomeWeatherView, ConditionsView, DayClockView, YearStripView } from './timeWeatherViews'
import { CoverageView, CraftTreeView, LootOddsView, RarityCurveView, ValuePreviewView } from './itemViews'
import { GateReadiness } from './GateReadiness'
import { MerchantStockView, MoneyFlowView, PriceLadderView, WanderingCalendarView } from './tradeViews'
import { TownNetworkView, TownResourceFlowView } from './townViews'
import { ActPacingView, CastCoverageView, EndingPathsView, QuestFlowView, RewardBudgetView } from './storyViews'
import { WireframeView } from './wireframe/WireframeView'
import { BootSequenceView, CouplingView, DependencyMatrixView, ExtensionCoverageView, LayerDiagramView, LayerStackView, MessageFlowView, TickScheduleView } from './architectureViews'
import { BranchFlowView, EnforcementBoardView, FolderTreeView, NamingTesterView } from './codingViews'
import { DataModelView, LoadPlanView, PipelineReadinessView, RecordTesterView } from './dataDrivenViews'
import { BindingMapView, ScreenMapView, ScreenReadinessView } from './uiViews'
import { PillarMatrixView, VisionReadinessView } from './visionViews'
import { CutSavingsView, PhaseProgressView } from './roadmapViews'
import { LoopPacingView } from './coreLoopViews'
import { CustomSimulatorView, DifficultyImpactView, PressureOverviewView, TuningBoardView } from './difficultyViews'
import { ActionSimulatorView, FactionFootprintView, RelationsWebView, ReputationScaleView } from './diplomacyViews'
import { BiomeCoverageView, BiomeDossierView, BiomeThreatView, UnlockPathView, WorldAtlasView } from './worldViews'
import { LocationGalleryView } from './locationViews'
import { LocationMapView } from './location/LocationMapView'
import { Icon, PlusChip, type IconName } from '../Icon'
import { useTranslation } from 'react-i18next'
import { useUiVersion } from '../../core/uiVersion'
import { coreFieldKeys, splitByTier } from '../../core/fieldTier'
import { Sheet } from '../v3/Sheet'
import { useSectionToolsSlot } from '../v3/sectionTools'
import { createPortal } from 'react-dom'
import { Segmented } from '../motion'
import { useFreshEntries } from '../hints/useHints'
import { useUiMode } from '../../core/uiMode'
import { countOf } from '../../core/text'

const VIEW_LABEL: Record<CollectionView['kind'], string> = {
  cards: 'Cards',
  table: 'Table',
  kanban: 'Board',
  radar: 'Radar',
  grid2d: 'Matrix',
  timeline: 'Timeline',
  ladder: 'Cut order',
  progression: 'Progression',
  compare: 'Compare',
  ranges: 'Ranges',
  economy: 'Estimate',
  townFlow: 'Resource flow',
  townNetwork: 'Logistics network',
  statPreview: 'Preview',
  needsBalance: 'Needs balance',
  npcPopulation: 'Population',
  npcLifespan: 'Lifespan',
  npcNeedChain: 'Need chain',
  npcWorkforce: 'Workforce map',
  npcRoutine: 'Day plan',
  npcBondLadder: 'Bond ladder',
  npcEventOdds: 'Event odds',
  archLayerStack: 'Layer stack',
  archLayers: 'Layer diagram',
  archMatrix: 'Dependency matrix',
  archCoupling: 'Coupling',
  archMessages: 'Message flow',
  archExtensions: 'Coverage',
  archTicks: 'Tick schedule',
  archBoot: 'Boot sequence',
  codingNaming: 'Rule tester',
  codingFolders: 'Folder tree',
  codingGit: 'Branch flow',
  codingReview: 'Enforcement board',
  dataModel: 'Data model',
  dataTester: 'Record tester',
  dataReadiness: 'Pipeline readiness',
  dataLoadPlan: 'Load plan',
  depletion: 'Depletion',
  levelCurve: 'Level curve',
  skillTree: 'Skill tree',
  buildPlanner: 'Build planner',
  itemCoverage: 'Coverage',
  valuePreview: 'Value preview',
  craftTree: 'Crafting tree',
  rarityCurve: 'Rarity curve',
  lootOdds: 'Loot odds',
  combatSandbox: 'Combat sandbox',
  threatCurve: 'Threat curve',
  weaknessMatrix: 'Weaknesses',
  phaseBars: 'Phase bars',
  dayClock: 'Day clock',
  biomeWeather: 'Weather by biome',
  yearStrip: 'Year strip',
  conditions: 'Conditions simulator',
  priceLadder: 'Price ladder',
  merchantStock: 'Stock coverage',
  wanderingCalendar: 'Wandering calendar',
  moneyFlow: 'Money flow',
  questFlow: 'Quest flow',
  actPacing: 'Act pacing',
  rewardBudget: 'Reward budget',
  endingPaths: 'Ending paths',
  castCoverage: 'Cast coverage',
  wireframe: 'Wireframe',
  screenMap: 'Screen map',
  screenReadiness: 'Readiness',
  bindingMap: 'Binding map',
  pillarMatrix: 'Pillar matrix',
  visionReadiness: 'Readiness',
  phaseProgress: 'Progress',
  cutSavings: 'Savings',
  loopPacing: 'Pacing',
  tuningBoard: 'Tuning board',
  pressureOverview: 'Pressure',
  difficultyImpact: 'Impact',
  customSimulator: 'Simulator',
  relationsWeb: 'Relations web',
  factionFootprint: 'Footprint',
  reputationScale: 'Scale',
  actionSimulator: 'Simulator',
  biomeDossier: 'Dossier',
  worldAtlas: 'Atlas',
  unlockPath: 'Unlock path',
  biomeThreat: 'Threat',
  biomeCoverage: 'Coverage',
  locationGallery: 'Gallery',
  locationMap: 'Map',
}
/** Icons for the common views; every other view is some chart, and keeps its label to tell it apart. */
const VIEW_ICON: Partial<Record<CollectionView['kind'], IconName>> = {
  cards: 'blocks',
  table: 'table',
  kanban: 'board',
  timeline: 'timeline',
  radar: 'target',
  grid2d: 'table',
  worldAtlas: 'map',
  locationMap: 'map',
}

export type ViewProps = {
  docId: string
  sec: CollectionSection
  items: Entity[]
  selected?: string
  onSelect: (id?: string) => void
  patch: (id: string, key: string, value: any) => void
  /** Set for views that show an entity's inputs inside themselves (the location map) instead of beside them. */
  inspectorFor?: (id: string) => ReactNode
}

export function CollectionEditor({ docId, sec }: { docId: string; sec: CollectionSection }) {
  const { data, update } = useSection<Entity[]>(docId, sec.id)
  const project = useProject()
  const [viewIdx, setViewIdx] = useState(0)
  const [selected, setSelected] = useState<string | undefined>()
  // `?e=<id>` (command palette, links) selects that entry; reading it again when it changes.
  const [params, setParams] = useSearchParams()
  const wanted = params.get('e') ?? undefined
  const [wantedSeen, setWantedSeen] = useState<string | undefined>()
  if (wanted !== wantedSeen) {
    setWantedSeen(wanted)
    if (wanted && data?.some((e) => e.id === wanted)) setSelected(wanted)
  }
  const [filter, setFilter] = useState('')
  const [filterOpen, setFilterOpen] = useState(false)
  const items = useMemo(() => data ?? [], [data])
  const view = sec.views[Math.min(viewIdx, sec.views.length - 1)] ?? { kind: 'cards' as const }

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((e) => JSON.stringify(e).toLowerCase().includes(q))
  }, [items, filter])

  const add = (init: Record<string, any> = {}) => {
    const id = makeId()
    update((d) => {
      d.push({ id, name: `New ${sec.singular}`, ...init })
    })
    // v3: hints leave the new entry alone while it is being filled in (grace period, ui/hints/useHints.ts).
    if (v3) useFreshEntries.getState().mark(id)
    setSelected(id)
  }
  const patch = (id: string, key: string, value: any) =>
    update((d) => {
      const e = d.find((x) => x.id === id)
      if (e) {
        if (value === undefined) delete e[key]
        else e[key] = value
      }
    }, `${id}.${key}`)

  const sel = items.find((e) => e.id === selected)
  // The map editor holds the inputs in its own side panel, so the canvas keeps the width.
  const inlineInspector = view.kind === 'locationMap'
  const inspectorFor = (id: string) => {
    const e = items.find((x) => x.id === id)
    return e ? <Inspector key={e.id} docId={docId} sec={sec} entity={e} patch={patch} onClose={() => setSelected(undefined)} setSelected={setSelected} embedded /> : null
  }
  const props: ViewProps = { docId, sec, items: shown, selected, onSelect: setSelected, patch, inspectorFor: inlineInspector ? inspectorFor : undefined }
  // v3 opens the entry in a sheet over the view, so the view keeps its width; v2 shows it beside the view.
  const v3 = useUiVersion() === 'v3'
  const { t } = useTranslation()
  const slot = useSectionToolsSlot()
  const toolsSlot = v3 ? slot : null
  const downloadCsv = () => {
    const mod = getModule(docId)!
    const csv = sectionCsv(project, mod, sec)
    if (csv) downloadText(`${docId}.${sec.id}.csv`, csv, 'text/csv')
  }
  const besideInspector = !!sel && view.kind !== 'wireframe' && !inlineInspector && !v3
  const sheetFor = v3 && view.kind !== 'wireframe' && !inlineInspector ? sel : undefined
  // Closing the sheet also drops `?e=`, so following the same link to the entry opens it again.
  const closeSheet = () => {
    setSelected(undefined)
    if (!params.has('e')) return
    const n = new URLSearchParams(params)
    n.delete('e')
    setParams(n, { replace: true })
  }
  // v3 "Expand to page": `?r=<id>` shows that entry full-width instead of the view (deep-linkable).
  const pageId = v3 ? params.get('r') : null
  const pageEntity = pageId ? items.find((e) => e.id === pageId) : undefined
  // Leaving an entry (selecting another, closing it) ends its grace period; opening it as a page does not.
  const prevSelected = useRef(selected ?? pageId ?? undefined)
  useEffect(() => {
    const now = selected ?? pageId ?? undefined
    const prev = prevSelected.current
    if (prev && prev !== now) useFreshEntries.getState().release(prev)
    prevSelected.current = now
  }, [selected, pageId])
  const setPage = (id?: string, thenSelect?: string) => {
    const n = new URLSearchParams(params)
    n.delete('e')
    if (id) n.set('r', id)
    else n.delete('r')
    setParams(n)
    setSelected(thenSelect)
  }
  if (pageEntity)
    return (
      <div className="collection record3-pagewrap">
        <RecordSheet
          asPage
          docId={docId}
          sec={sec}
          entity={pageEntity}
          items={items}
          patch={patch}
          onClose={() => setPage(undefined)}
          onToggleExpand={() => setPage(undefined, pageEntity.id)}
          setSelected={(id) => setPage(id)}
        />
      </div>
    )

  return (
    <div className="collection">
      {toolsSlot ? createPortal(
        // v3: the tools join the section header's row (views as a segmented switch, per the conventions).
        <div className="sec3-coll-tools">
          {sec.views.length > 1 && (
            <Segmented role="group" aria-label={t('v3.collection.views')} className="prominent">
              {sec.views.map((vw, i) => (
                <button key={i} type="button" data-guide={`view-${vw.kind}`} aria-pressed={i === viewIdx} aria-label={VIEW_LABEL[vw.kind]} title={VIEW_LABEL[vw.kind]} onClick={() => setViewIdx(i)}>
                  <Icon name={VIEW_ICON[vw.kind] ?? 'chart'} />
                  <span className="seg-label">{VIEW_LABEL[vw.kind]}</span>
                </button>
              ))}
            </Segmented>
          )}
          {/* The filter folds to a button while empty; the count lives in the section header's line. */}
          {filterOpen || filter ? (
            <input autoFocus className="search sec3-filter" aria-label={t('v3.collection.filter')} placeholder={`${t('v3.collection.filter')}…`} value={filter}
              onChange={(e) => setFilter(e.target.value)} onBlur={() => !filter && setFilterOpen(false)} onKeyDown={(e) => e.key === 'Escape' && (setFilter(''), setFilterOpen(false))} />
          ) : (
            <button type="button" className="icon-btn" aria-label={t('v3.collection.filter')} title={t('v3.collection.filter')} onClick={() => setFilterOpen(true)}><Icon name="search" /></button>
          )}
          <button type="button" className="icon-btn" aria-label={t('v3.collection.csv')} title={t('v3.collection.csv')} onClick={downloadCsv}><Icon name="download" /></button>
          {items.length > 0 && <button type="button" className="primary" data-guide="add" onClick={() => add()}><PlusChip /> {t('v3.collection.add', { what: sec.singular })}</button>}
        </div>,
        toolsSlot,
      ) : (
        <div className="toolbar">
          <div className="tabs">
            {sec.views.map((vw, i) => (
              <button key={i} data-guide={`view-${vw.kind}`} className={i === viewIdx ? 'active' : ''} onClick={() => setViewIdx(i)}>
                {VIEW_LABEL[vw.kind]}
              </button>
            ))}
          </div>
          <input className="search" placeholder="Filter…" value={filter} onChange={(e) => setFilter(e.target.value)} />
          <span className="muted">{countOf(items.length, sec.singular, sec.plural)}</span>
          <span className="spacer" />
          <button className="small" onClick={downloadCsv}>
            CSV
          </button>
          {items.length > 0 && <button className="primary" data-guide="add" onClick={() => add()}><PlusChip /> Add {sec.singular}</button>}
        </div>
      )}
      <div className={'collection-body' + (besideInspector ? ' with-inspector' : '')}>
        <div className="view-area">
          <CollectionViewBody view={view} props={props} onAdd={add} />
          {items.length === 0 && <GuideEmpty docId={docId} sectionId={sec.id} singular={sec.singular} onAdd={() => add()} />}
        </div>
        {besideInspector && sel && <Inspector key={sel.id} docId={docId} sec={sec} entity={sel} patch={patch} onClose={() => setSelected(undefined)} setSelected={setSelected} />}
        {sheetFor && <RecordSheet docId={docId} sec={sec} entity={sheetFor} items={shown.some((e) => e.id === sheetFor.id) ? shown : items} patch={patch} onClose={closeSheet} onToggleExpand={() => setPage(sheetFor.id)} setSelected={setSelected} />}
      </div>
    </div>
  )
}

/** Draws one collection view; shared by the editor and the read-only Project Book. */
export function CollectionViewBody({ view, props, onAdd }: { view: CollectionView; props: ViewProps; onAdd: (init?: Record<string, any>) => void }) {
  return (
    <>
      {view.kind === 'cards' && <CardsView {...props} />}
      {view.kind === 'table' && <TableView {...props} columns={view.columns} />}
      {view.kind === 'kanban' && <KanbanView {...props} groupBy={view.groupBy} onAdd={onAdd} />}
      {view.kind === 'radar' && <RadarView {...props} mapField={view.mapField} scale={view.scale} />}
      {view.kind === 'statPreview' && <StatPreviewView {...props} view={view} />}
      {view.kind === 'needsBalance' && <NeedsBalanceView {...props} view={view} />}
      {view.kind === 'npcPopulation' && <PopulationView {...props} />}
      {view.kind === 'npcLifespan' && <LifespanView {...props} />}
      {view.kind === 'npcNeedChain' && <NeedChainView {...props} />}
      {view.kind === 'npcWorkforce' && <WorkforceView {...props} />}
      {view.kind === 'npcRoutine' && <RoutineView {...props} />}
      {view.kind === 'npcBondLadder' && <BondLadderView {...props} />}
      {view.kind === 'npcEventOdds' && <EventOddsView {...props} />}
      {view.kind === 'archLayerStack' && <LayerStackView {...props} />}
      {view.kind === 'archLayers' && <LayerDiagramView {...props} />}
      {view.kind === 'archMatrix' && <DependencyMatrixView {...props} />}
      {view.kind === 'archCoupling' && <CouplingView {...props} />}
      {view.kind === 'archMessages' && <MessageFlowView {...props} />}
      {view.kind === 'archExtensions' && <ExtensionCoverageView {...props} />}
      {view.kind === 'archTicks' && <TickScheduleView {...props} />}
      {view.kind === 'archBoot' && <BootSequenceView {...props} />}
      {view.kind === 'codingNaming' && <NamingTesterView {...props} />}
      {view.kind === 'codingFolders' && <FolderTreeView {...props} />}
      {view.kind === 'codingGit' && <BranchFlowView {...props} />}
      {view.kind === 'codingReview' && <EnforcementBoardView {...props} />}
      {view.kind === 'dataModel' && <DataModelView {...props} />}
      {view.kind === 'dataTester' && <RecordTesterView {...props} />}
      {view.kind === 'dataReadiness' && <PipelineReadinessView {...props} />}
      {view.kind === 'dataLoadPlan' && <LoadPlanView {...props} />}
      {view.kind === 'depletion' && <DepletionView {...props} />}
      {view.kind === 'levelCurve' && <LevelCurveView />}
      {view.kind === 'skillTree' && <SkillTreeView {...props} />}
      {view.kind === 'buildPlanner' && <BuildPlannerView {...props} />}
      {view.kind === 'itemCoverage' && <CoverageView {...props} />}
      {view.kind === 'valuePreview' && <ValuePreviewView {...props} />}
      {view.kind === 'craftTree' && <CraftTreeView {...props} />}
      {view.kind === 'rarityCurve' && <RarityCurveView {...props} />}
      {view.kind === 'lootOdds' && <LootOddsView {...props} />}
      {view.kind === 'combatSandbox' && <CombatSandboxView {...props} />}
      {view.kind === 'threatCurve' && <ThreatCurveView {...props} />}
      {view.kind === 'weaknessMatrix' && <WeaknessMatrixView {...props} />}
      {view.kind === 'phaseBars' && <PhaseBarsView {...props} />}
      {view.kind === 'dayClock' && <DayClockView {...props} />}
      {view.kind === 'biomeWeather' && <BiomeWeatherView {...props} />}
      {view.kind === 'yearStrip' && <YearStripView {...props} />}
      {view.kind === 'conditions' && <ConditionsView />}
      {view.kind === 'priceLadder' && <PriceLadderView {...props} />}
      {view.kind === 'merchantStock' && <MerchantStockView {...props} />}
      {view.kind === 'wanderingCalendar' && <WanderingCalendarView {...props} />}
      {view.kind === 'moneyFlow' && <MoneyFlowView />}
      {view.kind === 'questFlow' && <QuestFlowView {...props} />}
      {view.kind === 'actPacing' && <ActPacingView {...props} />}
      {view.kind === 'rewardBudget' && <RewardBudgetView />}
      {view.kind === 'endingPaths' && <EndingPathsView {...props} />}
      {view.kind === 'castCoverage' && <CastCoverageView {...props} />}
      {view.kind === 'wireframe' && <WireframeView {...props} />}
      {view.kind === 'screenMap' && <ScreenMapView {...props} />}
      {view.kind === 'screenReadiness' && <ScreenReadinessView {...props} />}
      {view.kind === 'bindingMap' && <BindingMapView {...props} />}
      {view.kind === 'pillarMatrix' && <PillarMatrixView {...props} />}
      {view.kind === 'visionReadiness' && <VisionReadinessView />}
      {view.kind === 'phaseProgress' && <PhaseProgressView {...props} />}
      {view.kind === 'cutSavings' && <CutSavingsView {...props} />}
      {view.kind === 'loopPacing' && <LoopPacingView {...props} />}
      {view.kind === 'tuningBoard' && <TuningBoardView {...props} />}
      {view.kind === 'pressureOverview' && <PressureOverviewView {...props} />}
      {view.kind === 'difficultyImpact' && <DifficultyImpactView />}
      {view.kind === 'customSimulator' && <CustomSimulatorView {...props} />}
      {view.kind === 'relationsWeb' && <RelationsWebView {...props} />}
      {view.kind === 'factionFootprint' && <FactionFootprintView {...props} />}
      {view.kind === 'reputationScale' && <ReputationScaleView {...props} />}
      {view.kind === 'actionSimulator' && <ActionSimulatorView {...props} />}
      {view.kind === 'biomeDossier' && <BiomeDossierView {...props} />}
      {view.kind === 'worldAtlas' && <WorldAtlasView {...props} />}
      {view.kind === 'unlockPath' && <UnlockPathView {...props} />}
      {view.kind === 'biomeThreat' && <BiomeThreatView {...props} />}
      {view.kind === 'biomeCoverage' && <BiomeCoverageView {...props} />}
      {view.kind === 'locationGallery' && <LocationGalleryView {...props} />}
      {view.kind === 'locationMap' && <LocationMapView {...props} />}
      {view.kind === 'grid2d' && <Grid2dView {...props} xField={view.xField} yField={view.yField} max={view.max} />}
      {view.kind === 'timeline' && <TimelineView {...props} view={view} />}
      {view.kind === 'ladder' && <LadderView {...props} orderField={view.orderField} linkFields={view.linkFields} />}
      {view.kind === 'progression' && <ProgressionView {...props} scaleField={view.scaleField} leadsField={view.leadsField} />}
      {view.kind === 'compare' && <CompareView {...props} valuesSection={view.valuesSection} columns={view.columns} />}
      {view.kind === 'ranges' && <RangesView {...props} view={view} />}
      {view.kind === 'economy' && <EconomyView />}
      {view.kind === 'townFlow' && <TownResourceFlowView {...props} />}
      {view.kind === 'townNetwork' && <TownNetworkView {...props} />}
    </>
  )
}

/** Delete (with a warning when referenced), duplicate and reorder one entry; shared by the inspector and the v3 record sheet. */
function useEntityActions(docId: string, sec: CollectionSection, entity: Entity, setSelected: (id?: string) => void, onClose: () => void) {
  const { update } = useSection<Entity[]>(docId, sec.id)
  const project = useProject()
  const usages = useMemo(() => findUsages(project, entity.id), [project, entity.id])
  const remove = () => {
    const msg = usages.length
      ? `“${entity.name}” is referenced ${countOf(usages.length, 'time')}. Delete anyway? (references will show as missing)`
      : `Delete “${entity.name}”?`
    if (!confirm(msg)) return
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      if (i >= 0) d.splice(i, 1)
    })
    onClose()
  }
  const duplicate = () => {
    const id = makeId()
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      d.splice(i + 1, 0, { ...JSON.parse(JSON.stringify(entity)), id, name: `${entity.name} (copy)` })
    })
    setSelected(id)
  }
  const move = (dir: -1 | 1) =>
    update((d) => {
      const i = d.findIndex((x) => x.id === entity.id)
      const j = i + dir
      if (j < 0 || j >= d.length) return
      ;[d[i], d[j]] = [d[j], d[i]]
    })
  return { usages, remove, duplicate, move }
}

/** "Used by": every place that references the entry, as links. */
function UsedBy({ usages }: { usages: ReturnType<typeof findUsages> }) {
  if (!usages.length) return <span className="muted">Not referenced anywhere.</span>
  return (
    <ul className="usages">
      {usages.map((u, i) => (
        <li key={i}>
          <Link to={`/doc/${u.docId}?s=${u.sectionId}`}>{u.docTitle} › {u.sectionTitle} › {u.entityLabel}</Link> <span className="muted">({u.field})</span>
        </li>
      ))}
    </ul>
  )
}

/** One labelled input of an entry, with its help line. */
function EntityField({ docId, entity, field: f, patch }: { docId: string; entity: Entity; field: FieldDef; patch: ViewProps['patch'] }) {
  return (
    <div className={'field' + (f.type === 'boolean' ? ' inline' : '')}>
      <label htmlFor={`${docId}-${entity.id}-${f.key}`}>
        {f.label}
        {f.required && <span className="req"> *</span>}
      </label>
      <FieldInput
        id={`${docId}-${entity.id}-${f.key}`}
        describedBy={f.help ? `${docId}-${entity.id}-${f.key}-help` : undefined}
        field={f}
        value={entity[f.key]}
        docId={docId}
        onChange={(v) => patch(entity.id, f.key, v)}
      />
      {f.help && <small className="muted" id={`${docId}-${entity.id}-${f.key}-help`}>{f.help}</small>}
    </div>
  )
}

const LINKS_TAB = '__links'
const BASICS_TAB = '__basics'

/**
 * v3 record sheet (plans/UI_V3_PLAN.md, Screen 3): the selected entry slides over the view, which keeps its
 * width. Field groups are tabs with fill counts; inside a tab only core fields, filled fields and fields the
 * user opened show, the rest wait behind "+ field" chips. ‹ › steps through the entries in view order.
 */
function RecordSheet({ docId, sec, entity, items, patch, onClose, onToggleExpand, setSelected, asPage = false }: {
  docId: string
  sec: CollectionSection
  entity: Entity
  /** The entries in the order the view shows them, for ‹ › stepping. */
  items: Entity[]
  patch: ViewProps['patch']
  onClose: () => void
  /** Sheet → full page, or page → back to the sheet. */
  onToggleExpand?: () => void
  setSelected: (id?: string) => void
  /** Full-width page (`?r=`) instead of a sheet over the view. */
  asPage?: boolean
}) {
  const { t } = useTranslation()
  const project = useProject()
  const hidden = hiddenGroups(project, docId, sec, entity)
  const { usages, remove, duplicate } = useEntityActions(docId, sec, entity, setSelected, onClose)
  const core = useMemo(() => coreFieldKeys(sec.fields), [sec.fields])
  const [opened, setOpened] = useState<Set<string>>(() => new Set())
  // The name sits above the tabs (the sheet's editable heading); then one tab per field group the entry's
  // type uses (other ungrouped fields first), then the links.
  const nameField = sec.fields.find((f) => f.key === 'name')
  const tabs: { id: string; label: string; fields: FieldDef[] }[] = []
  for (const f of sec.fields) {
    if (f === nameField || (f.group && hidden.has(f.group))) continue
    const id = f.group ?? BASICS_TAB
    const tab = tabs.find((x) => x.id === id) ?? (tabs.push({ id, label: f.group ?? t('v3.record.basics'), fields: [] }), tabs[tabs.length - 1])
    tab.fields.push(f)
  }
  tabs.push({ id: LINKS_TAB, label: t('v3.record.links'), fields: [] })
  const [tabId, setTabId] = useState(tabs[0].id)
  const tab = tabs.find((x) => x.id === tabId) ?? tabs[0]
  // Studio shows every field; Guided keeps empty detail fields behind chips.
  const studio = useUiMode() === 'studio'
  const { shown, hidden: more } = studio ? { shown: tab.fields, hidden: [] as FieldDef[] } : splitByTier(tab.fields, entity, opened, core)
  const at = items.findIndex((e) => e.id === entity.id)
  const step = (d: number) => items.length > 1 && setSelected(items[(at + d + items.length) % items.length].id)
  const name = String(entity.name ?? '').trim()

  return (
    <Sheet
      label={`${sec.singular}: ${name || t('v3.record.unnamed')}`}
      eyebrow={<>{sec.singular}{at >= 0 && <> · {t('v3.record.position', { n: at + 1, total: items.length })}</>} <AiBadge entity={entity} /></>}
      title={name || t('v3.record.unnamed')}
      onClose={onClose}
      onPrev={items.length > 1 ? () => step(-1) : undefined}
      onNext={items.length > 1 ? () => step(1) : undefined}
      prevLabel={t('v3.record.prev', { what: sec.singular })}
      nextLabel={t('v3.record.next', { what: sec.singular })}
      mode={asPage ? 'split' : 'overlay'}
      width={asPage ? '100%' : 520}
      // A just-added entry still has its placeholder name: select it so typing replaces it.
      selectFirst={!!useFreshEntries.getState().until[entity.id]}
      actions={onToggleExpand && (
        <button type="button" className="icon-btn" aria-label={t(asPage ? 'v3.record.collapse' : 'v3.record.expand')} title={t(asPage ? 'v3.record.collapse' : 'v3.record.expand')} onClick={onToggleExpand}>
          <Icon name={asPage ? 'shrink' : 'expand'} />
        </button>
      )}
      footer={
        <>
          <button type="button" className="ghost" onClick={duplicate}>{t('v3.record.duplicate')}</button>
          <span className="spacer" />
          <button type="button" className="ghost danger" onClick={remove}>{t('v3.record.delete')}</button>
        </>
      }
    >
      {nameField && <div className="form record3-name"><EntityField docId={docId} entity={entity} field={nameField} patch={patch} /></div>}
      {/* ARIA tabs: one Tab stop; ← → Home End switch tab and move focus. */}
      <div className="record3-tabs" role="tablist" aria-label={t('v3.record.groups')} onKeyDown={(e) => {
        const at = tabs.findIndex((x) => x.id === tab.id)
        const to = e.key === 'ArrowRight' ? (at + 1) % tabs.length : e.key === 'ArrowLeft' ? (at - 1 + tabs.length) % tabs.length : e.key === 'Home' ? 0 : e.key === 'End' ? tabs.length - 1 : -1
        if (to < 0) return
        e.preventDefault()
        setTabId(tabs[to].id)
        requestAnimationFrame(() => document.getElementById(`rt-${tabs[to].id}`)?.focus())
      }}>
        {tabs.map((x) => {
          const filled = x.fields.filter((f) => !isBlankValue(entity[f.key])).length
          return (
            <button key={x.id} type="button" role="tab" id={`rt-${x.id}`} aria-selected={x.id === tab.id} aria-controls="record3-panel" tabIndex={x.id === tab.id ? 0 : -1} onClick={() => setTabId(x.id)}>
              {x.label}
              {x.id === LINKS_TAB ? (usages.length > 0 && <span className="record3-count">{usages.length}</span>) : <span className="record3-count">{filled}/{x.fields.length}</span>}
            </button>
          )
        })}
      </div>
      <div className="form record3-panel" role="tabpanel" id="record3-panel" aria-labelledby={`rt-${tab.id}`}>
        {tab.id === LINKS_TAB ? (
          <>
            {docId === 'overview.roadmap' && sec.id === 'gates' && <GateReadiness entity={entity} />}
            {docId === 'design.items' && sec.id === 'items' && <ItemLinks item={entity} />}
            {docId === 'design.combat' && (sec.id === 'enemies' || sec.id === 'bosses') && <CombatLinks entity={entity} boss={sec.id === 'bosses'} />}
            <div className="field">
              <label>Used by</label>
              <UsedBy usages={usages} />
            </div>
          </>
        ) : (
          <>
            {shown.map((f) => <EntityField key={f.key} docId={docId} entity={entity} field={f} patch={patch} />)}
            {more.length > 0 && (
              <div className="add-detail" role="group" aria-label={t('v3.record.moreDetail')}>
                <span className="muted">{t('v3.record.moreDetail')}</span>
                {more.map((f) => (
                  <button key={f.key} type="button" className="chip-add" onClick={() => {
                    setOpened(new Set(opened).add(f.key))
                    requestAnimationFrame(() => document.getElementById(`${docId}-${entity.id}-${f.key}`)?.focus())
                  }}>+ {f.label}</button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </Sheet>
  )
}

function Inspector({
  docId,
  sec,
  entity,
  patch,
  onClose,
  setSelected,
  embedded,
}: {
  docId: string
  sec: CollectionSection
  entity: Entity
  patch: ViewProps['patch']
  onClose: () => void
  setSelected: (id?: string) => void
  /** Shown inside a view's own panel: no frame and no Close button. */
  embedded?: boolean
}) {
  const project = useProject()
  const groups = fieldGroups(sec.fields)
  const hidden = hiddenGroups(project, docId, sec, entity)
  const { usages, remove, duplicate, move } = useEntityActions(docId, sec, entity, setSelected, onClose)

  return (
    <aside className={'inspector' + (embedded ? ' embedded' : '')}>
      <div className="inspector-head">
        <strong>{sec.singular}</strong>
        <AiBadge entity={entity} />
        <span className="spacer" />
        <button className="icon" title="Move up" onClick={() => move(-1)}>↑</button>
        <button className="icon" title="Move down" onClick={() => move(1)}>↓</button>
        <button className="small" onClick={duplicate}>Duplicate</button>
        <button className="small danger" onClick={remove}>Delete</button>
        {!embedded && <button className="icon icon-btn" aria-label="Close" title="Close" onClick={onClose}><Icon name="close" /></button>}
      </div>
      <div className="form">
        {[...groups.filter((g) => !g.group || !hidden.has(g.group)), ...groups.filter((g) => g.group && hidden.has(g.group))].map(({ group, fields }) => {
          const body = fields.map((f) => (
            <div key={f.key} className={'field' + (f.type === 'boolean' ? ' inline' : '')}>
              <label htmlFor={`${docId}-${entity.id}-${f.key}`}>
                {f.label}
                {f.required && <span className="req"> *</span>}
              </label>
              <FieldInput
                id={`${docId}-${entity.id}-${f.key}`}
                describedBy={f.help ? `${docId}-${entity.id}-${f.key}-help` : undefined}
                field={f}
                value={entity[f.key]}
                docId={docId}
                onChange={(v) => patch(entity.id, f.key, v)}
              />
              {f.help && <small className="muted" id={`${docId}-${entity.id}-${f.key}-help`}>{f.help}</small>}
            </div>
          ))
          if (!group) return body
          const filled = fields.filter((f) => !isBlankValue(entity[f.key])).length
          const off = hidden.has(group)
          return (
            <details key={group} className={'field-group' + (off ? ' off' : '')} open={!off} data-testid={`group-${group}`}>
              <summary>
                {group} <span className="muted">{filled}/{fields.length}{off ? ' · not used by this type' : ''}</span>
              </summary>
              {body}
            </details>
          )
        })}
        {docId === 'overview.roadmap' && sec.id === 'gates' && <GateReadiness entity={entity} />}
        {docId === 'design.items' && sec.id === 'items' && <ItemLinks item={entity} />}
        {docId === 'design.combat' && (sec.id === 'enemies' || sec.id === 'bosses') && <CombatLinks entity={entity} boss={sec.id === 'bosses'} />}
        <div className="field">
          <label>Used by</label>
          {usages.length === 0 ? (
            <span className="muted">Not referenced anywhere.</span>
          ) : (
            <ul className="usages">
              {usages.map((u, i) => (
                <li key={i}>
                  <Link to={`/doc/${u.docId}?s=${u.sectionId}`}>{u.docTitle} › {u.sectionTitle} › {u.entityLabel}</Link> <span className="muted">({u.field})</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </aside>
  )
}

const isBlankValue = (v: unknown) =>
  v === undefined || v === null || v === '' || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v as object).length === 0)

/** Consecutive runs of fields that share a `group`; ungrouped fields form runs with `group` undefined. */
export function fieldGroups(fields: FieldDef[]): { group?: string; fields: FieldDef[] }[] {
  const out: { group?: string; fields: FieldDef[] }[] = []
  for (const f of fields) {
    const last = out[out.length - 1]
    if (last && last.group === f.group) last.fields.push(f)
    else out.push({ group: f.group, fields: [f] })
  }
  return out
}

function summary(project: ReturnType<typeof useProject>, docId: string, sec: CollectionSection, e: Entity) {
  return sec.fields
    .filter((f) => f.key !== 'name' && f.type !== 'color')
    .map((f) => ({ f, t: displayValue(project, docId, f, e) }))
    .filter((x) => x.t)
    .slice(0, 3)
}

function CardsView({ docId, sec, items, selected, onSelect }: ViewProps) {
  const project = useProject()
  const colorField = sec.fields.find((f) => f.type === 'color')
  return (
    <div className="cards">
      {items.map((e) => (
        <div key={e.id} className={'card' + (e.id === selected ? ' selected' : '')} onClick={() => onSelect(e.id)} style={colorField && e[colorField.key] ? { borderTopColor: e[colorField.key] } : undefined}>
          <div className="card-title">{e.name || <em>unnamed</em>}<AiBadge entity={e} /></div>
          {summary(project, docId, sec, e).map(({ f, t }) => (
            <div key={f.key} className="card-line">
              <span className="muted">{f.label}: </span>
              {t.length > 90 ? t.slice(0, 90) + '…' : t}
            </div>
          ))}
          {sec.fields.filter((f) => f.type === 'color').length > 1 && (
            <div className="swatches">
              {sec.fields.filter((f) => f.type === 'color' && e[f.key]).map((f) => <span key={f.key} style={{ background: e[f.key] }} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

function TableView({ docId, sec, items, selected, onSelect, patch, columns }: ViewProps & { columns?: string[] }) {
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 } | null>(null)
  const project = useProject()
  const cols: FieldDef[] = (columns ? columns.map((k) => sec.fields.find((f) => f.key === k)).filter(Boolean) : sec.fields.filter((f) => !isLongField(f) || f.type === 'multiref')) as FieldDef[]
  const rows = useMemo(() => {
    if (!sort) return items
    return [...items].sort((a, b) => {
      const f = sec.fields.find((x) => x.key === sort.key)!
      const av = displayValue(project, docId, f, a)
      const bv = displayValue(project, docId, f, b)
      const an = Number(av), bn = Number(bv)
      return (Number.isNaN(an) || Number.isNaN(bn) ? av.localeCompare(bv) : an - bn) * sort.dir
    })
  }, [items, sort, sec.fields, project, docId])

  return (
    <div className="table-wrap">
      <table className="grid">
        <thead>
          <tr>
            {cols.map((c) => (
              <th key={c.key} onClick={() => setSort((s) => (s?.key === c.key ? { key: c.key, dir: (s.dir * -1) as 1 | -1 } : { key: c.key, dir: 1 }))}>
                {c.label} {sort?.key === c.key ? (sort.dir === 1 ? '▲' : '▼') : ''}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={e.id} className={e.id === selected ? 'selected' : ''} onClick={() => onSelect(e.id)}>
              {cols.map((c) => (
                <td key={c.key} onClick={(ev) => c.type !== 'text' && c.type !== 'number' && ev.stopPropagation()}>
                  {['text', 'number', 'enum', 'ref', 'boolean'].includes(c.type) ? (
                    <FieldInput field={c} value={e[c.key]} docId={docId} compact label={`${c.label}: ${String(e.name ?? '').trim() || sec.singular}`} onChange={(v) => patch(e.id, c.key, v)} />
                  ) : (
                    <span className="cell-text">{displayValue(project, docId, c, e)}</span>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function KanbanView({ docId, sec, items, selected, onSelect, patch, groupBy, onAdd }: ViewProps & { groupBy: string; onAdd: (init: Record<string, any>) => void }) {
  const project = useProject()
  const field = sec.fields.find((f) => f.key === groupBy)
  const [over, setOver] = useState<string | null>(null)
  // A card that moved to another column (or was just added) settles in where it lands.
  const landed = useNewlyAdded(items.map((e) => `${e[groupBy] ?? ''}:${e.id}`), 400)
  if (!field) return <p className="empty">Group field “{groupBy}” not found.</p>
  const columns: { id: string; label: string }[] =
    field.type === 'enum' ? field.options.map((o) => ({ id: o, label: o })) : field.type === 'ref' ? resolveSource(project, docId, field.source) : []
  const all = [{ id: '', label: '— none —' }, ...columns]
  const known = new Set(columns.map((c) => c.id))

  return (
    <div className="kanban">
      {all.map((col) => {
        const list = items.filter((e) => (col.id === '' ? !e[groupBy] || !known.has(e[groupBy]) : e[groupBy] === col.id))
        if (col.id === '' && list.length === 0) return null
        return (
          <div
            key={col.id}
            className={'kanban-col' + (over === col.id ? ' over' : '')}
            onDragOver={(ev) => { ev.preventDefault(); setOver(col.id) }}
            onDragLeave={() => setOver(null)}
            onDrop={(ev) => {
              ev.preventDefault()
              setOver(null)
              const id = ev.dataTransfer.getData('text/plain')
              if (id) patch(id, groupBy, col.id || undefined)
            }}
          >
            <div className="kanban-head">
              <strong>{col.label}</strong> <span className="muted">{list.length}</span>
              {col.id !== '' && <button className="icon" title="Add here" onClick={() => onAdd({ [groupBy]: col.id })}>＋</button>}
            </div>
            {list.map((e) => (
              <div
                key={e.id}
                draggable
                onDragStart={(ev) => {
                  ev.dataTransfer.setData('text/plain', e.id)
                  dragCue.start(ev)
                }}
                onDragEnd={dragCue.end}
                className={'card small-card' + (e.id === selected ? ' selected' : '') + (landed.has(`${e[groupBy] ?? ''}:${e.id}`) ? ' landed' : '')}
                onClick={() => onSelect(e.id)}
              >
                <div className="card-title">{e.name}<AiBadge entity={e} /></div>
                {summary(project, docId, sec, e).filter((x) => x.f.key !== groupBy).slice(0, 2).map(({ f, t }) => (
                  <div key={f.key} className="card-line"><span className="muted">{f.label}: </span>{t.length > 50 ? t.slice(0, 50) + '…' : t}</div>
                ))}
              </div>
            ))}
          </div>
        )
      })}
    </div>
  )
}
