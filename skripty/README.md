# Skripty na zostavenie slovníka

Zdroje (stiahnuť do priečinka `zdroje/`, ktorý sa necommituje):

- **MorfFlex SK** cez UniMorph (CC BY-NC-SA 4.0): https://raw.githubusercontent.com/unimorph/slk/main/slk.xz (79 MB, rozbaliť `xz -d` → `slk`, 1,5 GB)
  – alebo použiť zbalenú verziu z repozitára: `python -I skripty/morfflex_rozbal.py morfflex/morfflex-sk.tsv.xz > zdroje/slk`
- Hunspell sk_SK (MPL 2.0): https://raw.githubusercontent.com/sk-spell/hunspell-sk/master/sk_SK.dic
- sk.wiktionary dump (CC BY-SA): https://dumps.wikimedia.org/skwiktionary/latest/skwiktionary-latest-pages-articles.xml.bz2 (rozbaliť `bunzip2`)
- kaikki.org – slovenčina z en.wiktionary (CC BY-SA): https://kaikki.org/dictionary/Slovak/kaikki.org-dictionary-Slovak.jsonl
- Frekvencie (CC BY-SA): https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sk/sk_full.txt
- Slovenská Wikipédia (CC BY-SA): https://dumps.wikimedia.org/skwiki/latest/skwiki-latest-pages-articles.xml.bz2 (360 MB, nerozbaľovať)

Postup (spúšťať z priečinka `slovicka`):

```bash
python -I skripty/convert.py zdroje/sk_SK.dic zdroje
python -I skripty/merge.py zdroje/skwiktionary-latest-pages-articles.xml zdroje/kaikki.org-dictionary-Slovak.jsonl zdroje/slova.json zdroje
python -I skripty/wiki_freq.py zdroje/skwiki-latest-pages-articles.xml.bz2 zdroje/sk_wiki_freq.txt zdroje/sk_wiki_vety.json
python -I skripty/build_web.py --morfflex zdroje/slk --slovnik zdroje/slova.json --freq zdroje/sk_full.txt --freq-wiki zdroje/sk_wiki_freq.txt --wiki-vety zdroje/sk_wiki_vety.json --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --blocklist skripty/nevhodne.txt --out .
python -I skripty/morfflex_zbal.py zdroje/slk data/slova.tsv morfflex/morfflex-sk.tsv.xz
```

1. `convert.py` – zoznam slov zo slovníka Hunspell (slovo, slovný druh, rod) → `zdroje/slova.json`.
2. `merge.py` – doplní výklady `vyklad_sk` (sk.wiktionary) a `vyklad_en` (kaikki) → prepíše `zdroje/slova.json`
   (preto pred ním vždy spusti `convert.py`).
3. `wiki_freq.py` – z dumpu Wikipédie spočíta frekvenciu tvarov a vytiahne prvú vetu každého článku
   (bez rozlišovacích stránok) + presmerovania. Trvá ~8 minút.
4. `build_web.py` – základné tvary a vlastnosti (slovný druh, rod, životnosť, pomnožné) z MorfFlex SK.
   Ponechá len lemy, ktoré pozná aj Hunspell/Wiktionary alebo sa vyskytujú vo frekvenčnom zozname (MorfFlex
   obsahuje veľa umelo odvodených slov). Zámená, spojky, predložky, častice a číslovky doplní z Hunspell.
   Frekvencia lemy = súčet výskytov všetkých jej tvarov (zvlášť titulky a Wikipédia); tvar patriaci viacerým lemám sa rozdelí
   v pomere ich frekvencií. Podstatným a vlastným menám priradí prvú vetu článku Wikipédie s rovnakým názvom. Zapíše `data/`, `slova.json`, `slova_s_vykladom.json`, `slova.txt`.
5. `morfflex_zbal.py` – zbalí tvary overených lem do `morfflex/morfflex-sk.tsv.xz`; `morfflex_rozbal.py` ich rozbalí späť.

`nevhodne.txt` – regulárne výrazy slov nevhodných pre deti; riadky s `!` sú výnimky.
