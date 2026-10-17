# Zostaví synonymá, antonymá a nadradené/podradené pojmy z piatich zdrojov:
#   Slovenský WordNet (SNK) – synonymá, antonymá, nadradené a podradené pojmy
#   OpenThesaurus-SK (th_sk_SK_v2.dat z LibreOffice) – skupiny synoným s označením (hovorovo, archaizmus…)
#   slovenský Wikislovník – sekcie „Synonymá“ a „Antonymá“
#   anglický Wiktionary cez kaikki.org – polia synonyms / antonyms
#   záporné dvojice ne-: pekný ↔ nepekný (len ak sú obe slová v zozname)
#
# Výstupy:
#   export/synonyma.jsonl – úplné dáta so zdrojmi, jeden záznam na riadok:
#                          {"slovo": "auto", "synonyma": [{"slova": [...], "zdroj": "...", "oznacenia": {"fáro": "hovorovo"}}],
#                           "antonyma": [{"slovo": "...", "zdroj": "..."}], "nadradene": [...], "podradene": [...]}
#   data/synonyma/<x>.json – pre aplikáciu, len slová z data/slova.tsv, rozdelené podľa prvého písmena:
#                          {slovo: {"s": [[…], […]], "a": [...], "h": nadradené, "d": podradené}}
#                          položka synoným je "slovo" alebo ["slovo", "označenie"] (hovorovo, nesprávne, archaizmus…)
#
# python -I skripty/synonyma.py --thesaurus zdroje/th_sk_SK_v2.dat --wikt zdroje/skwiktionary-latest-pages-articles.xml
#        --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --slova data/slova.tsv --out .
import argparse, collections, html, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument("--thesaurus", required=True)
ap.add_argument("--wikt", required=True)
ap.add_argument("--kaikki", required=True)
ap.add_argument("--slova", required=True)
ap.add_argument("--wordnet", help="Slovenský WordNet zo SNK (sk-wn-2013-01-23.txt.gz)")
ap.add_argument("--out", default=".")
a = ap.parse_args()

words = {}
for line in open(a.slova, encoding="utf-8"):
    if line.startswith("#"):
        continue  # hlavička „#format=2“
    p = line.rstrip("\n").split("\t")
    words[p[0]] = p[1] if len(p) > 1 else ""  # kód slovného druhu: n, a, v, d…
lower_to_word = {}
for w in words:
    lower_to_word.setdefault(w.lower(), w)

syn = collections.defaultdict(list)   # slovo -> [{"slova": [...], "zdroj": ...}]
ant = collections.defaultdict(list)   # slovo -> [{"slovo": ..., "zdroj": ...}]

def add_syn(w, group, src):
    group = [g for g in dict.fromkeys(group) if g and g.split(" (")[0] != w]
    if not group:
        return
    have = {g for grp in syn[w] for g in grp["slova"]}
    group = [g for g in group if g not in have]
    if group:
        syn[w].append({"slova": group, "zdroj": src})

def add_ant(w, x, src):
    if x and x != w and x not in {e["slovo"] for e in ant[w]}:
        ant[w].append({"slovo": x, "zdroj": src})

