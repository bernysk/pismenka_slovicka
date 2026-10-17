# Písmenká – hľadač slovenských slov

**👉 Aplikácia: https://bernysk.github.io/pismenka_slovicka/**

Malá webová aplikácia na hľadanie slovenských slov podľa písmen. Beží celá v prehliadači, bez servera.
Obsahuje ~160 000 slov v **základnom tvare** s gramatickými vlastnosťami z MorfFlex SK a morfologickej databázy
Slovenského národného korpusu (SNK) a s frekvenciou zo SNK.

**Čo vie:**

- **písmená, ktoré slovo musí obsahovať** – pre každé písmeno (alebo skupinu písmen, napr. `ch`) určíš
  - **polohu:** kdekoľvek, na začiatku, na konci, v strede, nie na začiatku, nie na konci, na konkrétnej pozícii
  - **počet:** aspoň / presne / najviac N-krát
- **písmená, ktoré slovo nesmie obsahovať**
- **vzor** – napr. `m??ka` (`?` = jedno ľubovoľné písmeno, `*` = čokoľvek)
- **dĺžka slova** od–do (v písmenách) a **počet slabík** od–do (ma-čka = 2, roz-práv-ka = 3, krk = 1)
- **slovný druh** – podstatné mená, prídavné mená, slovesá, príslovky, zámená, číslovky, predložky, spojky, častice, citoslovcia
- **ako bežné slovo** – všetky / aj zriedkavé (10+) / bežné (1 000+, predvolené) / veľmi bežné (10 000+)
  výskytov v Slovenskom národnom korpuse; zmiznú napr. „fiťfiriť“ či „kresťanskosť“
- **rod** (mužský / ženský / stredný), **životnosť** (životné / neživotné) a **pomnožné** podstatné mená
- **zoradenie podľa častosti používania** – podľa Slovenského národného korpusu (predvolené), v knihách (pôvodná
  slovenská beletria), v hovorenej reči (korpus hovorenej slovenčiny) alebo vo Wikipédii; abecedne alebo podľa dĺžky
- **„ch“ sa počíta ako jedno písmeno** – pri polohe, počte, dĺžke, vzore aj nechcených písmenách
- **vhodné pre deti** – skryje vulgarizmy a nadávky (značky z Wiktionary + zoznam `skripty/nevhodne.txt`)
- ignorovanie diakritiky, skrytie vlastných mien a skratiek, iba slová s výkladom
- po kliknutí na slovo sa zobrazí slovný druh, rod, životnosť, počet slabík, frekvencia a výklad (Wikislovník, anglický Wiktionary
  a prvá veta článku slovenskej Wikipédie s odkazom na celý článok) a **významové vzťahy** – synonymá, antonymá,
  nadradené a podradené pojmy (strom → drevina; lipa, dub…), na ktoré sa dá kliknúť
- **tabuľka tvarov** pri bežných slovách (~28 000 slov s 1 000+ výskytmi v SNK): skloňovanie podstatných a
  prídavných mien (6 pádov s otázkami, čísla, rody, stupňovanie) a časovanie slovies (prítomný, minulý čas,
  rozkazovací spôsob)

## Spustenie

Na GitHub Pages: **Settings → Pages → Source: Deploy from a branch → `main` / `(root)`**.

Lokálne (stránka načítava dáta cez `fetch`, preto ju treba otvoriť cez server, nie dvojklikom):

```bash
python -m http.server 8765
```

a otvor http://localhost:8765.

## Štruktúra

| Súbor | Obsah |
|---|---|
| `index.html`, `style.css`, `app.js` | aplikácia |
| `data/slova.tsv` | slová pre aplikáciu (formát 2, popis v hlavičke `app.js` a `skripty/build_web.py`): slovo, kód slovného druhu, príznak výkladu, príznaky (`m`/`f`/`s` rod, `A`/`I` životné/neživotné, `P` pomnožné, `N` nevhodné), frekvencie (SNK, knihy, hovorená reč, Wikipédia), počet slabík |
| `data/vyklady/<písmeno>.json`, `data/synonyma/<písmeno>.json` | výklady a významové vzťahy rozdelené podľa prvého písmena – detail slova načíta len jeden malý súbor |
| `data/tvary/<písmeno>.json`, `data/tvary/znacky.json` | tvary bežných slov pre tabuľku skloňovania a časovania (`skripty/tvary_web.py`, spolu ~0,4 MB po gzip) |
| `export/` | **úplné dáta na ďalšie použitie** vo formáte JSON Lines (jeden záznam na riadok): `slova.jsonl` (slová s vlastnosťami, frekvenciami a výkladmi), `synonyma.jsonl` (synonymá, antonymá, nadradené a podradené pojmy so zdrojom), `slova.txt` – popis polí v [`export/README.md`](export/README.md) |
| `morfflex/morfflex-sk.tsv.xz` | **všetky tvary** overených slov z MorfFlex SK s gramatickými značkami (zbalené, pozri nižšie) |
| `skripty/` | skripty, ktoré dáta zostavia zo zdrojov (pozri `skripty/README.md`); všetko naraz: `skripty/zostav.py` |
| `docs/zdroje.md` | **odkiaľ sú dáta**: názvy a URL zdrojových súborov, verzie, licencie a ktorý skript vytvára ktorý súbor; `docs/zdroje.sha256` = kontrolné súčty použitých zdrojov |
| `docs/plan-tvary.md` | plán ďalšieho rozvoja: tabuľka tvarov (hotové), hľadanie v tvaroch, anglické ekvivalenty z WordNetu |
| `LICENSE` | licencie: kód MIT, dáta CC BY-NC-SA 4.0 |
| `licenses/` | licenčné texty zdrojov (hunspell-sk, OpenThesaurus-SK) |

