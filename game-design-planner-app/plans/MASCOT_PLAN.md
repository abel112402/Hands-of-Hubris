# Kabala-terv: Hubi és a nyolc jelmez

> **Kikapcsolva (2026-11-15):** Hubi egyelőre nem jelenik meg az oldalon. Minden fájl megmaradt; visszakapcsolás: `src/core/mascots/config.ts` → `MASCOTS_ENABLED = true`. Kikapcsolva a buborékos sorok sima dőlt megjegyzésként maradnak, a kísérő, a helyzetjelentés, a gardrób és a csoportkép nem renderelődik.

Állapot: javaslat · 2026-11-09 · a `PERSONALITY_PLAN.md`-re épül (az ott „külön döntés”-nek hagyott kabalafigura ez), és a `MOTION_PLAN.md` mozgásszabályait követi.

Forráskép: `plans/mascots/source-lineup.webp` (8 figura egy képen).

## 1. Cél és alapelv

A meglévő személyiség-rendszer (flavor-szövegek, sarokbuborék, mérföldkövek, napszakos köszönés, easter eggek) **arcot kap**: Hubit, aki nyolc jelmezt hord. Nem új hangot írunk mellé, hanem a meglévő kiszólásokat Hubi szájába adjuk, az aktuális jelmeze szerint, és kiegészítjük három új műfajjal: **tipp**, **reflexió a projekt állapotára**, **vicc**.

Alapelvek:
- **Mindig a területhez illő jelmezben beszél.** Az aktuális modul (vagy oldal) határozza meg, melyik jelmezt viseli Hubi; így a kabala „szakértő”, nem véletlenszerű dísz.
- **Sokszor látszik, ritkán szól közbe.** A figura sok helyen jelen van (üres állapot, tipp-kártya, sarok, betöltés), de **magától** megszólaló buborék ritka és korlátozott.
- **A tényt sosem helyettesíti.** A tárgyszerű szöveg marad elsődleges; a kabala mellette áll (mint a mai `.flavor` alcím).
- **A meglévő tiltólista érvényes:** nincs kabala hibákban, megerősítő dialógusokban, AI-kulcs/felhő-hitelesítés/biztonsági szövegekben, importhibákban, és semmi nem kerül a projektadatba vagy exportba.
- **A karakterek alapvonásai fixek** (lásd 3.1); csak a póz, a kéztartás, az arckifejezés és a kellék helyzete változhat.

## 2. Hubi és a nyolc jelmez

**Döntés (2026-11-09): egy figura, nyolc jelmez.** A kabala neve **Hubi** (a *Hubris*-ból): egy vörös, kócos hajú, kék szemű, pirospozsgás kis tervező, aki minden területhez **átöltözik**. Nem nyolc szereplő beszél, hanem egyetlen személyiség, aki a jelmezének megfelelően játssza a szakértőt (öltönyben üzletiesen, köpenyben prófétikusan). A zombi a „túlhajszolt Hubi”: éjfél után, túl sok bug vagy hosszú szünet után így néz ki (zöld bőr, zöldes haj); ez nem külön lény, hanem Hubi állapota.

Következmények:
- **Egy név, egy hang alap:** Hubi mindig barátságos, lelkes és kicsit önironikus; a jelmez csak színezi (szakszavak, kellék, poénok témája). A szövegekben Hubi egyes szám első személyben beszél, és tudja, hogy jelmezben van („Na, felveszem a páncélt, jöjjön a harc.”).
- **A modulváltás maga is pillanat:** ha a felhasználó másik területre lép, Hubi átöltözik (rövid „füstfelhő/ruhacsere” CSS-animáció, `prefers-reduced-motion` esetén sima képcsere). Időnként, csak *Teljes* szinten, egy átöltözős kiszólás kíséri: „Leteszem a vasvillát, jöhet a kard.”
- **Kódban** a `MascotId` helyett `CostumeId` (`wizard`, `scientist`, `knight`, `farmer`, `smith`, `pirate`, `suit`, `zombie`); a lenti táblázatok „Jelmez” oszlopa ezt jelenti.
- **i18n:** `mascot.<costume>.*` kulcsok maradnak, plusz `mascot.hubi.*` a jelmeztől független sorokhoz (bemutatkozás, átöltözés, általános viccek), és `mascot.changeCostume.<from>_<to>` opcionálisan, néhány kedvelt páros.
- **Beállítások:** egyenkénti némítás helyett **jelmezenkénti** némítás marad lehetséges, de az elsődleges kapcsoló maga Hubi (a meglévő Ki/Finom/Teljes szinttel).

A jelmezek kiosztása a modul-azonosítók alapján:

