# Játéktervezési Dokumentum (Munkacím: A Köd Szigete)

## 1. Alapkoncepció és Tematika
* **Műfajok:** Túlélő (Don't Starve jellegű), RPG, Kaland, Bázisépítő és Város-menedzsment (City-builder/Management).
* **Környezet:** Az Ipari Forradalom kora, egy sötét, misztikus és mágikus lakatlan szigettel ötvözve. 
* **Történeti Alapvetés:** A főhős egy brit birodalmi katona, aki hajótörést szenved egy térképeken nem szereplő, mágikus anomáliákkal teli szigeten. A racionális, iparosodott világból érkező karakternek meg kell tanulnia túlélni egy olyan helyen, ahol az ősi mágia és a természetfeletti erők uralkodnak. 

## 2. Nehézségi Fokozatok (Difficulty Levels)
A játék élménye három alapvető nehézségi szintre bomlik, amelyek nemcsak a harcot, hanem a túlélési és menedzsment rétegeket is skálázzák:
* **Könnyű (Easy):** Megbocsátóbb túlélési mutatók (éhség, szomjúság lassabban csökken). Az ellenségek életereje és sebzése alacsonyabb. Az NPC-k alapvető igényei könnyen kielégíthetők, a város gazdasága stabilabb.
* **Közepes (Medium):** Kiegyensúlyozott kihívás. A játékosnak figyelnie kell a logisztikára és a harci taktikára.
* **Nehéz (Hard):** Brutális túlélési körülmények. Az éhség és a korrupció gyorsan nő. A szörnyek agresszívek és nagyot sebeznek. Az NPC-k rendkívül igényesek, a legkisebb ellátmány-kimaradás is komoly morálvesztést okoz a városban.

## 3. Frakciók, Fővárosok és Diplomácia
A szigeten 4 teljesen eltérő, saját történelemmel, célokkal és fő karakterekkel rendelkező frakció él. 
* **A Békés Fővárosok:** Mind a 4 frakció rendelkezik egy-egy saját, békés, nem elfoglalható (védett) fővárossal a saját és az elfoglalható bázisokon kívül. Ezek a városok a diplomácia, a történetvezetés és a kereskedelem központjai. Interakcióba léphetünk velük, egyedi küldetéseket vehetünk fel, és itt zajlik a magas szintű kereskedelem.
* **Dinamikus Viszonyrendszer:** A játékos tettei folyamatosan alakítják a frakciókkal való kapcsolatot. Egyik frakció támogatása magával vonhatja egy másik meggyűlöltetését.
* **Játékstílus Befolyásolása:** A szövetségek határozzák meg a játék nehézségét, a fókuszpontokat, és a feloldható skilleket/itemeket.
* **Végkifejlet:** A játék több lehetséges befejezéssel rendelkezik.

## 4. A Világ és Felfedezés (Biomok)
A sziget különböző biomokból (zónákból) áll, egyedi atmoszférával és nyersanyagokkal.
* **Progresszió:** A nehezebb biomokba való bejutás történeti előrehaladáshoz, frakció-kapcsolathoz, vagy specifikus "Boss Fight"-ok legyőzéséhez kötött.
* **Kezdő Biom:** Békésebb terület. Itt a túlélési mechanikák könnyebbek, ideális a kezdő bázis felépítésére.
* **Helyőrségek Elfoglalása:** A kezdő biom kivételével minden új város alapításához először katonailag vagy taktikailag el kell foglalni egy bázis területet (NPC-ktől) az adott régióban.

## 5. Városmenedzsment és Logisztika
A bázisépítés egy komplex, szimulált mikrogazdaság.
* **Közvetett Nyersanyag-hozzáférés:** A játékos nem fér hozzá közvetlenül a város által termelt nyersanyagokhoz. A megtermelt javakat a játékos olcsóbban, saját célra vásárolhatja meg a várostól (a dolgozó NPC-ktől).
* **Utasítási Rendszer:** A város lakóihoz (építők, kereskedők, kovács, bányász stb.) mi adhatunk ki utasításokat, hogy mire használják az erőforrásokat és idejüket.
* **Belső Gazdaság és Igények:** Minden NPC használja a város erőforrásait a saját igényei kielégítésére, de nekik is meg kell vásárolniuk a dolgokat, amire szükségük van. 
* **Bővíthetőség (Fejlesztői fókusz):** A rendszert úgy kell implementálni, hogy a jövőben könnyen bővíthető legyen új funkciókkal, statisztikákkal és igényekkel a core kód módosítása nélkül.
* **Logisztikai Hálózat:** Bizonyos dolgokhoz más biomból származó nyersanyag kell. Ezt manuálisan vagy másik bázisból indított szállítmányozással lehet megoldani.

## 6. Városi Progresszió: Early Game Balance
A korai szakaszban a gazdaság zárt: a vásárlás/eladás kedvezőtlen a játékosnak, de kedvező a városnak. Csak közvetlenül az NPC-től tudunk vásárolni vagy neki eladni.
**Korai (Early Game) Épületek:**
* **Lakóház:** Minden NPC-nek szüksége van rá. Kezdetben 4 NPC fér el benne.
* **Bányász:** Érceket gyűjt és olvaszt be. Mindkettő megvásárolható tőle. A hatékonyság és a bányászható ércek típusa folyamatosan fejlődik.
* **Favágó:** Fát termel.
* **Farmer:** Élelmiszert termel. Később többet és jobb minőségű ételeket/italokat.
* **Kocsma:** Alapvető szórakozás biztosítása. Kezdő szintű random questeket is itt lehet felvenni.
* **Iskola:** Képezhetők a fiatal NPC-k, feltétele egy tanár alkalmazása.

## 7. NPC Rendszer és Statisztikák
Az NPC-k hús-vér karakterekként funkcionálnak, viszonyrendszerrel, felszereléssel és random eventekkel (házasság, romantika, viszály stb.). Létrehozhatók belőlük kisebb zsoldos seregek is.
* **Igények (Needs):** Minden NPC-nek van alapvető igénye (pl. étel, ital), ami a szintjük fejlődésével nő. A munkaspecifikus igények hiánya nem okoz kárt bennük, viszont leállítja a termelést.
* **NPC Statisztikák:**
  * **Strength (Erő):** Fizikai munka, harc.
  * **Intelligence (Intelligencia):** Crafting, tanítás, bonyolult gépek.
  * **Speed (Sebesség):** Mozgás és munkatempó.
  * **Kindness (Kedvesség):** Szociális viselkedés.
  * **Ravaszság:** Pl. jobb kereskedő képesség.
  * **Health (Életerő):** Fizikai ellenállóképesség.
  * **Stability (Stabilitás):** Védelem a depresszió vagy mágikus korrupció ellen.
  * **Mana:** Varázslatokhoz, mágikus feladatokhoz.
  * **Talent (Tehetség):** Csak fiatalkorban számít, az Iskolában gyorsabban fejlődik tőle a karakter.

## 8. Szerepjáték és Karakterfejlődés (Saját Karakter)
Alapvető survival mechanikák (éhség, szomjúság), skillek, tapasztalati pontok.
* **Kasztok (Cast típusok):** Harcos, Assassin, Ranger, Light wizard, Dark wizard, Nature wizard, Builder.

## 9. Tárgyak (Item) Ökoszisztéma
A tárgyaknak van ritkaságuk (Rarity) és minőségük (Quality), ami változtatja a tulajdonságaikat.
* **Típusok:** Építőelemek (Building item), Nyersanyagok (Resource item), Szerszámok (Tools), Gépek (Machines), Fegyverek (Weapons), Páncélok (Armors), Fogyóeszközök (Debuff/Buff items), Kiegészítők (Buff/Cursed Accessories), Dekoráció (Decoration), Jelzőfények/Aurák (Beacons/Effect items), Kincsek/Szemét (Valuable/trash items).

## 10. Napszakok, Időjárás és Események
* **Nappal / Éjszaka:** Nappal a túlélés könnyebb. Éjszaka a látótávolság csökken, jóval erősebb, agresszívabb szörnyek jönnek elő.
* **Special Eventek:** Telihold, Vérhold, Ünnepek (Holiday) stb., amelyek megváltoztatják a világ szabályait egy rövid időre.

## 11. Kereskedelem
* **Vándorkereskedő:** Véletlenszerűen bukkan fel a világban, ritkaságokkal.
* **Városi Kereskedő (Piac):** A bázison létrehozható a Piac, amelyhez kereskedő NPC rendelhető. A kínálat függ az előrehaladástól, a frakciókkal való viszonytól és a város nyersanyag készletétől.

---

### Tervezői észrevételek (Átgondolandó kérdések a fejlesztéshez):
1. **Pénzáramlás az NPC-knél:** Miből van pénzük megvenni az igényeiket? A játékos fizet nekik bért, vagy a náluk elköltött pénzből tartják fenn magukat?
2. **Kincstár és Adó:** Ha a vásárlás a városnak kedvez, ki kezeli ezt a vagyont, és mire lehet elkölteni?
3. **Életciklus:** Ha vannak "fiatal NPC-k", akkor a karakterek öregszenek és meg is halnak végelgyengülésben? Hogyan pótlódik a lakosság?
4. **Alapvető igények hiánya:** Mi a pontos büntetés, ha az NPC nem kap ételt/italt? Meghal, elmegy a városból, vagy fellázad?
5. **Raktárkapacitás:** Szükség lesz raktár limitalásra, nehogy a végtelenül termelő NPC-k túlterheljék a játék gazdaságát és memóriáját.