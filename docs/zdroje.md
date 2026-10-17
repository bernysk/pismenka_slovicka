# Zdroje dát a ako z nich vznikajú súbory

Tento dokument popisuje **odkiaľ sú všetky dáta, ako sa volajú zdrojové súbory, ako ich získať a ktorý skript
z nich vytvára ktorý cieľový súbor**. Všetko v `data/`, `export/` a `morfflex/` sa dá kedykoľvek znovu vygenerovať.

## Ako všetko znovu vygenerovať

```bash
python -I skripty/zostav.py
```

Skript stiahne chýbajúce zdroje do `zdroje/` (~2,5 GB, priečinok sa necommituje) a spustí všetkých 7 krokov.
Celé to trvá ~30 minút. Ďalšie možnosti: `--bez-stahovania`, `--od <krok>`, `--len <krok>`.

### Reprodukovateľnosť

- Zdroje so **pevnou verziou** (MorfFlex SK, SNK, Slovenský WordNet, OpenThesaurus-SK, FrequencyWords) dajú vždy
  rovnaký výsledok.
- Zdroje **„latest“** (Wikipédia, Wikislovník, kaikki.org, Hunspell) sa priebežne aktualizujú – nové stiahnutie dá
  mierne odlišné výklady a frekvencie. Aktuálne dáta v repozitári sú vytvorené zo stiahnutí zo **17. 10. 2026**
  (verzie v tabuľke nižšie).
- Kontrolné súčty presne tých súborov, z ktorých sú vytvorené aktuálne dáta, sú v [`zdroje.sha256`](zdroje.sha256):

  ```bash
  sha256sum -c docs/zdroje.sha256
  ```

  Ak súčet nesedí, zdroj sa medzitým zmenil. Na presnú reprodukciu treba stiahnuť archívnu verziu
  (napr. Wikipédia: `https://dumps.wikimedia.org/skwiki/20261001/` namiesto `latest/`).

## Zdrojové súbory (`zdroje/`)

Všetky sťahuje `skripty/zostav.py` (zoznam `ZDROJE`). Stĺpec „Krok“ = krok v `zostav.py`, ktorý súbor používa.

