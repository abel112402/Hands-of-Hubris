# Személyiség-terv: élet, kedvesség, egy csipet humor

Állapot: javaslat · 2026-11-09 · a `MOTION_PLAN.md` „progress moments” részére épít (a mozgás és a szöveg ugyanazt a pillanatot jelöli)

## 1. Hol tartunk

Az app szövegei jelenleg pontosak, de semlegesek: „Még nincs itt semmi.”, „Jelenleg nincs tipp.”, „Betöltés…”, „Minden mentve”. Ez jó alap, mert **minden fontos szöveg i18n-ben van** (`src/core/i18n/hu.json`, `en.json`), így a személyiség nagyrészt kódváltoztatás nélkül, szövegként vihető be.

A cél nem az, hogy az app „vicces” legyen, hanem az, hogy **legyen benne valaki**: egy tapasztalt, kicsit fáradt, de jóindulatú játéktervező kolléga, aki látott már scope creepet, és akinek a projekt neve (*Hands of Hubris*) maga is önirónia.

## 2. A hang (voice & tone)

**Karakter:** a „régi motoros game designer” a szomszéd asztalnál. Száraz, meleg, önironikus. A felhasználóval van, nem rajta nevet.

| Szabály | Jó példa | Rossz példa |
|---|---|---|
| A felhasználó mellett áll, nem fölötte | „Üres lap. A legjobb GDD-k is így kezdődtek.” | „Még semmit nem csináltál?” |
| A humor a játékfejlesztésről szól, nem a felhasználóról | „Ez a fázis 3 emberhéttel túl van. Klasszikus.” | „Nem tudsz becsülni.” |
| Rövid: max. ~90 karakter, egy mondat + egy csavar | „Minden mentve. A hubris még nem.” | Háromsoros poén |
| A tényt nem helyettesíti, csak kíséri | Cím marad tárgyszerű, a csavar alcímben | A hiba oka egy poénban elbújik |
| Ritka | Max. 1 kiszólás egy nézetben egyszerre | Minden gombon egy szóvicc |

**Ahol TILOS a humor** (ezek maradnak szárazak):
- hibák, adatvesztés-veszély, megerősítő dialógusok (`signOutUnsaved`, `leaveUnsaved`, törlés);
- AI-kulcs, felhő-hitelesítés, biztonsági szövegek;
- validációs/import figyelmeztetések (Zod hibák, migrációs warningok);
- exportált tartalom (Markdown/JSON export): a tervdokumentum a felhasználóé, abba nem kerül kiszólás.

## 3. Architektúra (kicsi és tesztelhető)

### 3.1 `src/core/flavor/` modul

```ts
// src/core/flavor/pick.ts
export type FlavorLevel = 'off' | 'subtle' | 'full'
export function pickFlavor(key: string, opts: { seed: string; level: FlavorLevel }): string | null
```

- A szövegek i18n-ben, **tömbként** élnek: `flavor.empty.generic: ["…", "…", "…"]`, kiolvasás `t(key, { returnObjects: true })`.
- **Determinisztikus választás:** `hash(key + seed) % tömb.length`, ahol a `seed` = napi dátum + projekt-id (+ elem-id, ha van). Így egy újrarenderelés nem váltja a mondatot (nincs villogás), de holnap már más jön. Tesztben a seed fix.
- **Nem ismétlődik egymás után:** az utoljára mutatott index kulcsonként `sessionStorage`-ben.
- **Frekvenciakorlát** a „pillanat”-típusú kiszólásokra (mérföldkő, easter egg): globálisan max. 1 / 3 perc, egy `flavorStore` (Zustand, nem a projekt store-ban: ez UI-állapot, nem kerülhet undo/redo-ba, autosave-be, exportba).

### 3.2 Beállítás

`SettingsPage` → új sor: **Személyiség: Ki · Finom · Teljes** (alapértelmezés: *Finom*). Tárolás `localStorage`-ben (`hohplan:flavor`), ugyanúgy, mint a nyelv (`hohplan:lang`).
- *Ki:* minden a mai semleges szöveg.
- *Finom:* üres állapotok, betöltés, „minden kész” állapotok.
- *Teljes:* + mérföldkövek, napszak-köszönés, easter eggek.

### 3.3 Komponens