# --- Slovenský WordNet (SNK, JÚĽŠ SAV) – má prednosť: odborne zostavené synsety napojené na Princeton WordNet.
#   riadok: id <TAB> slovný druh <TAB> slová (;) <TAB> glosa ␞ záznam Princeton WordNet so vzťahmi:
#   @ / @i nadradený pojem, ~ / ~i podradený pojem, ! antonymum
hyper = collections.defaultdict(list)   # slovo -> nadradené pojmy
hypo = collections.defaultdict(list)    # slovo -> podradené pojmy
if a.wordnet:
    import gzip
    WN_POINTER = re.compile(r"(@i?|~i?|!) (\d{8}) ([nvasr])")
    synsets, links = collections.defaultdict(list), []
    with gzip.open(a.wordnet, "rt", encoding="utf-8") as f:
        for line in f:
            if "␞" not in line:
                continue
            sk_part, pwn = line.rstrip("\n").split("␞", 1)
            cols = sk_part.split("\t")
            if len(cols) < 3:
                continue
            ws = []
            for raw in cols[2].split(";"):
                t = re.sub(r"\(.*?\)", "", raw).strip(" +-?\t")  # „+“ hlavné slovo, „-“ nepresný, „?“ nejasný ekvivalent
                if t and not t.startswith(("-", "?")):
                    ws.append(t)
            pp = pwn.split()
            if len(pp) < 3 or not ws:
                continue
            pos = "a" if pp[2] == "s" else pp[2]
            key = (pp[0], pos)
            synsets[key].extend(w for w in ws if w not in synsets[key])
            links.append((ws, [(m.group(1), (m.group(2), "a" if m.group(3) == "s" else m.group(3)))
                               for m in WN_POINTER.finditer(pwn.split("|", 1)[0])]))
    for ws, ptrs in links:
        for w in ws:
            add_syn(lower_to_word.get(w, w), ws, "Slovenský WordNet")
        for sym, target in ptrs:
            tw = synsets.get(target)
            if not tw:
                continue
            for w in ws:
                w = lower_to_word.get(w, w)
                if sym.startswith("@"):
                    hyper[w] += [x for x in tw[:3] if x not in hyper[w] and x != w]
                elif sym.startswith("~"):
                    hypo[w] += [x for x in tw[:2] if x not in hypo[w] and x != w]
                elif sym == "!":
                    for x in tw[:3]:
                        add_ant(w, x, "Slovenský WordNet")

# --- OpenThesaurus-SK: „heslo|počet“ a pod ním riadky „-|syn1|syn2 (hovorovo)|…“
lines = open(a.thesaurus, encoding="utf-8").read().split("\n")
i = 1
while i < len(lines):
    line = lines[i]
    if "|" in line and not line.startswith(("-", "(")):
        head, n = line.rsplit("|", 1)
        w = lower_to_word.get(head, head)
        for j in range(int(n)):
            items = lines[i + 1 + j].split("|")[1:]
            group = []
            for it in items:
                if "(Antonym)" in it:
                    add_ant(w, it.replace("(Antonym)", "").strip(), "OpenThesaurus-SK")
                else:
                    group.append(it.strip())
            add_syn(w, group, "OpenThesaurus-SK")
        i += 1 + int(n)
    else:
        i += 1

# --- slovenský Wikislovník
LINK = re.compile(r"\[\[(?:[^\]|]*\|)?([^\]|#]+)\]\]")
x = open(a.wikt, encoding="utf-8").read()
for page in x.split("<page>")[1:]:
    m = re.search(r"<title>(.*?)</title>\s*<ns>0</ns>.*?<text[^>]*>(.*?)</text>", page, re.S)
    if not m:
        continue
    title, body = html.unescape(m.group(1)), html.unescape(m.group(2))
    sk = re.search(r"^==\s*Slovenčina\s*==\s*$(.*?)(?=^==[^=]|\Z)", body, re.S | re.M)
    if not sk:
        continue
    for kind, sec in re.findall(r"^===+\s*(Synonymá|Antonymá)\s*===+\s*$(.*?)(?=^=|\Z)", sk.group(1), re.S | re.M):
        for row in sec.strip().split("\n"):
            linked = [l.strip() for l in LINK.findall(row) if ":" not in l]
            if kind == "Synonymá":
                add_syn(title, linked, "Wikislovník")
            else:
                for l in linked:
                    add_ant(title, l, "Wikislovník")

# --- anglický Wiktionary (kaikki)
for line in open(a.kaikki, encoding="utf-8"):
    e = json.loads(line)
    w = e["word"]
    s_words, a_words = [], []
    for src in [e] + e.get("senses", []):
        s_words += [s.get("word") for s in src.get("synonyms", [])]
        a_words += [s.get("word") for s in src.get("antonyms", [])]
    add_syn(w, [s for s in s_words if s and not s.startswith("Thesaurus:")], "Wiktionary")
    for x_ in a_words:
        add_ant(w, x_, "Wiktionary")

# antonymá sú obojsmerné (veľký ↔ malý)
for w, lst in list(ant.items()):
    for e in list(lst):
        add_ant(e["slovo"], w, e["zdroj"])