| # | Jelmez | Fő terület (docId / oldal) | Hangnem | Humor forrása |
|---|---|---|---|---|
| 1 | **Varázsló** | `overview.vision`, `design.story`, `design.openQuestions`, `overview.glossary`, AI-panel | Bölcs, kicsit ködös, prófétikus | Jóslatok, „ez nem varázslat, csak jó változónév” |
| 2 | **Tudós** | `design.difficulty`, `technical.dataDriven`, `technical.performance`, `technical.ai`, képletek (combat/trade formula), QA csoport | Precíz, kíváncsi, mér | Kísérletek, hipotézisek, robbanó lombikok |
| 3 | **Lovag** | `design.combat`, `design.player`, `design.factions` (diplomácia) | Becsületes, lelkes, kicsit patetikus | Lovagi eskü vs. hitbox, „ellenjáték nélkül nincs tisztességes párbaj” |
| 4 | **Farmer** | `design.coreLoop`, `design.town`, `design.npc`, `design.timeWeather` | Türelmes, földhözragadt, vidám | Vetés-aratás = loop, időjárás, falusi NPC-k |
| 5 | **Kovács** | `design.items` (crafting), `technical.architecture`, `technical.coding`, `technical.save`, `technical.tools`, `production.stack` | Gyakorlatias, szűkszavú, büszke a munkájára | Kovácsolás = refaktor, „előbb a recept, aztán a kalapács” |
| 6 | **Kalóz** | `design.trade`, `design.world`, Art & Audio csoport, `production.release` | Laza, kalandos, vagány | Kincs, térkép, infláció mint tenger, „a határidő inkább iránymutatás” |
| 7 | **Üzletember** | `overview.roadmap`, `production.*` (milestones, backlog, team, risks, phases, review), Home/munkatér-dashboard, projektlista | Magabiztos, „corporate”, önironikus | Befektetői nyelv, KPI, meetingek, scope creep, crunch |
| 8 | **Zombi** | Issues/Tippek oldal, árva/elszigetelt elemek, undo-sorozat, visszatérés hosszú szünet után, éjszakai köszönés, kivágott tartalom | Barátságos, lassú, morgós-kedves (soha nem gusztustalan) | „Agyat… mármint GDD-t”, halott feature-ök, bugok mint csemege |

Ismeretlen/egyéni modulok (`custom`, `templates`) → csoport szerinti alapértelmezés, végső esetben az Üzletember (ő a „házigazda”).

## 3. Grafika

### 3.1 Változatlan alapvonások (konzisztencia-lista minden új pózhoz)

- Fej-test arány, arcforma, kerek pirospozsgás arc, nagy kék szem, vörös-narancs kócos haj (zombinál zöldes-barna kócos haj, sápadt zöld bőr, sárgás szem).
- Vastag sötét kontúr, lapos színezés, enyhe árnyék, a lábak alatt halvány ovális talajárnyék.
- Jelmez és kellék: varázsló – kék csillagos-szegélyű köpeny, hegyes kalap, görbe bot; tudós – fehér köpeny, kerek szemüveg, lombik; lovag – láncing + lemezpáncél, kard, kerek pajzs; farmer – kantáros farmer, bézs ing, vasvilla; kovács – barna bőrkötény, kesztyű, kalapács; kalóz – háromszögletű kalap, szemkötő, aranyszegélyes kabát; üzletember – sötétkék öltöny, nyakkendő, napszemüveg, aktatáska; zombi – szakadt ruha, kinyújtott karok.
- Ugyanaz a színpaletta minden pózon (a forrásképből mintavételezve, `plans/mascots/palette.md`-be írva).

### 3.2 Pózkészlet (jelmezenként 5, összesen 40 kép)

| Póz | Mire | Leírás |
|---|---|---|
| `idle` | üres állapot, beállítások | A forrásképen látható póz (kivágva) |
| `point` | tipp | Mutatóujj fel/oldalra, mint az üzletember a forráson; kellék a másik kézben |
| `cheer` | lépés/fázis kész, mérföldkő | Karok fel / kellék a magasba, nagy mosoly |
| `think` | reflexió, figyelmeztető tipp, betöltés | Állra tett kéz (mint a tudós a forráson), kissé ráncolt szemöldök |
| `peek` | sarok-kísérő | Csak fej + két kéz, a képkeret alsó széléről kukucskál |

Plusz jelmezenként egy **„tevékenység” póz** a betöltéshez (opcionális, 2. kör): kovács kalapál, tudós kever, farmer ás, kalóz távcsövezik, üzletember telefonál, varázsló pálcát suhint, lovag kardot fen, zombi csoszog.

### 3.3 Előállítás és formátum