`<Flavor k="flavor.empty.npc" fallback={t('guide.empty')} />`: ha a szint `off`, vagy nincs fordítás, a fallbacket mutatja. `className="flavor"` → halványabb, dőlt alcím-stílus a `styles.css`-ben, hogy vizuálisan is elváljon a tényszövegtől.

### 3.4 Fordítás

A magyar szöveg **nem fordítás, hanem saját írás**. A tömbök hossza nyelvenként eltérhet, a szójátékok nyelvspecifikusak. Ha egy kulcs csak az egyik nyelven létezik, a komponens a semleges fallbackre esik vissza.

## 4. Érintési pontok, prioritás szerint

### P1: Üres állapotok és „minden kész” (olcsó, nagy hatás)

| Hol | Mai szöveg | Példa kiszólások (HU) | (EN) |
|---|---|---|---|
| `guide.empty` (általános) | „Még nincs itt semmi.” | „Üres lap. A legjobb GDD-k is így kezdődtek.” · „Itt még csak a lehetőség lakik.” | "A blank page. Every great GDD started here." |
| `hints.allClear` | „Ezen az oldalon nincs teendő.” | „Tiszta terv. Gyanúsan tiszta.” · „A Tippek most hátradőlnek egy kávéra.” | "Spotless. Suspiciously spotless." |
| `hints.none` | „Jelenleg nincs tipp.” | „Nincs tipp. Ez vagy nagyon jó, vagy nagyon üres.” | "No hints. Either very good or very empty." |
| `guide.allDone` | „Minden lépés kész…” (marad) + alcím | „Kész a terv. Most jön a nehéz rész: megcsinálni.” | "The plan is done. Now the easy part: building it. (Kidding.)" |
| `cloud.projects.empty` | (marad) + alcím | „Még egyetlen nagyratörő terv sincs itt. Változtassunk ezen.” | |

**Modulonkénti üres állapot** (`flavor.empty.<modul>`), mind tárgyszerű cím alatt, alcímként:
- **NPC:** „Ez a város még szellemváros. Szó szerint.”
- **Combat:** „Még senki sem ütött meg senkit. Békés kezdet.”
- **Items:** „Az inventory üres. A hős még a bot-fázisban van.”
- **Story/Quests:** „Még nincs küldetés. Senkinek sem kell 10 farkasbőr.”
- **Trade/Economy:** „Nincs gazdaság. Az infláció legalább nulla.”
- **Diplomacy:** „Még senki nem hadakozik. Egyelőre.”
- **Difficulty:** „Nehézség még nincs. Csak a tervezés nehéz.”
- **Time & Weather:** „Örök délután, felhőtlen ég. Unalmas, de szép.”
- **Roadmap:** „Nincs ütemterv, tehát még nincs csúszás sem.”
- **Open Questions:** „Nincs nyitott kérdés? Ez a legnagyobb kérdés.”
- **Vision:** „A vízió még homályos. Mint minden vízió az elején.”

### P2: Várakozás és mentés

- **Betöltés** (`cloud.loading` és társai), rotáló: „Kockák dobása…”, „Szintek generálása…”, „Az NPC-k a helyükre állnak…”, „Spagettikód kibogozása… vicc, nálunk nincs ilyen.”
- **AI-panel várakozás** (stream előtt): „Gondolkodik… (mint egy NPC, akinek nincs dialógusfája)”, „Az orákulum meditál…”.
- **Mentés** (`status.saved`): a fő szöveg marad „Minden mentve”, a **tooltipbe** kerül a csavar: „A hubris viszont nem mentődik.” / „Checkpoint elérve.” Így nem zavar, aki csak a státuszt nézi.
- **Felhő-mentés** (`cloud…saved`): „Mentve a felhőbe. A felhő nem esik ki.”

### P3: Haladási pillanatok (együtt a `MOTION_PLAN` P1-gyel)

A mozgásterv „egy jelentős pillanat nézetenként” szabálya itt is érvényes: **a szöveg ugyanazt a pillanatot kíséri, nem újat nyit.**

