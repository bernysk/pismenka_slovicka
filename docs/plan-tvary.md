# Plán: sekcia A – tvary slov a ďalšie využitie stiahnutých dát

Stav: **A1 a A4 hotové** (2026-10-17), **A3 zamietnuté** (pozri nižšie), A2 odložené. Dokument popisuje, čo sa má spraviť, z akých dát
a v akom formáte, aby sa dalo pokračovať bez ďalšieho prieskumu.

## Prehľad

| # | Funkcia | Dáta, ktoré už máme | Kde sa prejaví |
|---|---|---|---|
| A1 | Tabuľka tvarov (skloňovanie, časovanie) v detaile slova – **hotové** | `morfflex/morfflex-sk.tsv.xz` | detail slova (`renderForms` v `app.js`) |
| A2 | Hľadanie v tvaroch slov („slová, ktoré majú tvar na -ami“) – **odložené**, kým nebude konkrétne cvičenie | to isté | nový prepínač pri filtroch |
| A3 | Anglický ekvivalent z WordNetu – **zamietnuté** (nesprávne významy) | `zdroje/snk/sk-wn-2013-01-23.txt.gz` (druhý záznam každého riadku) | detail slova, sekcia „Po anglicky“ |
| A4 | Označenia synoným (hovorovo, archaizmus, nesprávne…) – **hotové** | `export/synonyma.jsonl` – pole `zdroj` a text v zátvorke | detail slova, prípadne skrytie „nesprávne“ |

## A1 – tabuľka tvarov (hotové)

**Výsledok:** `skripty/tvary_web.py` (krok `tvary` v `zostav.py`) → `data/tvary/`, v aplikácii `loadForms` a
`renderForms` v `app.js`. 27 713 slov, 671 000 tvarov, 7,6 MB surové / **0,39 MB gzip spolu** (najväčší súbor
`p.json` 56 kB gzip) – oveľa menej, ako odhadovala tabuľka nižšie, takže je rezerva napr. na zníženie hranice SNK.
Odchýlky od pôvodného plánu:

- **6 pádov namiesto 7** – vokatív sa v slovenskej školskej gramatike ako pád neuvádza (a v MorfFlexe sa
  takmer vždy zhoduje s nominatívom). Podstatné mená majú teda 12 tvarov.
- Prídavné mená: stĺpce mužský / stredný / ženský (stredný hneď za mužským, aby sa rovnaké bunky zlúčili);
  životný a neživotný mužský rod sú v jednej bunke a rozpíšu sa len tam, kde sa líšia (pekného / pekný).
- Slovesá: navyše jednoslovný budúci čas (len byť: budem, budeš…). Vid v MorfFlexe nie je spoľahlivý
  (urobiť má značku IPFV), preto sa prítomný čas dokonavých slovies neoznačuje ako budúci – pod tabuľkou je poznámka.
- Varianty v bunke (psi, psy; dievčatá, dievčence): najprv tvary hlavného rodu (s najviac tvarmi), potom podľa
  frekvencie tvaru (titulky + Wikipédia).
- Homonymá: `tisíc` má v SNK frekvenciu len 108 (je tam ako číslovka), preto tabuľku nemá; `obor` zlučuje tvary
  oboch významov (obra / oboru) – MorfFlex ich má aj v jednej leme.

### Pôvodný návrh

### Veľkosť dát (zmerané 2026-10-17)

| Výber lem | Lem | Tvarov | Surové | Odhad po gzip |
|---|---|---|---|---|
| všetky v balíku | 99 632 | 9,77 mil. | 158 MB | 24 MB |
| SNK ≥ 1 000 („bežné“) | 29 395 | 3,35 mil. | 56 MB | ~8 MB |
| SNK ≥ 10 000 | 8 837 | 1,03 mil. | 17 MB | ~2,5 MB |

Najväčšiu časť tvoria prídavné mená (168 tvarov: 3 stupne × zápor × rody × čísla × pády) a slovesá (340 riadkov
vrátane záporu a príčastí). Pre tabuľku v aplikácii stačí výrazne menej:

- **podstatné mená:** 7 pádov × 2 čísla = 14 tvarov;
- **prídavné mená:** 1. stupeň, bez záporu – 7 pádov × 2 čísla × rody (m. živ., m. neživ., ž., s.); 2. a 3. stupeň len
  nominatív (krajší, najkrajší);
- **slovesá:** neurčitok, prítomný čas (6 osôb), minulý čas (príčastie l-ové: robil, robila, robilo, robili),
  rozkazovací spôsob (2. os. j. č., 1. a 2. os. mn. č.), bez záporu.

Odhad po tomto výbere: ~3–4× menej → pre „bežné“ slová **~2–3 MB gzip spolu**, rozdelené po písmenách.

### Formát