# --- záporné dvojice ne-: pekný ↔ nepekný (len prídavné mená, príslovky a podstatné mená v zozname)
ne_pairs = 0
for w, pos in words.items():
    # prídavné mená (a), príslovky (d), podstatné mená (n)
    if pos in ("a", "d", "n") and w.startswith("ne") and w[2:] in words and words[w[2:]] == pos:
        add_ant(w, w[2:], "zápor ne-")
        add_ant(w[2:], w, "zápor ne-")
        ne_pairs += 1

# --- zápis
# --- štylistické označenia z OpenThesaurus: „fáro (hovorovo)“ → slovo „fáro“ + označenie „hovorovo“
OZNACENIA = {"hovorovo", "term.", "nesprávne", "poeticky", "archaizmus", "vulgarizmus", "výrobný"}
LABEL_RE = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")

def split_label(s):
    m = LABEL_RE.match(s)
    if m and m.group(2) in OZNACENIA:
        return m.group(1), m.group(2)
    return s, None

for w, groups in syn.items():
    for g in groups:
        bare, labels = [], {}
        for s in g["slova"]:
            b, lab = split_label(s)
            if b in bare:
                continue  # „kľudný“ aj „kľudný (nesprávne)“ v jednej skupine
            bare.append(b)
            if lab:
                labels[b] = lab
        g["slova"] = bare
        if labels:
            g["oznacenia"] = labels

full = {}
for w in sorted(set(syn) | set(ant) | set(hyper) | set(hypo), key=lambda s: (s.lower(), s)):
    d = {}
    if syn.get(w): d["synonyma"] = syn[w]
    if ant.get(w): d["antonyma"] = ant[w]
    if hyper.get(w): d["nadradene"] = hyper[w]
    if hypo.get(w): d["podradene"] = hypo[w][:30]
    if d: full[w] = d

import importlib.util  # spoločné funkcie (python -I → načítanie podľa cesty)
_spec = importlib.util.spec_from_file_location("spolocne", os.path.join(os.path.dirname(os.path.abspath(__file__)), "spolocne.py"))
spolocne = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spolocne)
# úplný export: export/synonyma.jsonl – jeden záznam {"slovo": …, "synonyma": …, …} na riadok
spolocne.zapis_jsonl(os.path.join(a.out, "export", "synonyma.jsonl"), ({"slovo": w, **d} for w, d in full.items()))

web = {}
for w, d in full.items():
    if w not in words:
        continue
    e = {}
    # synonymum je reťazec, alebo [slovo, označenie] ak má štylistické označenie (hovorovo, nesprávne…)
    if "synonyma" in d:
        e["s"] = [[[s, g["oznacenia"][s]] if s in g.get("oznacenia", {}) else s for s in g["slova"]]
                  for g in d["synonyma"]]
    if "antonyma" in d: e["a"] = [x["slovo"] for x in d["antonyma"]]
    if "nadradene" in d: e["h"] = d["nadradene"]
    if "podradene" in d: e["d"] = d["podradene"][:15]
    web[w] = e
spolocne.zapis_shardy(web, os.path.join(a.out, "data", "synonyma"))  # data/synonyma/<písmeno>.json
if os.path.exists(os.path.join(a.out, "data", "synonyma.json")):
    os.remove(os.path.join(a.out, "data", "synonyma.json"))

src_count = collections.Counter(g["zdroj"] for d in full.values() for g in d.get("synonyma", []))
ant_count = collections.Counter(x["zdroj"] for d in full.values() for x in d.get("antonyma", []))
print("slov so synonymami:", sum("synonyma" in d for d in full.values()), dict(src_count))
print("slov s antonymami:", sum("antonyma" in d for d in full.values()), dict(ant_count), "| dvojíc ne-:", ne_pairs)
print("nadradené pojmy:", len(hyper), "| podradené:", len(hypo))
print("v aplikácii:", len(web), "slov | so synonymami:", sum("s" in d for d in web.values()),
      "| s antonymami:", sum("a" in d for d in web.values()))
