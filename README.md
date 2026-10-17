# Písmenká – hľadač slovenských slov

**👉 Aplikácia: https://bernysk.github.io/pismenka_slovicka/**

Malá webová aplikácia na hľadanie slovenských slov podľa písmen. Beží celá v prehliadači, bez servera.
Obsahuje ~90 000 slov v **základnom tvare** s gramatickými vlastnosťami z morfologického slovníka MorfFlex SK.

**Čo vie:**

- **písmená, ktoré slovo musí obsahovať** – pre každé písmeno (alebo skupinu písmen, napr. `ch`) určíš
  - **polohu:** kdekoľvek, na začiatku, na konci, v strede, nie na začiatku, nie na konci, na konkrétnej pozícii
  - **počet:** aspoň / presne / najviac N-krát
- **písmená, ktoré slovo nesmie obsahovať**
- **vzor** – napr. `m??ka` (`?` = jedno ľubovoľné písmeno, `*` = čokoľvek)
- **dĺžka slova** od–do
- **slovný druh** – podstatné mená, prídavné mená, slovesá, príslovky, zámená, číslovky, predložky, spojky, častice, citoslovcia
- **rod** (mužský / ženský / stredný), **životnosť** (životné / neživotné) a **pomnožné** podstatné mená
- **zoradenie podľa častosti používania** (predvolené), abecedne alebo podľa dĺžky
- **„ch“ sa počíta ako jedno písmeno** – pri polohe, počte, dĺžke, vzore aj nechcených písmenách
- **vhodné pre deti** – skryje vulgarizmy a nadávky (značky z Wiktionary + zoznam `skripty/nevhodne.txt`)
- ignorovanie diakritiky, skrytie vlastných mien a skratiek, iba slová s výkladom
- po kliknutí na slovo sa zobrazí slovný druh, rod, životnosť, frekvencia a výklad (slovensky a/alebo anglicky)

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
| `data/slova.tsv` | slová pre aplikáciu: slovo, slovný druh, príznak výkladu, frekvencia, príznaky (`m`/`f`/`s` rod, `A`/`I` životné/neživotné, `P` pomnožné, `N` nevhodné) |
| `data/vyklady.json` | výklady, načítajú sa až pri prvom otvorení detailu |
| `slova.json`, `slova_s_vykladom.json`, `slova.txt` | úplný zoznam slov s vlastnosťami na ďalšie použitie |
| `morfflex/morfflex-sk.tsv.xz` | **všetky tvary** overených slov z MorfFlex SK s gramatickými značkami (zbalené, pozri nižšie) |
| `skripty/` | skripty, ktoré dáta zostavia zo zdrojov (pozri `skripty/README.md`) |

### Tvary slov (MorfFlex SK)

Pôvodný MorfFlex SK má 1,5 GB (28 mil. riadkov, 366 000 lem – veľa z nich umelo odvodených).
`morfflex/morfflex-sk.tsv.xz` obsahuje iba lemy, ktoré sú aj v aplikácii, s tvarmi zapísanými ako rozdiel
oproti leme a skomprimované xz. Do pôvodného formátu (`lema  tvar  značky  rod/vid`) sa rozbalí:

```bash
python -I skripty/morfflex_rozbal.py morfflex/morfflex-sk.tsv.xz > zdroje/slk-overene
```

Značky sú v schéme [UniMorph](https://unimorph.github.io/schema/), napr. `N;GEN;PL` = podstatné meno, genitív, množné číslo.

### Obnovenie dát

```bash
python -I skripty/build_web.py --morfflex zdroje/slk --slovnik zdroje/slova.json --freq zdroje/sk_full.txt --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --blocklist skripty/nevhodne.txt --out .
```

Postup a odkazy na zdrojové súbory sú v `skripty/README.md`.
Nevhodné slová sa dajú doplniť do `skripty/nevhodne.txt` (regulárne výrazy, `!` = výnimka).

## Zdroje a licencie

- Základné tvary a gramatika: **MorfFlex SK 170914** – Jan Hajič, Jan Hric, ÚFAL MFF UK ([LINDAT](http://hdl.handle.net/11234/1-3277)),
  cez [UniMorph slk](https://github.com/unimorph/slk) – **CC BY-NC-SA 4.0 (iba nekomerčne)**
- Zámená, spojky, predložky, častice, číslovky a overenie slov: [hunspell-sk](https://github.com/sk-spell/hunspell-sk) – MPL 2.0 (`LICENSE-hunspell-sk.txt`)
- Slovenské výklady: [Wikislovník](https://sk.wiktionary.org) – CC BY-SA 4.0
- Anglické výklady: [Wiktionary](https://en.wiktionary.org) cez [kaikki.org](https://kaikki.org/dictionary/Slovak/) – CC BY-SA 4.0
- Frekvencia: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (`content/2018/sk/sk_full.txt`, z titulkov OpenSubtitles) – CC BY-SA 4.0.
  Frekvencia slova je súčet výskytov všetkých jeho tvarov; jazyk titulkov je hovorový.

Keďže dáta obsahujú MorfFlex SK, celok je určený **iba na nekomerčné použitie** (CC BY-NC-SA 4.0).