- **Útmutató-lépés kész** (`workspace.chip.done`): „Lépés kész. +10 XP a tervezésre.” / „Pipa. Jólesik, ugye?”
- **Fázis kész** (a mozgásterv 1.5-ös „nagy pillanata”): „Fázis teljesítve! Achievement unlocked: *Még mindig motivált*.”
- **Mérföldkövek** (számlálók a meglévő gyűjteményekből, csak *Teljes* szinten, frekvenciakorlát alatt):
  - 1. NPC: „Megszületett az első lakos. Adj neki nevet, mielőtt Bob lesz.”
  - 10. NPC: „Tíz NPC. Valaki közülük biztosan árus lesz.”
  - 50. item: „Ötven tárgy. Az inventory-menedzsment UI-designer már sír.”
  - Első quest: „Első küldetés. Remélhetőleg nem patkányirtás.”
- A mérföldkövek „egyszer láttam” állapota projektenként `localStorage`-ben (pl. `hohplan:flavor:seen:<projektId>`), nem a projektadatban.

### P4: Kontextusérzékeny kiszólások (a meglévő elemzőkre építve)

Ezek a már létező `src/core/*` számításokat használják, új logika szinte nélkül. Mindig a tárgyszerű tipp **mellett**, alcímként jelennek meg, sosem helyette.

- **Roadmap túllépés** (`roadmap.ts`, `over: true`): „Scope creep észlelve. A játék neve kötelez.”
- **Sok nyitott kérdés** (`openQuestions`): „Több a kérdés, mint a válasz. Filozófus vagy, vagy game designer?”
- **Árva elemek** (`hints.orphan`): „Ezeket senki sem hívja meg. Kicsit szomorú.”
- **Elszigetelt gráfcsomópontok** (`graphIsolated`): „Magányos csomópontok. Kössünk össze néhányat?”
- **Kanban limit** (`hints.kanban`): „Ebben az oszlopban már tolakodnak.”

### P5: Napszak, visszatérés, apró meglepetések (*Teljes* szint)

- **Napszak-köszönés** a Home/workspace fejlécében, napi egyszer:
  - hajnal 0–5: „Éjféli tervezés? Az igazi game jam-szellem.”
  - reggel: „Jó reggelt! Kávé megvan? Akkor terv jöhet.”
  - péntek délután: „Péntek délután. Csak semmi nagy refaktor.”
- **Visszatérés hosszú szünet után** (utolsó megnyitás > 14 nap): „Visszatértél! A projekt nem felejtett el. (Mi sem.)”
- **Undo-sorozat** (5+ undo rövid időn belül): „Meggondoltad magad? Ez a tervezés lényege.”
- **Easter eggek:**
  - Konami-kód: a BrandMark egyszer megpörög, és megjelenik: „+30 élet. Sajnos csak a tervezésben.”
  - 7 kattintás a BrandMarkra: „Igen, ez egy logó. Nagyon büszkék vagyunk rá.”
  - Projekt neve „Hands of Hubris”: „Ó, ezt ismerjük.”
  - Április 1.: a „Betöltés…” szövegek mind túlzóak („MMO-backend inicializálása…”).

## 5. Kifejezetten nem része a tervnek

- Kabalafigura/illusztrált karakter (külön döntés, art kell hozzá).
- Hangeffektek.
- Kiszólás exportált dokumentumban, alapértelmezett elemnevekben vagy bármiben, ami a projektadatba íródik.
- Humor hibákban, megerősítésekben, biztonsági szövegekben (lásd 2. pont).
- Konfetti-könyvtár (a mozgásterv szerint CSS-only marad).

## 6. Hozzáférhetőség

- A kiszólás dekoratív alcím: a képernyőolvasó számára a tárgyszerű cím az elsődleges. Ha a kiszólás `aria-live` régióba kerül (lépés kész), csak `polite`, és csak egyszer.
- Easter egg animációk tiszteletben tartják a `prefers-reduced-motion`-t.
- Kontraszt: a halványabb `.flavor` stílus is teljesítse a WCAG AA-t.

## 7. Megvalósítás, ütemezés

1. **Alap (½ nap):** `src/core/flavor/pick.ts` + `flavorStore` + `<Flavor>` komponens + beállítás a `SettingsPage`-en + `.flavor` CSS.
2. **P1 + P2 (½ nap):** üres állapotok, „minden kész”, betöltés, mentés-tooltip, HU és EN szövegek.
3. **P3 (½ nap):** útmutató-lépés/fázis kész, a mozgásterv 1.4–1.5-ös pontjaival együtt; mérföldkövek.
4. **P4 (½ nap):** kontextusérzékeny alcímek a meglévő hint-szabályokhoz.
5. **P5 (opcionális):** napszak, visszatérés, undo-sorozat, easter eggek.