Rovnaký princíp ako `data/vyklady/` a `data/synonyma/` (pozri `skripty/spolocne.py`):

```
data/tvary/znacky.json      {"0": "N;NOM;SG", "1": "N;GEN;SG", …}         # spoločný slovník značiek
data/tvary/<x>.json         {"pes": [[0, "="], [1, "2sa"], …], …}         # [ID značky, tvar ako rozdiel oproti leme]
```

Rozdiel oproti leme je zápis z `skripty/morfflex_zbal.py`: `"="` = rovnaký tvar, `"2sa"` = odober 2 posledné
znaky lemy a pridaj „sa“ (pes → psa). Dekódovanie v JS je pár riadkov (pozri `skripty/morfflex_rozbal.py`).

### Postup

1. `skripty/tvary_web.py`: načíta `morfflex/morfflex-sk.tsv.xz`, vyberie lemy s SNK ≥ 1 000 (stĺpec 4 v
   `data/slova.tsv`), odfiltruje značky podľa zoznamu vyššie, zapíše `data/tvary/`.
2. Pridať krok `tvary` do `skripty/zostav.py` (po `morfflex`).
3. `app.js`: v `openDetail` načítať `loadShard("tvary", e.w)` a vykresliť tabuľku podľa slovného druhu
   (riadky = pády/osoby, stĺpce = čísla/rody). Slovenské názvy pádov: nominatív (kto? čo?), genitív (koho? čoho?)…
4. Pozor na homonymá: MorfFlex rozlišuje lemy značkami (`obor-1`, `tisíc\`1000-2`) – pri zápise ich zlúčiť.

## A2 – hľadanie v tvaroch

- Prepínač „hľadať aj v tvaroch slov“: pravidlá písmen a vzor sa použijú na všetky tvary, výsledkom je lema.
- Dáta: pre filtrovanie treba mať tvary hneď pri štarte, nie až v detaile. Pri ~3 mil. tvaroch je to priveľa
  pre prehliadač. Možnosti:
  1. obmedziť na lemy SNK ≥ 10 000 a len vybrané tvary (~2,5 MB gzip, načítať až po zapnutí prepínača), alebo
  2. predpočítať index koncoviek (posledné 1–4 písmená tvaru → zoznam lem) – pokryje najčastejšie použitie
     („tvar na -ami“), malý súbor.
- Odporúčanie: začať možnosťou 2.

## A3 – anglický ekvivalent z WordNetu (zamietnuté)

Overené 2026-10-17: z WordNetu by anglický výklad pribudol 11 827 slovám, ale práve slová, ktoré ho z Wiktionary
nemajú, sú často viacvýznamové a WordNet nevie, ktorý význam je myslený. Napríklad: „v“ → písmeno V, „ale“ → druh
piva (ale), „zápas“ → vojenská bitka, „zákon“ → canon. Slová, ktoré anglický výklad majú (mačka → cat), by sa
nezmenili. Prínos je malý a pridával by chyby, preto sa A3 nerobí. Ak by sa predsa robil: len pri zhode slovného
druhu, len anglické slová bez definícií, ako nenápadný riadok „anglické ekvivalenty (WordNet)“.

Pôvodný návrh:

- Riadok WordNetu: `id ⇥ druh ⇥ slovenské slová ⇥ glosa ␞ záznam Princeton WordNet`. Anglické slová sú v
  zázname Princeton za počtom slov (`01 abnormal 0`), anglická definícia za znakom `|`.
- Doplniť v `skripty/build_web.py` do výkladov kľúč `"wn": [["dog", "domestic dog"], "a member of the genus Canis…"]`
  len pre slová, ktoré nemajú `"en"` z Wiktionary. Zobraziť v sekcii „Po anglicky“.

## A4 – označenia synoným (hotové)

**Výsledok:** `skripty/synonyma.py` oddelí označenie od slova (`fáro (hovorovo)` → slovo + označenie); v
`export/synonyma.jsonl` je v skupine pole `oznacenia`, v `data/synonyma/` je položka `[slovo, označenie]`. Aplikácia
zobrazí označenie sivou kurzívou, „nesprávne“ slovo prečiarkne a v režime pre deti skryje „nesprávne“ aj
„vulgarizmus“. Označení: hovorovo 656, term. 359, nesprávne 217, poeticky 172, archaizmus 165, vulgarizmus 52.

Pôvodný návrh:

- `export/synonyma.jsonl` (predtým `synonyma.json`) už obsahuje pri každej skupine pole `zdroj`; OpenThesaurus má označenie priamo v texte
  („fáro (hovorovo)“). V `skripty/synonyma.py` ho vyňať do samostatného poľa a v `data/synonyma/` posielať
  ako `[slovo, označenie]`.
- V aplikácii: zobraziť označenie sivou farbou; „nesprávne“ skryť v režime pre deti.
