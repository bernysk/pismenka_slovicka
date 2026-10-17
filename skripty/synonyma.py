# Zostaví synonymá a antonymá zo štyroch zdrojov:
#   OpenThesaurus-SK (th_sk_SK_v2.dat z LibreOffice) – skupiny synoným s označením (hovorovo, archaizmus…)
#   slovenský Wikislovník – sekcie „Synonymá“ a „Antonymá“
#   anglický Wiktionary cez kaikki.org – polia synonyms / antonyms
#   záporné dvojice ne-: pekný ↔ nepekný (len ak sú obe slová v zozname)
#
# Výstupy:
#   synonyma.json        – úplné dáta so zdrojmi: {slovo: {"synonyma": [{"slova": [...], "zdroj": "..."}],
#                                                   "antonyma": [{"slovo": "...", "zdroj": "..."}]}}
#   data/synonyma.json   – pre aplikáciu, len slová z data/slova.tsv: {slovo: {"s": [[…], […]], "a": [...]}}
#
# python -I skripty/synonyma.py --thesaurus zdroje/th_sk_SK_v2.dat --wikt zdroje/skwiktionary-latest-pages-articles.xml
#        --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --slova data/slova.tsv --out .
import argparse, collections, html, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument("--thesaurus", required=True)
ap.add_argument("--wikt", required=True)
ap.add_argument("--kaikki", required=True)
ap.add_argument("--slova", required=True)
ap.add_argument("--out", default=".")
a = ap.parse_args()

words = {}
for line in open(a.slova, encoding="utf-8"):
    p = line.rstrip("\n").split("\t")
    words[p[0]] = p[1]
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
    if pos in ("adjective", "adverb", "noun") and w.startswith("ne") and w[2:] in words and words[w[2:]] == pos:
        add_ant(w, w[2:], "zápor ne-")
        add_ant(w[2:], w, "zápor ne-")
        ne_pairs += 1

# --- zápis
full = {}
for w in sorted(set(syn) | set(ant), key=lambda s: (s.lower(), s)):
    d = {}
    if syn.get(w): d["synonyma"] = syn[w]
    if ant.get(w): d["antonyma"] = ant[w]
    if d: full[w] = d
with open(os.path.join(a.out, "synonyma.json"), "w", encoding="utf-8") as f:
    json.dump(full, f, ensure_ascii=False, indent=1)

web = {}
for w, d in full.items():
    if w not in words:
        continue
    e = {}
    if "synonyma" in d: e["s"] = [g["slova"] for g in d["synonyma"]]
    if "antonyma" in d: e["a"] = [x["slovo"] for x in d["antonyma"]]
    web[w] = e
with open(os.path.join(a.out, "data", "synonyma.json"), "w", encoding="utf-8") as f:
    json.dump(web, f, ensure_ascii=False, separators=(",", ":"))

src_count = collections.Counter(g["zdroj"] for d in full.values() for g in d.get("synonyma", []))
ant_count = collections.Counter(x["zdroj"] for d in full.values() for x in d.get("antonyma", []))
print("slov so synonymami:", sum("synonyma" in d for d in full.values()), dict(src_count))
print("slov s antonymami:", sum("antonyma" in d for d in full.values()), dict(ant_count), "| dvojíc ne-:", ne_pairs)
print("v aplikácii:", len(web), "slov | so synonymami:", sum("s" in d for d in web.values()),
      "| s antonymami:", sum("a" in d for d in web.values()))
