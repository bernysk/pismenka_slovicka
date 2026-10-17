# Spoločné funkcie pre skripty, ktoré zapisujú dáta pre webovú aplikáciu.
# Načítava sa cez importlib (skripty bežia s python -I, takže priečinok skripty/ nie je v sys.path):
#   spolocne = nacitaj_spolocne()  – pozri build_web.py / synonyma.py
import json, os, unicodedata

# Krátke kódy slovných druhov v data/slova.tsv (app.js má rovnakú tabuľku POS)
POS_KOD = {"noun": "n", "adjective": "a", "verb": "v", "adverb": "d", "pronoun": "p", "number": "c",
           "preposition": "e", "conjunction": "o", "particle": "t", "interjection": "j", "acronym": "x",
           "name": "m", "phrase": "f"}

def kluc_shardu(slovo):
    """Kľúč súboru, v ktorom je slovo: prvé písmeno bez diakritiky malým (Ľubica → l, čas → c), inak „_“.
    app.js počíta ten istý kľúč funkciou shardKey()."""
    ch = unicodedata.normalize("NFD", slovo[:1].lower())[:1]
    return ch if "a" <= ch <= "z" else "_"

def zapis_jsonl(path, zaznamy):
    """Zapíše záznamy ako JSON Lines – jeden kompaktný JSON objekt na riadok (export/*.jsonl).
    Oproti jednému veľkému JSON: menší súbor, dá sa čítať po riadkoch a git ukazuje zmeny po záznamoch."""
    os.makedirs(os.path.dirname(path) or ".", exist_ok=True)
    n = 0
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        for z in zaznamy:
            f.write(json.dumps(z, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    return n

def zapis_shardy(data, priecinok):
    """Rozdelí {slovo: hodnota} do priecinok/<kľúč>.json, aby aplikácia načítala len malý súbor."""
    os.makedirs(priecinok, exist_ok=True)
    for f in os.listdir(priecinok):
        if f.endswith(".json"):
            os.remove(os.path.join(priecinok, f))
    shardy = {}
    for w, v in data.items():
        shardy.setdefault(kluc_shardu(w), {})[w] = v
    for k, d in shardy.items():
        with open(os.path.join(priecinok, k + ".json"), "w", encoding="utf-8") as f:
            json.dump(d, f, ensure_ascii=False, separators=(",", ":"))
    return len(shardy)