1. **Kivágás:** a forrásképből 8 `idle` kép, háttér eltávolítva (átlátszó), egységes vászon (pl. 512×640, lábak ugyanazon az alapvonalon).
2. **Új pózok:** képgenerálás a kivágott figurával mint referenciával (vagy illusztrátor), a 3.1 lista szó szerint a promptban. Minden pózt a 3.1 alapján vizuálisan ellenőrzünk (egymás mellé téve az `idle` képpel).
3. **Export:** WebP, átlátszó háttér, két méret: 160 px magas (`@1x`) és 320 px (`@2x`); `peek` 96/192 px. Célméret ≤ 25 KB/kép.
4. **Helye:** `src/assets/mascots/<id>/<pose>.webp`, Vite-importtal (hash-elt fájlnév, a CSP `img-src 'self'` elég, nincs külső host).
5. **Lusta betöltés:** a képeket a `<Mascot>` komponens csak megjelenéskor kéri le (`loading="lazy"`, dinamikus import-térkép), így az alap bundle nem nő.
6. **Hiányzó póz → `idle`.** Így a funkció már 8 kivágott képpel szállítható, a többi póz fokozatosan jön.

## 4. Mit mond: négy műfaj

| Műfaj | Mikor | Forrás | i18n kulcs |
|---|---|---|---|
| **Tipp** | Kattintásra a sarok-kísérőn, üres állapotban, időnként magától | Statikus, modulonként kurált | `mascot.<id>.tip.<docId>[]` és `mascot.<id>.tip.general[]` |
| **Reflexió** | A projekt állapotából számolt, a munkatér-dashboardon és a sarokban | Tiszta függvény a projekt felett (5. pont) | `mascot.<id>.reflect.<szabály>[]`, `{{count}}`-tal |
| **Vicc** | Ritkán, csak *Teljes* szinten, kattintásra vagy tétlenség után | Statikus, jelmezenként | `mascot.<id>.joke[]` |
| **Ünneplés** | Lépés/fázis kész, mérföldkő | A meglévő `flavor.stepDone`, `phaseDone`, `milestone.*` sorok, a terület gazdája mondja | meglévő kulcsok + `mascot.<id>.cheer[]` |

A meglévő `flavor.empty.<modul>` és `flavor.hint.<kulcs>` sorok **maradnak**, csak a terület gazdájának szájába kerülnek (szükség esetén átfogalmazva a hangjára). A magyar szövegek saját írások, nem fordítások (ahogy a személyiség-tervben).

### 4.1 Példasorok (HU, irányadó; mind ≤ 120 karakter)

**Üzletember (production):**
- Tipp: „Minden mérföldkő végén legyen valami, amit meg lehet mutatni. Ami nem demózható, az nem kész.”
- Tipp: „A backlog nem kívánságlista. Ha mindennek magas a prioritása, semminek sincs.”
- Reflexió: „{{done}}/{{total}} mérföldkő kész. A befektetőknek ezt úgy mondjuk: erős lendület.”
- Reflexió (roadmap túllépés): „A projekt {{weeks}} héttel hosszabb a tervezettnél. Ezt hívjuk stratégiai rugalmasságnak.”
- Reflexió (nincs kockázat felvéve): „Nulla kockázat a listán. Ez a legkockázatosabb, amit ma láttam.”
- Vicc: „A határidő olyan, mint a részvény: néha csak papíron létezik.”
- Vicc: „Ez a meeting is lehetett volna egy e-mail. Ez a feature is lehetett volna egy DLC.”
- Péntek délután: „Péntek délután. Most nem indítunk új frakciót. Majd hétfőn, frissen.”

**Varázsló (vízió, történet, nyitott kérdések, AI):**
- Tipp: „Egy jó vízió elfér egy mondatban. Ha háromban sem, az még csak köd.”
- Reflexió: „{{count}} nyitott kérdés lebeg a levegőben. A jövő ködös, de a döntések határidőt kérnek.”
- Vicc: „Nem varázslat ez, csak jól elnevezett változók.”
- AI-panel várakozás: „A kristálygömb tölt… kérlek, ne rázd.”

**Tudós (nehézség, adatok, teljesítmény, képletek):**
- Tipp: „Egyszerre egy számot hangolj. Különben nem tudod, mi robbant fel.”
- Reflexió: „A nehézségi görbén {{count}} hirtelen ugrás van. Érdekes adat. Kevésbé érdekes a játékosnak.”
- Vicc: „Kísérlet: 100 játékos, 1 boss. Eredmény: a boss nem élte túl a nerfet.”

**Lovag (harc, játékos, frakciók):**
- Tipp: „Minden támadásnak legyen ellenjátéka. Így kívánja a becsület és a balansz.”
- Reflexió: „{{count}} frakció, egyetlen szövetség sincs. Ez nem háború, ez magány.”
- Vicc: „Van kardom, van pajzsom… csak hitboxom nincs még.”

**Farmer (core loop, város, NPC, idő és időjárás):**
- Tipp: „A jó loop olyan, mint a vetés: beleteszel, vársz, aratsz, kezded újra.”
- Reflexió: „{{count}} NPC lakik a faluban, de egynek sincs napirendje. Ki fogja megetetni a teheneket?”
- Vicc: „Az időjárás-rendszered jobb, mint a miénk a faluban. Nálunk csak eső van.”

