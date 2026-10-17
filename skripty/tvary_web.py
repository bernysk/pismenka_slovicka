# Tabuľka tvarov pre detail slova: vyberie z morfflex/morfflex-sk.tsv.xz tvary bežných slov (SNK ≥ 1 000)
# a zapíše ich po písmenách do data/tvary/ (načítavajú sa až pri otvorení slova, ako výklady).
#
#   data/tvary/znacky.json  ["N;NOM;SG", "N;GEN;SG", …]          – zoznam značiek, index = ID
#   data/tvary/<x>.json     {"pes": [[0, "="], [1, "2sa"], …], …}  – [ID značky, tvar ako rozdiel oproti slovu]
#
# Rozdiel ako v morfflex_zbal.py: "=" = rovnaký tvar, "2sa" = odober 2 posledné znaky a pridaj „sa“ (pes → psa).
# Viac tvarov s rovnakou značkou = varianty (psi, psy), prvý je hlavný.
#
# Výber značiek (zvyšok – zápor, príčastia, podmieňovací spôsob, 2. a 3. stupeň v pádoch – aplikácia nezobrazuje):
#   podstatné mená: 6 pádov × 2 čísla (vokatív sa v slovenčine ako pád neuvádza)
#   prídavné mená:  1. stupeň – 6 pádov × 2 čísla × 4 rody (m. živ., m. neživ., ž., s.); 2. a 3. stupeň len N j. č. m. r.
#   slovesá:        neurčitok, prítomný čas, jednoslovný budúci čas (budem), minulý čas (l-ové príčastie
#                   robil/robila/robilo/robili), rozkazovací spôsob
# Homonymné lemy MorfFlexu (obor-1, obor-2, tisíc`1000-2) sa zlúčia pod jedno slovo.
#
# Varianty v bunke: najprv tvary hlavného rodu (pes: psi pred psy), potom podľa frekvencie (--freq).
#
# python -I skripty/tvary_web.py morfflex/morfflex-sk.tsv.xz data/slova.tsv data/tvary
#        [--min-snk 1000] [--freq zdroje/sk_full.txt --freq zdroje/sk_wiki_freq.txt]
import argparse, importlib.util, json, lzma, os, re

ap = argparse.ArgumentParser()
ap.add_argument("morfflex", help="morfflex/morfflex-sk.tsv.xz (morfflex_zbal.py)")
ap.add_argument("slova", help="data/slova.tsv (formát 2)")
ap.add_argument("out", help="výstupný priečinok, napr. data/tvary")
ap.add_argument("--min-snk", type=int, default=1000, help="najmenšia frekvencia v SNK (predvolené 1000)")
ap.add_argument("--freq", action="append", default=[],
                help="frekvenčný zoznam tvarov „tvar počet“ (zdroje/sk_full.txt, zdroje/sk_wiki_freq.txt) – "
                     "poradie variantov (dievčatá pred dievčence); dá sa zadať viackrát")
a = ap.parse_args()

_spec = importlib.util.spec_from_file_location("spolocne", os.path.join(os.path.dirname(os.path.abspath(__file__)), "spolocne.py"))
spolocne = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spolocne)

PADY = ["NOM", "GEN", "DAT", "ACC", "ESS", "INS"]
CISLA = ["SG", "PL"]
RODY = ["MASC;ANIM", "MASC;INAN", "FEM", "NEUT"]
OSOBY = [f"{p};{n}" for n in CISLA for p in "123"]
ZNACKY = (
    [f"N;{c};{n}" for n in CISLA for c in PADY]
    + [f"ADJ;{r};{c};{n}" for n in CISLA for r in RODY for c in PADY]
    + ["ADJ;MASC;ANIM;NOM;SG;CMPR", "ADJ;MASC;ANIM;NOM;SG;SPRL"]
    + ["V;NFIN"] + [f"V;PRS;IND;{o}" for o in OSOBY] + [f"V;FUT;IND;{o}" for o in OSOBY]
    + ["V;PST;IND;3;SG;MASC", "V;PST;IND;3;SG;FEM", "V;PST;IND;3;SG;NEUT", "V;PST;IND;3;PL"]
    + ["V;IMP;2;SG", "V;IMP;1;PL", "V;IMP;2;PL"]
)
ZID = {z: i for i, z in enumerate(ZNACKY)}
LEMMA_MARK = re.compile(r"(`\d+|-\d+)+$")

