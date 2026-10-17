# Skripty na zostavenie slovníka

Zdroje (stiahnuť do samostatného priečinka, napr. `zdroje/`):

- Hunspell sk_SK (MPL 2.0): https://raw.githubusercontent.com/sk-spell/hunspell-sk/master/sk_SK.dic
- sk.wiktionary dump (CC BY-SA): https://dumps.wikimedia.org/skwiktionary/latest/skwiktionary-latest-pages-articles.xml.bz2 (rozbaliť `bunzip2`)
- kaikki.org – slovenčina z en.wiktionary (CC BY-SA): https://kaikki.org/dictionary/Slovak/kaikki.org-dictionary-Slovak.jsonl

Postup (spúšťať z priečinka `slovicka`):

```bash
python -I skripty/convert.py zdroje/sk_SK.dic .
python -I skripty/merge.py zdroje/skwiktionary-latest-pages-articles.xml zdroje/kaikki.org-dictionary-Slovak.jsonl slova.json .
```

1. `convert.py` vytvorí `slova.json` a `slova.txt` zo slovníka Hunspell (slovo, slovný druh, rod).
2. `merge.py` doplní `vyklad_sk` (sk.wiktionary) a `vyklad_en` (kaikki), pridá slová z Wiktionary, ktoré v Hunspelli chýbajú,
   a vytvorí aj `slova_s_vykladom.json` (iba slová s aspoň jedným výkladom).

`merge.py` prepisuje `slova.json`, preto pred ním vždy spusti `convert.py`.

3. `build_web.py` z `slova.json` vytvorí dáta pre webovú aplikáciu: `data/slova.tsv` a `data/vyklady.json`.

```bash
python -I skripty/build_web.py slova.json data
```
