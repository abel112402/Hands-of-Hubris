# Városmenedzsment és Logisztika

**Státusz:** Vázlat | **Utolsó módosítás:** <dátum>

## 1. Rendszer áttekintése
<Mikrogazdaság működése magas szinten, ábra.>

## 2. Bázis és városalapítás
<Alapítás feltételei, bázis szintek, térbeli elrendezés, építési rendszer (grid/szabad).>

## 3. Épületek
Sablon épületenként (lásd `templates/content_entry_template.md`):
### <Épület neve>
* **Funkció:** <...>
* **Kapacitás / szintek:** <...>
* **Építési költség és feltétel:** <...>
* **Dolgozók (szerepkör, min. statok):** <...>
* **Bemenet → kimenet:** <erőforrás-áramlás>
* **Fejlesztési ág:** <...>

Tervezett épületek: Lakóház, Bányász, Favágó, Farmer, Kocsma, Iskola, Piac, <további>.

## 4. Utasítási rendszer
<Milyen parancsokat adhat a játékos, prioritások, UI.>

## 5. Gazdasági modell
* **Pénzáramlás:** <bér, adó, kincstár>
* **Árképzés:** <vételi/eladási árrés, early game kedvezőtlen arány>
* **Közvetett nyersanyag-hozzáférés:** <hogyan vásárol a játékos az NPC-től>
* **Raktárkapacitás és limitek:** <...>

## 6. Logisztikai hálózat
<Bázisok közötti szállítás, útvonalak, kockázatok, biomfüggő nyersanyagok.>

### Tervezőeszköz-mezők (Town Management modul)
* **Bázisok és raktárak:** az útvonalak végpontjai valódi bázis-bejegyzések (kezdő-, minimum- és célkészlet, kapacitás, utánpótlás módja).
* **Útvonalak:** szállítás típusa, kapacitás/út, utak száma időegységenként, menetidő, fenntartás, kockázat, prioritás, korlátozások.
* **Becslés:** az épületek ciklusa, bemenete/kimenete, darabszáma és munkásigénye alapján a nyersanyag-egyenleg, a készlet kifogyásáig hátralévő idő, a munkaerőhiány és az útvonalak terhelése. Tervezési becslés, nem játékszimuláció; az időegység neve szabadon megadható.

## 7. Morál és elégedettség
<Mérőszámok, hatások, kritikus szintek (lázadás, távozás).>

## 8. Bővíthetőség
<Hogyan adhatók új igények/statok/funkciók a core módosítása nélkül; kapcsolódás: `02_technical/architecture.md`.>
