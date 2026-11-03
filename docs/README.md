# Dokumentáció – Hands of Hubris (A Köd Szigete)

Ez a mappa a projekt teljes dokumentációját tartalmazza. Minden fájl sablon: a `<...>` és a leírások helyére kerül a tényleges tartalom.

## Konvenciók
* Formátum: Markdown (`.md`), magyar nyelven; kódnevek, azonosítók angolul.
* Minden dokumentum tetején: **Státusz** (`Vázlat` / `Felülvizsgálat alatt` / `Elfogadott`), **Felelős**, **Utolsó módosítás**.
* Új funkció előtt: `templates/feature_spec_template.md`. Nagy technikai döntés: `adr/` + `templates/adr_template.md`.
* `game_design.md` a magas szintű, még nem végleges alapdokumentum; a részletek a `01_design/` fájljaiba kerülnek, és onnan hivatkozunk vissza.

## Tartalomjegyzék

| Mappa | Tartalom |
|-------|----------|
| [game_design.md](game_design.md) | Általános játékleírás (forrásdokumentum) |
| [00_overview/](00_overview/) | Vízió, szójegyzék, ütemterv |
| [01_design/](01_design/) | Részletes játéktervezési dokumentumok rendszerenként |
| [02_technical/](02_technical/) | Architektúra, kódolási szabályok, technikai rendszerek |
| [03_art_audio/](03_art_audio/) | Művészeti és hangirányok, asset pipeline |
| [04_production/](04_production/) | Mérföldkövek, backlog, kockázatok, workflow |
| [05_qa/](05_qa/) | Tesztterv, balansz, hibajelentés |
| [adr/](adr/) | Architektúra döntési naplók (Architecture Decision Records) |
| [templates/](templates/) | Újrahasznosítható sablonok (feature, tartalom, ADR) |