**Kovács (tárgyak, crafting, architektúra, kód):**
- Tipp: „Előbb a recept, aztán a kalapács. Minden craftolt tárgynak legyen forrása.”
- Reflexió: „{{items}} tárgy, de csak {{recipes}} recept. Ki fogja ezt mind kikovácsolni?”
- Vicc: „Refaktorálni olyan, mint újrakovácsolni: forró, hangos, és utána jobb.”

**Kalóz (kereskedelem, világ, art & audio, kiadás):**
- Tipp: „Minden pénzforráshoz kell egy lefolyó, különben inflációs tengerre futunk.”
- Reflexió: „{{goods}} áru, nulla kereskedelmi útvonal. Ezzel a hajóval csak a kikötőben ringatózunk.”
- Vicc: „A határidő? Az inkább amolyan iránymutatás, pajtás.”

**Zombi (tippek oldal, árva elemek, visszatérés):**
- Tipp: „Az árva elemek egyszer visszajönnek kísérteni. Kösd be őket, vagy temesd el rendesen.”
- Reflexió: „{{count}} megoldatlan tipp… mmm, friss bugok.”
- Visszatérés 14 nap után: „Feltámadt a projekt! Én is így kezdtem.”
- Undo-sorozat: „Vissza… vissza… vissza… Én is így járok. Csak előre.”
- Vicc: „Agyat! …mármint game design dokumentumot.”

Az angol sorok külön, a saját nyelvükön íródnak; ha egy kulcs csak az egyik nyelven létezik, a figura a meglévő semleges szövegre esik vissza.

## 5. Reflexió: a projekt állapotából

Új, tiszta modul: `src/core/mascots/reflect.ts`.

```ts
export type Reflection = { mascot: MascotId; key: string; params?: Record<string, number | string>; weight: number }
export function reflections(project: Project, ctx: { docId?: string; now: Date }): Reflection[]
```

Csak meglévő számításokra épül, új elemzés nélkül:

| Szabály | Forrás | Jelmez |
|---|---|---|
| Modul-haladás 0% / 50%+ / 100% | `docProgress` (`src/core/progress.ts`) | a modul gazdája |
| Teljes haladás (átlag) | `averageProgress` | Üzletember |
| Következő mérföldkő, lejárt határidő | `nextMilestone` | Üzletember |
| Roadmap túllépés | `src/core/roadmap.ts` (`over`) | Üzletember |
| Nyitott kérdések száma | `src/core/openQuestions.ts` | Varázsló |
| Tippek száma modulonként / összesen | `src/core/hints/engine.ts` | modul gazdája; összesen → Zombi |
| Árva / elszigetelt elemek | meglévő hint-szabályok | Zombi |
| Szekció-számok (NPC, tárgy, recept, quest, áru, frakció) | `sectionCount` (`milestones.ts`) | modul gazdája |

A `weight` alapján, a meglévő determinisztikus `pickLine` logikával (seed: nap + docId) választunk, így újrarendereléskor nem ugrál a szöveg. Ugyanaz a reflexió egy munkamenetben legfeljebb egyszer jön elő magától.

## 6. Hol jelenik meg (a „sokszor látszik” rész)

Prioritás szerint; minden pont külön szállítható.

**P1 – Mindig ott van (statikus jelenlét, nem szól közbe)**
1. **Üres állapotok** (`GuideEmpty`, `CollectionEditor`): a modul gazdája `idle`/`point` pózban a mai `flavor.empty.*` sor mellett, beszédbuborékként.
2. **Tipp-kártyák** (`HintPanel`, `HintCard`): kis (32 px) `think` avatar a kártya flavor-alcíme előtt; a Tippek oldal fejlécében a Zombi.
3. **Sarokbuborék** (`FlavorToast` a `moments.tsx`-ben): a mai szövegbuborék kap egy figurát; a mérföldkövek gazdája: NPC → Farmer, tárgy → Kovács, quest/karakter → Varázsló, fázis kész → Üzletember, lépés kész → a modul gazdája `cheer` pózban.
4. **Munkatér-dashboard / ProgressPanel:** „Heti státusz” kártya: Üzletember 1 reflexióval a teljes állapotról (haladás %, következő mérföldkő).

**P2 – Kísérő a szerkesztőben**
5. **Sarok-kísérő (`<MascotCompanion>`)**: az `EditorPage` jobb alsó sarkában a modul gazdája `peek` pózban kukucskál. Kattintásra buborék: tipp → reflexió → vicc körforgásban („Még egyet” gomb, „Most ne” gomb). Modulváltáskor a figura cserélődik (rövid csúszó be/ki animáció).
6. **Magától megszólal** (csak *Teljes* szinten): 60 mp tétlenség után egy modulban, ha van friss reflexió; globálisan legfeljebb 5 percenként egyszer, a meglévő `momentAllowed` korláttal közösen (egy időben csak egy buborék a teljes appban).