### Tvary slov (MorfFlex SK)

Pôvodný MorfFlex SK má 1,5 GB (28 mil. riadkov, 366 000 lem – veľa z nich umelo odvodených).
`morfflex/morfflex-sk.tsv.xz` obsahuje iba lemy, ktoré sú aj v aplikácii, s tvarmi zapísanými ako rozdiel
oproti leme a skomprimované xz. Do pôvodného formátu (`lema  tvar  značky  rod/vid`) sa rozbalí:

```bash
python -I skripty/morfflex_rozbal.py morfflex/morfflex-sk.tsv.xz > zdroje/slk-overene
```

Značky sú v schéme [UniMorph](https://unimorph.github.io/schema/), napr. `N;GEN;PL` = podstatné meno, genitív, množné číslo.

### Obnovenie dát

Jeden príkaz stiahne chýbajúce zdroje do `zdroje/` (~2,5 GB, necommituje sa) a zostaví všetky dáta:

```bash
python -I skripty/zostav.py
```

Ďalšie možnosti: `--bez-stahovania`, `--od web` (začať od kroku), `--len synonyma` (len jeden krok).
Zdroje, ich verzie a tok dát sú v [`docs/zdroje.md`](docs/zdroje.md), jednotlivé skripty v `skripty/README.md`.
Nevhodné slová sa dajú doplniť do `skripty/nevhodne.txt` (regulárne výrazy, `!` = výnimka).

## Zdroje a licencie

- **Slovenský národný korpus, JÚĽŠ SAV** ([korpus.sk](https://korpus.sk)):
  - frekvenčné zoznamy lem korpusu prim-11.0-public-all (hlavná frekvencia), prim-11.0-public-img-sk (slovenská
    beletria – „v knihách“) a s-hovor-6.0 (hovorená reč)
  - Morfologická databáza SNK 2015-02-05 – overenie slov, doplnenie lem, rodu a životnosti (CC BY-SA 4.0 / GNU AGPL 3 / GNU FDL 1.3; podľa SNK len na vedecko-výskumné ciele)
  - Slovenský WordNet 2013-01-23 – synonymá, antonymá, nadradené a podradené pojmy (CC BY-SA 3.0 / GNU AGPL 3 / ODbL 1.0)
- Základné tvary a gramatika: **MorfFlex SK 170914** – Jan Hajič, Jan Hric, ÚFAL MFF UK ([LINDAT](http://hdl.handle.net/11234/1-3277)),
  cez [UniMorph slk](https://github.com/unimorph/slk) – **CC BY-NC-SA 4.0 (iba nekomerčne)**
- Zámená, spojky, predložky, častice, číslovky a overenie slov: [hunspell-sk](https://github.com/sk-spell/hunspell-sk) – MPL 2.0 (`licenses/hunspell-sk.txt`)
- Slovenské výklady: [Wikislovník](https://sk.wiktionary.org) – CC BY-SA 4.0
- Anglické výklady: [Wiktionary](https://en.wiktionary.org) cez [kaikki.org](https://kaikki.org/dictionary/Slovak/) – CC BY-SA 4.0
- Synonymá: [OpenThesaurus-SK](https://github.com/LibreOffice/dictionaries/tree/master/sk_SK) (Tibor Bako, Zdenko Podobný) – voľná licencia typu MIT (`licenses/openthesaurus-sk.txt`);
  synonymá a antonymá aj z Wikislovníka a Wiktionary (CC BY-SA); antonymá so záporom ne- (pekný ↔ nepekný) sú odvodené automaticky
- Frekvencia a výklady zo [slovenskej Wikipédie](https://sk.wikipedia.org) (dump článkov, `skripty/wiki_freq.py`) – CC BY-SA 4.0
- Frekvencia z filmových titulkov (už sa v aplikácii nezobrazuje, ostáva v dátach): [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (`content/2018/sk/sk_full.txt`, z titulkov OpenSubtitles) – CC BY-SA 4.0.
  Frekvencia slova je súčet výskytov všetkých jeho tvarov; jazyk titulkov je hovorový.

Keďže dáta obsahujú MorfFlex SK, celok je určený **iba na nekomerčné použitie** (CC BY-NC-SA 4.0).
Kód aplikácie a skriptov je pod licenciou MIT. Podrobnosti sú v súbore [`LICENSE`](LICENSE).
