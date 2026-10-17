# Export dát

Úplné dáta na ďalšie použitie (mimo webovej aplikácie). Generujú ich `skripty/build_web.py` a `skripty/synonyma.py`
(alebo všetko naraz `python -I skripty/zostav.py`). Licencia: **CC BY-NC-SA 4.0**, zdroje sú v [`../LICENSE`](../LICENSE).

Súbory `.jsonl` sú [JSON Lines](https://jsonlines.org/): **jeden JSON objekt na riadok**, kódovanie UTF-8.
Dajú sa čítať po riadkoch bez načítania celého súboru do pamäte a git pri zmene ukáže len zmenené riadky.

## `slova.jsonl` – ~161 000 slov v základnom tvare

```json
{"slovo":"pes","slovny_druh":"noun","rod":"m","zivotnost":"životné","frekvencia":10778,"frekvencia_wiki":4238,"frekvencia_snk":171252,"frekvencia_hovorena":447,"frekvencia_knihy":22664,"vyklad_sk":["šelma chovaná ako domáce zviera","…"],"vyklad_en":["dog"],"vyklad_wiki":"Pes domáci alebo pes …","wiki_clanok":"Pes domáci","slabiky":1}
```

| Pole | Význam |
|---|---|
| `slovo` | základný tvar (lema) |
| `slovny_druh` | `noun`, `adjective`, `verb`, `adverb`, `pronoun`, `number`, `preposition`, `conjunction`, `particle`, `interjection`, `acronym`, `name`, `phrase` |
| `rod`, `zivotnost`, `pomnozne` | len podstatné mená: `m`/`f`/`s` (aj viac, napr. `mf`), `životné`/`neživotné`, `true` |
| `frekvencia_snk` | výskyty v Slovenskom národnom korpuse (prim-11.0-public-all, všetky tvary) |
| `frekvencia_knihy`, `frekvencia_hovorena` | SNK: pôvodná slovenská beletria (img-sk), hovorená reč (s-hovor-6.0) |
| `frekvencia_wiki`, `frekvencia` | slovenská Wikipédia, filmové titulky (FrequencyWords) |
| `vyklad_sk`, `vyklad_en` | výklady z Wikislovníka a anglického Wiktionary (zoznam významov) |
| `vyklad_wiki`, `wiki_clanok` | prvá veta článku slovenskej Wikipédie a jeho názov |
| `nevhodne` | `true` = vulgarizmus alebo nadávka |
| `slabiky` | počet slabík (`skripty/slabiky.py`) |

Chýbajúce pole = hodnota nie je známa alebo je nulová. Slová s výkladom sú tie, ktoré majú niektoré z polí `vyklad_*`.

## `slova.txt`

Len zoznam slov, jedno na riadok (rovnaké poradie ako `slova.jsonl`).

## `synonyma.jsonl` – významové vzťahy ~38 000 slov

```json
{"slovo":"auto","synonyma":[{"slova":["fáro","kára","vagón","voz","vozidlo"],"zdroj":"OpenThesaurus-SK","oznacenia":{"fáro":"hovorovo","kára":"hovorovo"}}],"antonyma":[{"slovo":"…","zdroj":"…"}],"nadradene":["motorové vozidlo"],"podradene":["taxík","limuzína"]}
```

- `synonyma` – skupiny synoným (jedna skupina ≈ jeden význam), `zdroj`: Slovenský WordNet, OpenThesaurus-SK,
  Wikislovník alebo Wiktionary; `oznacenia`: štylistické označenia (hovorovo, term., nesprávne, poeticky, archaizmus, vulgarizmus)
- `antonyma` – opačné slová so zdrojom (aj automatické dvojice so záporom ne-: pekný ↔ nepekný)
- `nadradene`, `podradene` – nadradené a podradené pojmy zo Slovenského WordNetu (strom → drevina; lipa, dub)

Obsahuje aj slová, ktoré v aplikácii nie sú.

## Ukážka čítania (Python)

```python
import json
with open("export/slova.jsonl", encoding="utf-8") as f:
    for riadok in f:
        slovo = json.loads(riadok)
        if slovo.get("slabiky") == 2 and slovo["slovny_druh"] == "noun":
            print(slovo["slovo"])
```