**P3 – Pillanatok és helyek**
7. **Betöltés:** a `useLoadingLine` szövege mellé véletlen (napi seedes) jelmezben Hubi `think`/tevékenység pózban.
8. **AI-panel várakozás:** Varázsló.
9. **Napszakos köszönés** (`Greeting`): éjjel – Zombi, reggel – Farmer, délután – Tudós, péntek délután – Üzletember, este – Varázsló, hétvége – Kalóz.
10. **Projektlista üres** (`cloud.projects.empty`): Üzletember „új vállalkozás” hangon.
11. **Útmutató kész** (`guide.allDone`): Hubi gyors egymásutánban felpróbálja mind a nyolc jelmezt, végül öltönyben ünnepel (`cheer`). Statikus változat: a forráskép „gardrób” elrendezésben, „Minden jelmezem büszke rád.”
12. **Easter eggek:** Konami-kód → Hubi villámgyorsan végigpörgeti mind a nyolc jelmezt; 7 klikk a logón → zombi-Hubi kukucskál ki a logó mögül; április 1. → Hubi rossz jelmezt vesz fel (öltönyben a harc-modulban: „A harcot kiszerveztük.”).

**P4 – Beállítás és „ismerkedés”**
13. **Beállítások → Személyiség fül:** a meglévő Ki/Finom/Teljes választó mellett Hubi „gardróbja”: a nyolc jelmez sora, mindegyikhez 1 mondat, mikor veszi fel. Jelmezenként némítható (pl. „zombi-Hubi ne jelenjen meg”), ilyenkor a semleges szöveg jelenik meg.

### 6.1 Szint-összerendelés (a meglévő `FlavorLevel` alapján)

| Szint | Mit lát a felhasználó |
|---|---|
| *Ki* | Semmi kabala, a mai semleges szövegek |
| *Finom* (alap) | P1 (üres állapot, tipp-avatar, buborék figurával, dashboard), sarok-kísérő **csak kattintásra**, tipp és reflexió |
| *Teljes* | + magától megszólaló kísérő, viccek, napszak, easter eggek, csoportkép |

Így nincs új globális kapcsoló; a meglévő beállítás egyetlen helyen szabályoz.

## 7. Architektúra

```
src/core/mascots/
  cast.ts        // CostumeId, jelmezek, terület-térkép (docId/csoport → CostumeId), pózlista
  reflect.ts     // reflections(project, ctx): tiszta, tesztelhető
  pick.ts        // pickMascotLine(mascot, kind, ctx): a meglévő pickLine/hashString újrahasznosítva
src/ui/mascots/
  Mascot.tsx            // <Mascot id pose size /> : kép + alt, lusta betöltés, hiányzó póz → idle
  SpeechBubble.tsx      // figura + buborék, a .flavor stílus kiterjesztése
  MascotCompanion.tsx   // sarok-kísérő (EditorPage)
  useMascotStore.ts     // Zustand: némított jelmezek (localStorage), aktuális jelmez (átöltözés-animációhoz), utolsó buborék ideje, munkamenetben látott sorok
src/assets/mascots/<id>/<pose>.webp
```

- `cast.ts` a **docId → jelmez** térképet a registry csoportjaival egészíti ki (`getModule(docId).group`), így új modul automatikusan kap jelmezt.
- Minden kabala-állapot UI-állapot: nem a projekt store-ban, nem undo/redo, nem autosave, nem export (ugyanaz a szabály, mint a flavor-nál).
- A `FlavorOpts` kap egy opcionális `mascot?: MascotId` mezőt; a `<Flavor>` és a `FlavorToast` ezzel dönti el, kell-e figura. A meglévő hívások változatlanul működnek.
- Mozgás: CSS-only (be-csúszás, enyhe „lélegzés” `idle`-ben, `cheer`-nél egy ugrás), `prefers-reduced-motion` esetén statikus.

## 8. Gyakoriság és udvariasság

- Egy időben **legfeljebb egy** kabala-buborék az egész appban (a meglévő `useMoments` sor közös).
- Magától megszólalás: min. 5 perc szünet, munkamenetenként max. ~6; „Most ne” → az adott munkamenetben a kísérő csak kattintásra szól.
- Nem jelenik meg: modális dialógus, megerősítés, hibasáv, felhő-hitelesítés, AI-kulcs, import-figyelmeztetés felett vagy mellett; olvasási módban (`readOnly`) csak a statikus P1 elemek.
- Ugyanaz a sor egy munkamenetben nem ismétlődik (sessionStorage), napi seed miatt nem villog.
- A kísérő nem takarhat interaktív elemet: mobil (< 768 px) nézetben a `peek` helyett egy 40 px-es kerek avatar-gomb.

## 9. Hozzáférhetőség