Minden fázis külön szállítható; a *Ki* szint mindig a mai viselkedést adja.

**Állapot (2026-11-09):** az 1. és 2. pont kész (`src/core/flavor/pick.ts`, `src/ui/flavor/Flavor.tsx`, `tests/flavor.test.tsx`). Eltérések a tervtől: az „egymás után ne ismétlődjön” rész helyett a seed a napi dátum és a hely (modul/szekció) kombinációja, így egymás melletti üres szekciók más sort kapnak; a `flavorStore` frekvenciakorlátja a P3-mal együtt jön, mert csak a „pillanatoknak” kell.

**P3 kész (2026-11-09):** `src/core/flavor/milestones.ts` (küszöbök, felfelé átlépés, 3 perces korlát) és `src/ui/flavor/moments.tsx` (sarokbuborék, `aria-live="polite"`, 6 mp után eltűnik; mérföldkő-figyelő a store-on). A lépés kész sor a WalkthroughChipben *Finom* szinten is látszik; a fázis kész buborék *Finom* szinten is megjelenik, és ez az egyetlen, ami átlépheti a korlátot; a mérföldkövek csak *Teljes* szinten. A „már láttam” állapot projektenként a `meta.createdAt` alapján tárolódik, mert a projektnek nincs saját azonosítója.

**P4 kész (2026-11-09):** a `HintCard` a tipp saját kulcsával keres kiszólást (`hints.<kulcs>.title` → `flavor.hint.<kulcs>`), így új tipphez kódváltoztatás nélkül, csak szöveggel adható kiszólás. 24 tipphez van sor (roadmap, kérdések, árva/elszigetelt elemek, kanban, story, items, combat, trade, NPC, nehézség, vízió). Szándékosan nincs kiszólás az „üres szekció” tipphez, mert ott az üres állapot már kap egyet. Teszt figyeli, hogy minden `flavor.hint` kulcshoz létezzen valódi tipp.

**P5 kész (2026-11-09):** `src/core/flavor/easter.ts` (tiszta szabályok) és `src/ui/flavor/easter.tsx`. Napszakos köszönés a munkatér fejlécében (éjjel, reggel, délután, péntek délután, este, hétvége; naponta az első látogatáskor), visszatérés-üdvözlés 14 nap szünet után, undo-sorozat (5 visszavonás 20 mp-en belül), Konami-kód és 7 kattintás a logóra (a logó megpördül), április 1-jei betöltés-szövegek. Mind csak *Teljes* szinten. **Kimaradt:** a „Hands of Hubris” projektnév-egg, mert az új projektek alapértelmezett neve is ez, így mindenkinél elsülne.

## 8. Tesztek és elfogadás

- `tests/flavor.test.ts`:
  - `pickFlavor` determinisztikus azonos seedre, és különböző seedre eltérhet;
  - `off` szinten mindig `null` → fallback;
  - hiányzó kulcs/üres tömb → fallback, nem dob hibát.
- **i18n-integritás teszt:** minden `flavor.*` kulcs tömb, nem üres, minden elem ≤ 120 karakter; ahol a HU kulcs létezik, az EN is (vagy fordítva), különben figyelmeztetés.
- **Tiltólista-teszt:** a tiltott namespace-ekben (`cloud.*Unsaved`, AI-kulcs, import-hibák) nincs `<Flavor>` használat (egyszerű grep-alapú teszt vagy lint-szabály).
- Ellenőrzés: `npx vitest run tests/flavor.test.ts`, `npm run typecheck`, `npm run lint`.
- **Kézi elfogadás:** egy új projekt végigkattintása *Finom* szinten: minden üres nézetben 1 kiszólás, egyik sem ismétlődik zavaróan, sehol nincs kiszólás hibaüzenetben.

## 9. Nyitott kérdések

- Kapjon-e a „hang” nevet (pl. a beállításokban: „Az öreg tervező megjegyzései”)? Ez segítene a beállítás érthetőségén.
- Legyen-e az alapértelmezés *Finom* vagy *Ki* a felhős (csapat) projekteknél?
- Kérhetünk-e a csapattól saját kiszólásokat (közösségi `flavor` gyűjtés), vagy maradjon kurált?