| Súbor v `zdroje/` | Čo to je | Odkiaľ (URL) | Verzia / dátum | Veľkosť | Licencia | Krok |
|---|---|---|---|---|---|---|
| `slk` | **MorfFlex SK** – morfologický slovník: lema, tvar, značka UniMorph (28 mil. riadkov) | https://raw.githubusercontent.com/unimorph/slk/main/slk.xz → rozbalené `xz -d` | MorfFlex SK 170914 (UniMorph) | 1,6 GB (79 MB .xz) | CC BY-NC-SA 4.0 | web, morfflex |
| `snk/prim-11.0-public-all-{S,A,G,V,D,P,R,N,E,O,T,J,W}-lemma-frequency.bz2` | **Frekvencie lem SNK** po slovných druhoch (S podst. mená, A príd. mená, G príčastia, V slovesá, D príslovky, P zámená, R „sa/si“, N číslovky, E predložky, O spojky, T častice, J citoslovcia, W skratky) | `https://korpus.juls.savba.sk/files/prim-11.0/tag/prim-11.0-public-all-<X>-lemma-frequency.bz2` (prehľad: https://korpus.sk/frekvencne-zoznamy/) | prim-11.0-public-all (1,5 mld. slov) | 13 súborov, ~20 MB | SNK, JÚĽŠ SAV | web |
| `snk/prim-11.0-public-img-sk-lemma_frequency.txt.bz2` | frekvencie lem v pôvodnej slovenskej beletrii („v knihách“) | https://korpus.juls.savba.sk/files/prim-11.0/prim-11.0-public-img-sk-lemma_frequency.txt.bz2 | prim-11.0-public-img-sk | 3 MB | SNK | web |
| `snk/s-hovor-6.0-lemma_frequency.txt.bz2` | frekvencie lem v hovorenej reči | https://korpus.juls.savba.sk/files/s-hovor-6.0/s-hovor-6.0-lemma_frequency.txt.bz2 | s-hovor-6.0 | 0,4 MB | SNK | web |
| `snk/ma-2015-02-05.txt.xz` | **Morfologická databáza SNK** – 99 tis. lem s tvarmi a značkami SNK (`SSis1`) | https://korpus.sk/wp-content/uploads/uploaded/documents/databases/morfologicka_databaza/ma-2015-02-05.txt.xz (stránka: https://korpus.sk/korpusy-a-databazy/databazy/morfologicka-databaza/) | 2015-02-05 | 7 MB | CC BY-SA 4.0 / AGPL 3 / GFDL 1.3, „na vedecko-výskumné ciele“ | web |
| `snk/sk-wn-2013-01-23.txt.gz` | **Slovenský WordNet** – synsety napojené na Princeton WordNet | https://korpus.sk/wp-content/uploads/uploaded/documents/databases/wordnet/sk-wn-2013-01-23.txt.gz (stránka: https://korpus.sk/korpusy-a-databazy/databazy/wordnet/) | 2013-01-23 | 2,4 MB | CC BY-SA 3.0 / AGPL 3 / ODbL | synonyma |
| `sk_SK.dic` | **Hunspell sk_SK** – slovník kontroly pravopisu (slovo, slovný druh, rod) | https://raw.githubusercontent.com/sk-spell/hunspell-sk/master/sk_SK.dic | 2.4.9 (2026-09-25) | 3,4 MB | MPL 2.0 | hunspell |
| `skwiktionary-latest-pages-articles.xml` | **Wikislovník** – dump článkov (výklady, synonymá, antonymá) | https://dumps.wikimedia.org/skwiktionary/latest/skwiktionary-latest-pages-articles.xml.bz2 → rozbalené | dump 2026-10-01 | 53 MB | CC BY-SA 4.0 | vyklady, synonyma |
| `kaikki.org-dictionary-Slovak.jsonl` | **anglický Wiktionary** – slovenské heslá spracované projektom kaikki.org (výklady, vulgarizmy, synonymá) | https://kaikki.org/dictionary/Slovak/kaikki.org-dictionary-Slovak.jsonl | 2026-10-03 | 54 MB | CC BY-SA 4.0 | vyklady, web, synonyma |
| `skwiki-latest-pages-articles.xml.bz2` | **slovenská Wikipédia** – dump článkov (frekvencia, prvé vety) | https://dumps.wikimedia.org/skwiki/latest/skwiki-latest-pages-articles.xml.bz2 (nerozbaľuje sa) | dump 2026-10-01 | 358 MB | CC BY-SA 4.0 | wiki |
| `th_sk_SK_v2.dat` | **OpenThesaurus-SK** – synonymá s označeniami (hovorovo, nesprávne…) | https://raw.githubusercontent.com/LibreOffice/dictionaries/master/sk_SK/th_sk_SK_v2.dat | snapshot 2013-03-17 | 0,7 MB | voľná (typu MIT), `licenses/openthesaurus-sk.txt` | synonyma |
| `sk_full.txt` | **FrequencyWords** – frekvencia tvarov z filmových titulkov (OpenSubtitles) | https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sk/sk_full.txt | 2018 | 9 MB | CC BY-SA 4.0 | web, tvary |

Zoznam slov nevhodných pre deti nie je stiahnutý, ale udržiavaný ručne: `skripty/nevhodne.txt`.

## Medzivýsledky (`zdroje/`, generované)

| Súbor | Vytvára (krok) | Zo vstupov |
|---|---|---|
| `zdroje/slova.json` | `convert.py` (hunspell), potom doplní `merge.py` (vyklady) | `sk_SK.dic`; Wikislovník, kaikki |
| `zdroje/sk_wiki_freq.txt` | `wiki_freq.py` (wiki) | dump Wikipédie |
| `zdroje/sk_wiki_vety.json` | `wiki_freq.py` (wiki) – prvá veta každého článku + presmerovania | dump Wikipédie |

## Cieľové súbory (v repozitári)

| Súbor | Vytvára (skript, krok) | Hlavné vstupy | Čo obsahuje |
|---|---|---|---|
| `data/slova.tsv` | `build_web.py` (web) | MorfFlex, SNK (frekvencie, morf. databáza), `zdroje/slova.json`, frekvencie Wikipédie a titulkov, kaikki, `nevhodne.txt` | zoznam slov pre aplikáciu (formát v hlavičke `app.js`) |
| `data/vyklady/<x>.json` | `build_web.py` (web) | `zdroje/slova.json` (Wikislovník, kaikki), `zdroje/sk_wiki_vety.json` | výklady a prvé vety z Wikipédie, po písmenách |
| `export/slova.jsonl`, `export/slova.txt` | `build_web.py` (web) | ako `data/slova.tsv` | úplný export slov (polia v [`export/README.md`](../export/README.md)) |
| `data/synonyma/<x>.json` | `synonyma.py` (synonyma) | Slovenský WordNet, OpenThesaurus-SK, Wikislovník, kaikki, `data/slova.tsv` | synonymá, antonymá, nadradené/podradené pojmy pre aplikáciu |
| `export/synonyma.jsonl` | `synonyma.py` (synonyma) | ako vyššie | úplný export vzťahov so zdrojmi a označeniami |
| `morfflex/morfflex-sk.tsv.xz` | `morfflex_zbal.py` (morfflex) | MorfFlex (`zdroje/slk`), `data/slova.tsv` | všetky tvary overených slov; späť: `morfflex_rozbal.py` |
| `data/tvary/<x>.json`, `data/tvary/znacky.json` | `tvary_web.py` (tvary) | `morfflex/morfflex-sk.tsv.xz`, `data/slova.tsv`, frekvencie Wikipédie a titulkov | tabuľky tvarov bežných slov |

Poradie krokov: **hunspell → vyklady → wiki → web → synonyma → morfflex → tvary** (každý krok potrebuje výstupy
predchádzajúcich). Podrobný popis jednotlivých skriptov je v [`skripty/README.md`](../skripty/README.md).

## Čo sa z repozitára zmazalo a prečo to nevadí

- `slova_s_vykladom.json` (migrácia 2026-10) – výber zo `slova.json`; rovnaký výsledok dá filter záznamov
  `export/slova.jsonl`, ktoré majú niektoré z polí `vyklad_sk`, `vyklad_en`, `vyklad_wiki`.
- `slova.json`, `synonyma.json` – nezmazané, len prevedené do `export/*.jsonl` (obsah overený pri migrácii).
- Staré verzie sú dostupné v histórii gitu (história sa neprepisuje).