- A figura dekoratív, ha mellette ott a szöveg: `alt=""`; ahol a figura egyedül áll (avatar-gomb), `aria-label`: „Hubi (kovács jelmezben)”.
- A buborék szövege `aria-live="polite"`, egyszer; a magától megszólalás nem lop fókuszt.
- Kontraszt: buborék és szöveg WCAG AA, világos és sötét témában is (a `LIGHT_MODE_PLAN` színváltozóival).
- Billentyűzettel elérhető kísérő (`button`), `Esc` bezárja a buborékot.

## 10. Megvalósítás, ütemezés

1. **Grafika, 1. kör (½ nap):** 8 `idle` kivágás + paletta-jegyzet. *Ezzel a teljes P1 szállítható.*
2. **Alap (½ nap):** `cast.ts`, `<Mascot>`, `<SpeechBubble>`, `useMascotStore`, CSS.
3. **P1 (½ nap):** üres állapotok, tipp-avatar, figurás sarokbuborék, dashboard-reflexió (Üzletember) + `reflect.ts` első 4 szabálya.
4. **Szövegek (1 nap):** jelmezenként min. 5 tipp, 5 reflexió, 5 vicc, HU és EN; a meglévő `flavor.empty.*` sorok átnézése a gazda hangján.
5. **Grafika, 2. kör (párhuzamosan):** `point`, `cheer`, `think`, `peek` pózok (32 kép), majd opcionálisan a tevékenység-pózok.
6. **P2 (1 nap):** sarok-kísérő, tétlenség-figyelés, korlátok.
7. **P3 + P4 (1 nap):** betöltés, AI, napszak, csoportkép, easter eggek, beállítás-fül némítással.

## 11. Tesztek és elfogadás

- `tests/mascots.test.ts`:
  - minden ismert docId-nak és minden registry-csoportnak van gazdája;
  - `reflections` determinisztikus azonos projektre és dátumra; üres projektre nem dob;
  - minden `mascot.*` kulcs nem üres tömb, minden sor ≤ 120 karakter, a `{{param}}`-ok megfelelnek a szabály paramétereinek;
  - minden jelmezhez létezik `idle` kép (import-térkép ellenőrzése).
- Tiltólista-teszt kiterjesztése: `<Mascot>`/`<SpeechBubble>` nem szerepel a tiltott komponensekben (dialógusok, AI-kulcs, felhő-hitelesítés, import).
- Ellenőrzés: `npx vitest run tests/mascots.test.ts tests/flavor.test.tsx`, `npm run typecheck`, `npm run lint`.
- **Kézi elfogadás:** új projekt végigkattintása *Finom* és *Teljes* szinten; minden modulban Hubi a megfelelő jelmezben jelenik meg, és modulváltáskor átöltözik; magától soha nem jön két buborék 5 percen belül; mobilnézetben a kísérő semmit nem takar; *Ki* szinten pixelre a mai felület.

## 12. Nyitott kérdések

1. ~~Egy figura nyolc jelmezben, vagy nyolc különálló szereplő?~~ **Eldőlt (2026-11-09):** egy figura, Hubi, nyolc jelmezben (2. pont).
2. ~~Maradjon-e a **Hubi** név?~~ **Eldőlt (2026-11-09):** egyelőre marad a „Hubi”.
3. ~~**Ki készíti a további pózokat?**~~ **Eldőlt (2026-11-09):** a projekt gazdája készíti el, egy későbbi szakaszban. Addig mindenhol az `idle` kép látszik; átvétel a `plans/mascots/POSE_PROMPTS.md` és a `plans/mascots/clean-cutout.sh` szerint.
4. ~~**Alapszint:** *Finom* vagy az első héten *Teljes*?~~ **Eldőlt (2026-11-09):** új felhasználó *Finom* szinten indul (`DEFAULT_FLAVOR_LEVEL` = `subtle`, már így van).

## 13. Állapot

**1. szelet kész (2026-11-09):**
- 8 `idle` kivágás (átlátszó háttér, a zárt fehér lyukak is eltávolítva): `src/assets/mascots/<jelmez>/idle.webp`, összesen ~115 KB.
- `src/core/mascots/cast.ts`: `CostumeId`, `costumeFor(docId)` (planner-térkép + csoport szerinti tartalék), `costumeForMoment` (mérföldkő → a planner jelmeze; visszatérés/undo/logó → zombi; fázis kész → öltöny).
- `src/ui/mascots/Mascot.tsx`: `<Mascot>` (hiányzó póz → `idle`, dekoratív `alt=""`, `labelled` esetén „Hubi, … jelmezben”) és `<HubiSays>` (figura + beszédbuborék).
- Megjelenik: üres szekciók (`GuideEmpty`), „nincs teendő” a Tippek panelen, „nincs tipp” a munkatéren, sarokbuborék (mérföldkövek, fázis kész, easter eggek). A `<Flavor>` kapott egy `costume` propot, így új hely egy szóval Hubit kap.
- Teszt: `tests/mascots.test.tsx`. Teljes csomag 800/800, typecheck és lint tiszta.

