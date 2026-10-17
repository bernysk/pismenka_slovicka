# Písmenká – hľadač slovenských slov

**👉 Aplikácia: https://bernysk.github.io/pismenka_slovicka/**

Malá webová aplikácia na hľadanie slovenských slov podľa písmen. Beží celá v prehliadači, bez servera.

**Čo vie:**

- **písmená, ktoré slovo musí obsahovať** – pre každé písmeno (alebo skupinu písmen, napr. `ch`) určíš
  - **polohu:** kdekoľvek, na začiatku, na konci, v strede, nie na začiatku, nie na konci, na konkrétnej pozícii
  - **počet:** aspoň / presne / najviac N-krát
- **písmená, ktoré slovo nesmie obsahovať**
- **vzor** – napr. `m??ka` (`?` = jedno ľubovoľné písmeno, `*` = čokoľvek)
- **dĺžka slova** od–do
- **zoradenie podľa častosti používania** (predvolené), abecedne alebo podľa dĺžky
- **„ch“ sa počíta ako jedno písmeno** – pri polohe, počte, dĺžke, vzore aj nechcených písmenách („c“ ani „h“ sa s ním nezhodujú)
- **vhodné pre deti** – skryje vulgarizmy a nadávky (značky z Wiktionary + zoznam `skripty/nevhodne.txt`)
- **iba základné tvary** – skryje vyskloňované a vyčasované tvary (približné, pozri nižšie)
- ignorovanie diakritiky, skrytie vlastných mien a skratiek, iba slová s výkladom
- po kliknutí na slovo sa zobrazí výklad (slovensky a/alebo anglicky), ak existuje

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
| `data/slova.tsv` | slová pre aplikáciu (slovo, slovný druh, príznak výkladu, počet výskytov, príznaky T = tvar, N = nevhodné) |
| `data/vyklady.json` | výklady, načítajú sa až pri prvom otvorení detailu |
| `slova.json`, `slova_s_vykladom.json`, `slova.txt` | úplný zoznam slov na ďalšie použitie |
| `skripty/` | skripty, ktoré dáta zostavia zo zdrojov (pozri `skripty/README.md`) |

Dáta pre aplikáciu sa obnovia príkazom:

```bash
python -I skripty/build_web.py slova.json data --freq zdroje/sk_full.txt --dic zdroje/sk_SK.dic --aff zdroje/sk_SK.aff --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --blocklist skripty/nevhodne.txt
```

Odkazy na zdrojové súbory sú v `skripty/README.md`.

**Ako sa rozpozná základný tvar:** slovo je tvar, ak ho Hunspell označí ako tvar iného slova (`st:byť`, pád, čas),
ak vznikne z pravidiel skloňovania (`.aff`), ak je medzi tvarmi vo Wiktionary, alebo ak je to kmeň známeho slova
+ bežná koncovka. Je to heuristika – občas skryje neohybné slovo (napr. „dokonca“) alebo prepustí tvar (napr. „ľudia“).
Nevhodné slová sa dajú doplniť do `skripty/nevhodne.txt` (regulárne výrazy, `!` = výnimka).

## Zdroje a licencie

- Zoznam slov: [hunspell-sk](https://github.com/sk-spell/hunspell-sk) – MPL 2.0 (`LICENSE-hunspell-sk.txt`)
- Slovenské výklady: [Wikislovník](https://sk.wiktionary.org) – CC BY-SA 4.0
- Anglické výklady: [Wiktionary](https://en.wiktionary.org) cez [kaikki.org](https://kaikki.org/dictionary/Slovak/) – CC BY-SA 4.0
- Frekvencia slov: [FrequencyWords](https://github.com/hermitdave/FrequencyWords) (`content/2018/sk/sk_full.txt`, z titulkov OpenSubtitles) – CC BY-SA 4.0.
  Počíta sa výskyt presne základného tvaru slova, nie všetkých jeho tvarov, a jazyk titulkov je hovorový.

Výklady a frekvencie sú preto šírené pod licenciou CC BY-SA 4.0.
