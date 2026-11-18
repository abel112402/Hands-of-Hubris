# Hubi pózok: prompt-lap és átvételi útmutató

A kód már minden pózt fogad (`src/ui/mascots/Mascot.tsx`): ha egy `src/assets/mascots/<jelmez>/<póz>.webp` fájl létezik, azt mutatja, különben az `idle` képet. Ez a lap ahhoz kell, hogy a hiányzó 32 kép (8 jelmez × 4 póz) egységesen készüljön el, képgenerálással vagy illusztrátorral.

Referencia: `plans/mascots/source-lineup.webp` és a kivágott `src/assets/mascots/<jelmez>/idle.webp` képek. **Mindig csatold referenciaként az adott jelmez `idle` képét.**

## 1. Közös stílus-prompt (minden kép elé)

> Cute chibi-style cartoon character, same character as the reference image: a young kid with messy copper-orange hair, big round blue eyes, rosy round cheeks, small smile. Thick dark outlines, flat colours with soft cel shading, clean children's-book illustration style. Full body, centered, facing the viewer at a slight three-quarter angle. Plain pure white background, **no ground shadow, no floor, no text**. Keep the face, hair, proportions, outline thickness and costume colours exactly as in the reference.

Zombinál a második mondat helyett: *a friendly cartoon zombie kid with pale green skin, messy olive-green hair, round pale yellow eyes, small open mouth with one tooth; cute, not scary, no blood or gore.*

## 2. Ami nem változhat (ellenőrzőlista minden képhez)

- Fej-test arány (nagy fej, kb. 1:1,6), kerek arc, pirospozsgás orca, nagy kék szem (zombi: sárgás).
- Vörös-narancs kócos haj (zombi: olajzöld kócos haj, zöld bőr).
- Vastag sötét kontúr, lapos színezés, ugyanaz a paletta, mint az `idle` képen.
- A jelmez minden eleme megvan, ugyanabban a színben (lásd 3. pont).
- Nincs talajárnyék, nincs háttér, nincs felirat.

## 3. Jelmezek (a promptba a stílus után)

| Jelmez | Leírás a promptba |
|---|---|
| `wizard` | long dark-blue robe with light-blue embroidered trim, brown belt with gold buckle, tall pointy blue wizard hat with a light band, gnarled wooden staff, brown boots |
| `scientist` | white lab coat, round glasses, dark trousers, brown shoes, holding a conical flask with green liquid |
| `knight` | chainmail shirt under silver plate armour, brown leather belt and shoulder strap, round wooden shield with a metal boss, short steel sword, armoured boots |
| `farmer` | denim overalls with rolled-up legs, beige shirt with rolled sleeves, brown boots, wooden pitchfork |
| `smith` | brown leather apron over a grey-green shirt, thick brown gloves, blue trousers, brown boots, small sledgehammer |
| `pirate` | black tricorn hat with gold trim, black eyepatch on the right eye, dark teal coat with gold trim and buttons, brown vest and belt, white shirt, brown trousers and boots |
| `suit` | navy business suit, white shirt, blue tie, black sunglasses, black shoes, black briefcase |
| `zombie` | torn olive-brown shirt and ragged dark-green trousers with patches, barefoot, arms reaching forward |

## 4. Pózok (a promptba a jelmez után)

| Póz | Hol látszik | Leírás a promptba |
|---|---|---|
| `point` | üres oldalak, tippek | raising one index finger in the air as if giving a helpful tip, other hand holding the prop, confident friendly smile |
| `cheer` | mérföldkő, fázis/útmutató kész, csoportkép | both arms raised in celebration (prop held up high), jumping slightly, big open happy smile, eyes closed in joy |
| `think` | helyzetjelentés, betöltés, AI-várakozás | one hand on the chin, head slightly tilted, eyebrows a little raised, thoughtful look; prop in the other hand |
| `peek` | a szerkesztő sarka | only head, shoulders and both hands visible, peeking up over a bottom edge as if from behind a wall, hands gripping the edge, curious smile; cropped at the chest |

Jelmezenkénti finomítás (a pózleírás végére):

- **wizard** `cheer`: sparkles burst from the staff · `think`: stroking an imaginary beard.
- **scientist** `cheer`: flask raised like a trophy · `point`: pointing finger next to the flask.
- **knight** `cheer`: sword raised high, shield on the arm · `point`: pointing with the sword hand's index finger, sword lowered.
- **farmer** `cheer`: pitchfork held overhead with both hands.
- **smith** `cheer`: hammer raised like a winner · `think`: hammer resting on the shoulder.
- **pirate** `cheer`: hat waved in the air · `point`: pointing forward like "land ho!".
- **suit** `cheer`: briefcase raised, sunglasses still on · `think`: adjusting the sunglasses.
- **zombie** `cheer`: arms flailing happily, one shoe-less foot lifted · `point`: one arm raised with a wobbly finger · `think`: scratching the head, slightly confused.

## 5. Technikai követelmények

- Forrás: PNG vagy WebP, legalább 600 px magas, a figura a kép kb. 80%-át tölti ki.
- Háttér: tiszta fehér (`#ffffff`), árnyék nélkül. Ha mégis van talaj-ellipszis, a tisztító szkript eltávolítja.
- Fájlnév: `<jelmez>-<póz>.png` (pl. `knight-cheer.png`).

## 6. Átvétel az appba

```bash
bash plans/mascots/clean-cutout.sh knight-cheer.png src/assets/mascots/knight/cheer.webp
```

A szkript: fehér háttér le a sarkoktól, a zárt fehér lyukak (pl. kar és test között) is, talajárnyék le az alsó sorokból indítva, az alfa-perem 1 px-szel beljebb és simítva, levágás, 600 px-es magasságra kicsinyítés, WebP. Utána nézd meg sötét és világos háttéren is (a szkript készít egy `*-check.png` előnézetet a forrás mellé). Ha egy világos ruharész (pl. a tudós köpenye) is eltűnt, a `--keep-holes` kapcsolóval futtasd újra, és a lyukakat kézzel töröld.

Ellenőrzés az appban: `npx vitest run tests/mascots.test.tsx`, aztán a böngészőben a megfelelő hely (üres szekció → `point`, Haladás panel → `think`, mérföldkő-buborék → `cheer`, editor sarka → `peek`).
