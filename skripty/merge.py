import re, sys, html, json, collections
skxml, kaikki, base, outdir = sys.argv[1:5]

SK_POS = {"Podstatné meno": "noun", "Prídavné meno": "adjective", "Sloveso": "verb", "Príslovka": "adverb",
          "Číslovka": "number", "Zámeno": "pronoun", "Častica": "particle", "Spojka": "conjunction",
          "Predložka": "preposition", "Citoslovce": "interjection", "Skratka": "acronym", "Príčastie": "participle"}
FORM_RE = re.compile(r"^''[^']*(čísl|pád|tvar|osob|datív|genitív|akuzatív|lokál|inštrumentál|nominatív|vokatív|stupe|príčast|variant)[^']*''\s*\{\{Odkaz", re.I)

FORM2_RE = re.compile(r"^(\(.*?\) )?(nominatív|genitív|datív|akuzatív|vokatív|lokál|inštrumentál|\d\. osoba|tvar|neurčitok|minulý čas|prechodník|množné číslo|jednotné číslo|singulár|plurál|druhý stupeň|tretí stupeň|nesprávny variant|zastaraný variant|variant)", re.I)

def clean(s):
    s = re.sub(r"<ref[^>]*/>|<ref[^>]*>.*?</ref>", "", s, flags=re.S)
    s = re.sub(r"<[^>]+>", "", s)
    def tpl(m):
        parts = [p.strip() for p in m.group(1).split("|")]
        name, args = parts[0], parts[1:]
        if name == "Odkaz" and args: return args[-1]
        if name == "Príznaky" and len(args) > 1: return "(" + ", ".join(args[1:]) + ")"
        if name == "Príznak2" and args: return "(" + ", ".join(args) + ")"
        if name == "Význam" and args: return "|".join(args)
        return ""
    for _ in range(3):
        s = re.sub(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]", r"\1", s)
        s = re.sub(r"\{\{([^{}]*)\}\}", tpl, s)
    s = s.replace("'''", "").replace("''", "")
    return re.sub(r"\s+", " ", s).strip(" ;,")

# --- slovenský Wiktionary
sk = collections.defaultdict(lambda: {"pos": None, "defs": []})
x = open(skxml, encoding="utf-8").read()
for page in x.split("<page>")[1:]:
    pm = re.search(r"<title>(.*?)</title>\s*<ns>0</ns>.*?<text[^>]*>(.*?)</text>", page, re.S)
    if not pm: continue
    title, body = html.unescape(pm.group(1)), pm.group(2)
    body = html.unescape(body)
    m = re.search(r"^==\s*Slovenčina\s*==\s*$(.*?)(?=^==[^=]|\Z)", body, re.S | re.M)
    if not m: continue
    pos = None; head = None
    for line in m.group(1).splitlines():
        h = re.match(r"^===+\s*(.*?)\s*===+\s*$", line)
        if h:
            name = re.sub(r"\s*\(\d+\)$", "", h.group(1))
            if name in SK_POS: pos = SK_POS[name]
            head = name
            continue
        d = re.match(r"^#(?![*:#])\s*(.*)$", line)
        if d and head == "Význam":
            raw = d.group(1)
            if FORM_RE.search(raw): continue
            c = clean(raw)
            if FORM2_RE.search(c): continue
            if c and len(c) > 1 and c not in sk[title]["defs"]:
                sk[title]["defs"].append(c)
                sk[title]["pos"] = sk[title]["pos"] or pos
sk = {k: v for k, v in sk.items() if v["defs"]}

# --- anglický Wiktionary (kaikki)
en = collections.defaultdict(lambda: {"pos": None, "defs": []})
with open(kaikki, encoding="utf-8") as f:
    for line in f:
        e = json.loads(line)
        for s in e.get("senses", []):
            if "form_of" in s or "alt_of" in s or not s.get("glosses"): continue
            if any(t in s.get("tags", []) for t in ("form-of", "alt-of")): continue
            g = s["glosses"][-1].strip()
            if g and g not in en[e["word"]]["defs"]:
                en[e["word"]]["defs"].append(g)
                en[e["word"]]["pos"] = en[e["word"]]["pos"] or e.get("pos")
en = {k: v for k, v in en.items() if v["defs"]}

# --- spojenie so zoznamom slov
words = {}
for e in json.load(open(base, encoding="utf-8")):
    words.setdefault(e["slovo"], {"slovo": e["slovo"], "slovny_druh": e["slovny_druh"], "rod": e["rod"]})
added = 0
for src in (sk, en):
    for w, v in src.items():
        if w not in words:
            words[w] = {"slovo": w, "slovny_druh": v["pos"], "rod": None}; added += 1
        elif not words[w]["slovny_druh"]:
            words[w]["slovny_druh"] = v["pos"]
for w, e in words.items():
    if w in sk: e["vyklad_sk"] = sk[w]["defs"]
    if w in en: e["vyklad_en"] = en[w]["defs"]
entries = sorted(words.values(), key=lambda e: (e["slovo"].lower(), e["slovo"]))
with open(outdir + "/slova.json", "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=1)
withdef = [e for e in entries if "vyklad_sk" in e or "vyklad_en" in e]
with open(outdir + "/slova_s_vykladom.json", "w", encoding="utf-8") as f:
    json.dump(withdef, f, ensure_ascii=False, indent=1)
with open(outdir + "/slova.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(e["slovo"] for e in entries) + "\n")
print("spolu slov:", len(entries), "| nove z Wiktionary:", added)
print("s vykladom SK:", sum("vyklad_sk" in e for e in entries), "| EN:", sum("vyklad_en" in e for e in entries),
      "| aspon jeden:", len(withdef), "| oba:", sum("vyklad_sk" in e and "vyklad_en" in e for e in entries))