**Következik:** további pózok (32 kép), tipp/reflexió/vicc szövegek jelmezenként (`mascot.<jelmez>.*`), `reflect.ts`, sarok-kísérő az editorban, dashboard-reflexió, átöltözés-animáció, gardrób a beállításokban.

**2. szelet kész (2026-11-09):**
- Képek tisztítva: a talaj-ellipszis eltávolítva (a cipőkig tartó flood fill, így a lovag vas csizmája és a zombi lába megmarad), a tudós zárt fehér foltjai törölve, az alfa-perem 1 px-szel visszahúzva és simítva (nincs világos szegély sötét témában).
- Szövegek HU + EN: jelmezenként 4–6 tipp és 4 vicc (`mascot.<jelmez>.tip/joke`), 18 reflexió-kulcs (`mascot.reflect.*`), kísérő-feliratok (`mascot.companion.*`).
- `src/core/mascots/reflect.ts`: reflexió-szabályok (planner-haladás, tippek száma, teljes haladás, következő mérföldkő, roadmap-túlterhelés, nyitott/lejárt kérdések, tárgy/recept arány, NPC-, frakció-, quest-szám); `REFLECT_PARAMS` a paraméterekhez.
- `src/core/mascots/lines.ts`: sorrend (reflexió → tipp → vicc csak *Teljes* szinten), ismétlés nélküli léptetés, gyakorisági korlát (5 perc, munkamenetenként max. 6).
- `src/ui/mascots/MascotCompanion.tsx`: Hubi kukucskál az editor jobb alsó sarkából, kattintásra buborék („Még egyet”, „Most ne”, ×, `Esc`); planner-váltáskor átöltözik (felbukkanó animáció); a reflexiót a hozzá illő jelmez mondja (pl. nyitott kérdések → varázsló). *Teljes* szinten 60 mp csend után magától is megszólal, a sarokbuborékkal közös korláttal. *Ki* szinten és olvasási módban rejtett.
- Teszt: `tests/mascots.test.tsx` 21 teszt (szövegintegritás mindkét nyelven, reflexiók, kísérő). Typecheck és lint tiszta.

**Következik:** további pózok, dashboard-reflexió (öltönyös heti státusz), napszakos köszönés jelmezzel, betöltés, gardrób a beállításokban.

**3. szelet kész (2026-11-09):**
- **Helyzetjelentés** (`src/ui/mascots/StatusCard.tsx`): a munkatér Haladás paneljének tetején Hubi a legfontosabb projektszintű megjegyzést mondja, a hozzá illő jelmezben (többnyire öltönyben); „Még egyet” végiglépteti a többit. *Ki* szinten rejtett.
- **Gardrób** (`src/ui/mascots/Wardrobe.tsx`, Beállítások → Általános, a Személyiség alatt): a nyolc jelmez kártyán, mindegyikhez, hogy mikor veszi fel; kattintásra be/ki (`aria-pressed`). Tárolás böngészőben (`hohplan:mascot:muted`, `src/ui/mascots/wardrobeStore.ts`).
- Kikapcsolt jelmez: a kép sehol nem jelenik meg, a buborékos sor sima `.flavor` szöveg marad; a kísérő abban a plannerben elrejtőzik; a kikapcsolt jelmez reflexiói kimaradnak a kísérőből és a helyzetjelentésből.
- Teszt: `tests/mascots.test.tsx` (gardrób, némítás, helyzetjelentés). Teljes csomag 818/818, typecheck és lint tiszta.

**Következik:** további pózok, napszakos köszönés jelmezzel, betöltés-figura, átöltözős kiszólások, csoportkép a kész útmutatónál.

**4. szelet kész (2026-11-09):**
- **Napszakos köszönés** jelmezben (`Greeting`, csak *Teljes*): éjjel zombi, reggel farmer, délután tudós, péntek délután öltöny, este varázsló, hétvégén kalóz (`costumeForTime`).
- **Betöltés**: `LoadingLine` (felhős betöltőképernyő és projektlista) a napi jelmezben (`costumeForSeed`); *Ki* szinten a semleges szöveg. A projektlista üres állapota öltönyös Hubi.
- **Átöltözős kiszólás** a kísérőben (*Teljes*): planner-váltáskor, ha a jelmez változik, 0,7 mp múlva „Átöltözés” buborék (`mascot.<jelmez>.dressUp`), a magától megszólalás közös korlátjával.
- **Csoportkép** (`HubiLineup`): a teljes útmutató végén az összes bekapcsolt jelmez egy sorban, egymás után beúszva, alatta a „kész” sorral. A planner-útmutató „kész” sora a planner jelmezében.
- **Easter eggek**: Konami-kódra a sarokbuborékban Hubi végigpörgeti mind a nyolc jelmezt (`CostumeParade`, csökkentett mozgásnál csak varázsló); április 1-jén (*Teljes*) a kísérő rossz jelmezben jön (`wrongCostume`), és az első sora bevallja (`mascot.aprilFools`).
- Teszt: 823/823, typecheck és lint tiszta.