def znacka(tag, extra, form):
    """Značka MorfFlexu → (naša značka, rod podstatného mena) alebo (None, None), ak sa nezobrazuje."""
    if ";NEG" in tag:
        return None, None
    if tag.startswith("N;"):
        t = tag if tag in ZID else None
        return t, extra
    if tag.startswith("V;PST;IND;3;PL;"):  # robili – rod v množnom čísle je pri l-ovom príčastí rovnaký
        return "V;PST;IND;3;PL", None
    if tag.startswith("V;FUT;") and " " in form:  # budem robiť – zložený tvar, tabuľka ho netreba
        return None, None
    return (tag if tag in ZID else None), None

def diff(w, form):
    if form == w:
        return "="
    i = 0
    while i < min(len(w), len(form)) and w[i] == form[i]:
        i += 1
    cut = len(w) - i
    return (str(cut) if cut else "") + form[i:]

# bežné slová zo zoznamu aplikácie
bezne = set()
with open(a.slova, encoding="utf-8") as f:
    for line in f:
        if line.startswith("#"):
            continue
        c = line.rstrip("\n").split("\t")
        if len(c) > 4 and c[4] and int(c[4]) >= a.min_snk:
            bezne.add(c[0])

# frekvencia tvarov – len na zoradenie variantov v jednej bunke
freq = {}
for path in a.freq:
    with open(path, encoding="utf-8") as f:
        for line in f:
            t, _, c = line.rstrip("\n").rpartition(" ")
            if c.isdigit():
                freq[t] = freq.get(t, 0) + int(c)

tags = {}
data = {}  # slovo → {naša značka: {tvar: (poradie rodu, poradie výskytu)}}
rody = {}  # slovo → {rod: počet tvarov} – hlavný rod podstatného mena má najviac tvarov (pes: životný pred neživotným)
with lzma.open(a.morfflex, "rt", encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if line.startswith("#T\t"):
            _, tid, key = line.split("\t")
            tags[tid] = key.partition("|")[::2]
            continue
        if line.startswith("#"):
            continue
        lemma, extra, *forms = line.split("\t")
        w = LEMMA_MARK.sub("", lemma)
        if w not in bezne:
            continue
        cells = data.setdefault(w, {})
        for item in forms:
            tid, d = item.split(":", 1)
            tag, tag_extra = tags[tid]
            if d == "=":
                form = lemma
            else:
                m = re.match(r"(\d*)(.*)", d)
                cut = int(m.group(1) or 0)
                form = (lemma[: len(lemma) - cut] if cut else lemma) + m.group(2)
            z, rod = znacka(tag, tag_extra or extra, form)
            if z is None:
                continue
            if rod:
                rody.setdefault(w, {})
                rody[w][rod] = rody[w].get(rod, 0) + 1
            cell = cells.setdefault(z, {})
            if form not in cell:
                cell[form] = (rod, len(cell))

out, tvarov = {}, 0
for w, cells in data.items():
    poradie_rodov = sorted(rody.get(w, {}), key=lambda r: -rody[w][r])
    rank = {r: i for i, r in enumerate(poradie_rodov)}
    rows = []
    for z in ZNACKY:
        if z not in cells:
            continue
        for form, _ in sorted(cells[z].items(), key=lambda kv: (rank.get(kv[1][0], 0), -freq.get(kv[0], 0), kv[1][1])):
            d = diff(w, form)
            if re.sub(r"^\d+", "", d)[:1].isdigit():
                continue  # prípona začínajúca číslicou by sa nedala jednoznačne zapísať
            rows.append([ZID[z], d])
    if rows:
        out[w] = rows
        tvarov += len(rows)

os.makedirs(a.out, exist_ok=True)
n = spolocne.zapis_shardy(out, a.out)
with open(os.path.join(a.out, "znacky.json"), "w", encoding="utf-8") as f:
    json.dump(ZNACKY, f, ensure_ascii=False, separators=(",", ":"))
print(f"{len(out)} slov, {tvarov} tvarov, {n} súborov → {a.out}")