**Ami nyitott:** a pózok (`point`, `cheer`, `think`, `peek`) képei. A kód kész rájuk: egy `src/assets/mascots/<jelmez>/<póz>.webp` fájl bemásolása elég; addig minden hely az `idle` képet használja. Ezeket rajzolni kell (képgenerálás vagy illusztrátor, a 3.1-es konzisztencia-lista alapján).

**5. szelet kész (2026-11-09):** a terv apróbb, eddig kimaradt pontjai.
- **Tipp-kártyák:** a tipp megjegyzése előtt kis (34 px) Hubi, abban a jelmezben, amelyik plannerre a tipp vonatkozik.
- **Zombi** a Tippek beállítás-oldal fejlécében, és a Problémák oldalon, de csak akkor, ha nincs probléma (valódi hibák mellett nincs vicc).
- **AI-várakozás:** a „gondolkodik” sort varázsló-Hubi mondja.
- **Mobil:** a kukucskálás helyett 44 px-es kerek avatar-gomb (fej és váll).
- **Tiltólista-teszt:** az AI-kulcs, a felhős bejelentkezés és -beállítások, a hibasávok, az import/export és a mentés fájljaiban nem szerepelhet Hubi vagy flavor-szöveg.
- 834/834 teszt, typecheck és lint tiszta.

**Megjegyzés:** telefon-szélességen az editor oldal maga szűk (a szekciólista szinte a teljes szélességet elveszi); ez régebbi elrendezési kérdés, nem a kabaláé.

**6. szelet (2026-11-09): pózok előkészítése.**
- A pózok be vannak kötve: üres oldal → `point`; helyzetjelentés, betöltés → `think`; mérföldkő-, fázis- és lépés-buborék, planner-útmutató kész, csoportkép → `cheer`. Amíg a kép nincs meg, `idle` látszik; egy `src/assets/mascots/<jelmez>/<póz>.webp` bemásolása elég.
- `plans/mascots/POSE_PROMPTS.md`: közös stílus-prompt, változatlan vonások, jelmez- és pózleírások (jelmezenkénti finomítással), technikai követelmények.
- `plans/mascots/clean-cutout.sh`: a kivágási folyamat szkriptként (háttér, zárt lyukak, talajárnyék, sima szél, 600 px, WebP, sötét/világos előnézet). Kipróbálva a forráskép lovag-, tudós- és zombi-kivágásán.
- Hátravan: a kísérő `peek` és a tipp-kártya `think` pózának bekötése; a telefonos editor-elrendezés javítása (külön munkamenet) ugyanezeket a fájlokat érinti, ezért utána jön.
- **Kész (a telefonos editor-javítás után):** a kísérő csukva a rajzolt `peek` képet mutatja egészben (ha van; addig az álló kép felső része), nyitott buboréknál a mondanivalóhoz illő pózt (helyzetjelentés → `think`, tipp → `point`, vicc és átöltözés → `cheer`); a tipp-kártyán `think`. `hasPose()` különbözteti meg a rajzolt pózt a tartaléktól. 834/834 teszt, typecheck és lint tiszta.

**A terv kódolható része teljes.** Ami hátravan, az grafika: a 32 pózkép a `plans/mascots/POSE_PROMPTS.md` szerint, átvétel a `plans/mascots/clean-cutout.sh` szkripttel. Nyitott kérdések (12. pont): a „Hubi” név, és az alapszint (*Finom* vagy az első héten *Teljes*).

**Kikapcsolva (2026-11-15):** a projekt gazdája kérésére Hubi lekerült az oldalról, de semmi nincs törölve.
- Kapcsoló: `src/core/mascots/config.ts` (`MASCOTS_ENABLED = false`). A `Mascot` nem rajzol, a `HubiSays` sima `.flavor` sorrá válik (ugyanaz, mint Hubi előtt); a `MascotCompanion`, `StatusCard`, `Wardrobe`, `HubiLineup` a hívás helyén nem renderelődik.
- Megmaradt: `src/core/mascots/*`, `src/ui/mascots/*`, `src/assets/mascots/*`, az i18n `mascot.*` szövegei, a CSS, a `plans/mascots/*` (prompt-lap, tisztító szkript, forráskép).
- Tesztek: `tests/mascots.test.tsx` bekapcsolt kapcsolóval (`vi.mock`) fut tovább, hogy visszakapcsoláskor is működjön; `tests/mascotsOff.test.tsx` ellenőrzi, hogy kikapcsolva nincs kép és buborék. 837/837, typecheck és lint tiszta.
