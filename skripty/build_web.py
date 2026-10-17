# Z slova.json vytvorí kompaktné dáta pre webovú aplikáciu:
#   data/slova.tsv    – slovo <TAB> slovný druh <TAB> 1 ak má výklad <TAB> počet výskytov <TAB> príznaky
#                       príznaky: T = nie je základný tvar (vyskloňovaný/vyčasovaný tvar iného slova)
#                                 N = nevhodné pre deti (vulgárne, urážlivé)
#   data/vyklady.json – {slovo: {"sk": [...], "en": [...]}}
#
# python -I skripty/build_web.py slova.json data --freq sk_full.txt --dic sk_SK.dic --aff sk_SK.aff
#        --kaikki kaikki.org-dictionary-Slovak.jsonl --blocklist skripty/nevhodne.txt
import argparse, json, os, re

ap = argparse.ArgumentParser()
ap.add_argument("src")
ap.add_argument("outdir")
ap.add_argument("--freq", help="frekvenčný zoznam 'slovo počet' (FrequencyWords sk_full.txt)")
ap.add_argument("--dic", help="Hunspell sk_SK.dic – na rozpoznanie tvarov")
ap.add_argument("--aff", help="Hunspell sk_SK.aff – na rozpoznanie tvarov")
ap.add_argument("--kaikki", help="kaikki.org JSONL – tvary slov a značky vulgar/offensive")
ap.add_argument("--blocklist", help="regulárne výrazy nevhodných slov (skripty/nevhodne.txt)")
a = ap.parse_args()

# --- frekvencie
freq = {}
if a.freq:
    with open(a.freq, encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit():
                freq[parts[0].lower()] = freq.get(parts[0].lower(), 0) + int(parts[1])

# --- tvary: rozvinutie pravidiel Hunspell (jedna úroveň, bez kombinácií predpôn a prípon)
lemmas, forms, tagged_forms = set(), set(), set()
if a.dic and a.aff:
    rules = {}
    with open(a.aff, encoding="utf-8") as f:
        for line in f:
            p = line.split("#")[0].split()
            if len(p) >= 5 and p[0] in ("SFX", "PFX"):
                kind, flag, strip, add, cond = p[:5]
                strip = "" if strip == "0" else strip
                add = add.split("/")[0]
                add = "" if add == "0" else add
                rx = re.compile((cond + "$") if kind == "SFX" else ("^" + cond)) if cond != "." else None
                rules.setdefault(flag, []).append((kind, strip, add, rx))
    # riadky s „st:iné_slovo“ alebo s pádom/časom (je, som, bol, mňa, jej) sú tvary; slovo je tvarom,
    # ak sú tvarom všetky jeho riadky (si = zámeno aj tvar slovesa byť → ponechá sa)
    FORM_TAGS = {"is:genitive", "is:dative", "is:accusative", "is:locative", "is:instrumental",
                 "is:past", "is:future", "is:imperative", "is:plural"}
    line_kinds = {}
    with open(a.dic, encoding="utf-8") as f:
        next(f)
        for line in f:
            if not line.strip():
                continue
            parts = line.split()
            word, _, flags = parts[0].partition("/")
            tags = set(parts[1:])
            st = next((t[3:] for t in tags if t.startswith("st:")), None)
            is_form = (st is not None and st != word) or bool(tags & FORM_TAGS)
            line_kinds.setdefault(word, []).append(is_form)
            if not flags:
                continue
            lemmas.add(word)
            for fl in flags:
                for kind, strip, add, rx in rules.get(fl, ()):
                    if rx and not rx.search(word):
                        continue
                    if kind == "SFX":
                        if strip and not word.endswith(strip): continue
                        forms.add(word[: len(word) - len(strip)] + add)
                    else:
                        if strip and not word.startswith(strip): continue
                        forms.add(add + word[len(strip):])
    tagged_forms = {w for w, kinds in line_kinds.items() if all(kinds)}
    lemmas -= tagged_forms

# Nepravidelné tvary sú v .dic zapísané samostatne bez príznakov (achátmi, leptmi). Slovo bez príznakov
# považujeme za tvar, ak je to kmeň známeho slova (bez 0–3 posledných písmen) + koncovka z .aff.
endings, stems = set(), set()
if a.dic and a.aff:
    for rl in rules.values():
        for kind, strip, add, rx in rl:
            if kind == "SFX" and add: endings.add(add)
    for w in lemmas:
        for k in range(0, 4):
            if len(w) - k >= 3: stems.add(w[: len(w) - k])

def looks_like_form(w):
    if w in forms or any(w[:i] in stems and w[i:] in endings for i in range(3, len(w))):
        return True
    # záporné tvary: nezaštíti, nepancime…
    return w.startswith("ne") and w[2:] not in lemmas and len(w) > 5 and looks_like_form(w[2:])

# --- kaikki: ďalšie tvary a slová, ktorých všetky významy sú vulgárne/urážlivé
vulgar = set()
BAD_TAGS = {"vulgar", "offensive", "slur", "obscene"}
if a.kaikki:
    with open(a.kaikki, encoding="utf-8") as f:
        for line in f:
            e = json.loads(line)
            w = e["word"]
            senses = [s for s in e.get("senses", []) if s.get("glosses") and "form_of" not in s]
            if senses and all(BAD_TAGS & set(s.get("tags", [])) for s in senses):
                vulgar.add(w)
            if senses:
                lemmas.add(w)
            for fm in e.get("forms", []):
                t = fm.get("form", "")
                if fm.get("source") in ("declension", "conjugation", "inflection") and " " not in t and t != w \
                        and not set(fm.get("tags", [])) & {"table-tags", "inflection-template", "class"}:
                    forms.add(t)

block, allow = [], []
if a.blocklist:
    for line in open(a.blocklist, encoding="utf-8"):
        line = line.strip()
        if line and not line.startswith("#"):
            (allow if line.startswith("!") else block).append(re.compile(line.lstrip("!")))

def is_vulgar(w):
    lw = w.lower()
    if any(r.fullmatch(lw) for r in allow): return False
    return w in vulgar or any(r.fullmatch(lw) for r in block)

os.makedirs(a.outdir, exist_ok=True)
entries = json.load(open(a.src, encoding="utf-8"))
defs = {}
stats = {"freq": 0, "T": 0, "N": 0}
with open(os.path.join(a.outdir, "slova.tsv"), "w", encoding="utf-8", newline="\n") as f:
    for e in entries:
        w = e["slovo"]
        if not w or "\t" in w or "\n" in w or w.startswith("-") or w.endswith("-") \
                or not any(ch.isalpha() for ch in w) or e.get("slovny_druh") in ("character", "symbol", "punct"):
            continue
        d = {}
        if e.get("vyklad_sk"): d["sk"] = e["vyklad_sk"]
        if e.get("vyklad_en"): d["en"] = e["vyklad_en"]
        if d: defs[w] = d
        n = 0 if len(w) > 1 and w.isupper() else freq.get(w.lower(), 0)  # skratky (SA, OSN) nie
        flags = ""
        if w in tagged_forms or (not e.get("slovny_druh") and w not in lemmas and looks_like_form(w.lower())):
            flags += "T"
        if is_vulgar(w): flags += "N"
        stats["freq"] += n > 0
        for k in flags: stats[k] += 1
        f.write(f"{w}\t{e.get('slovny_druh') or ''}\t{1 if d else ''}\t{n or ''}\t{flags}\n")
with open(os.path.join(a.outdir, "vyklady.json"), "w", encoding="utf-8") as f:
    json.dump(defs, f, ensure_ascii=False, separators=(",", ":"))
print(len(entries), "slov,", len(defs), "s výkladom,", stats["freq"], "s frekvenciou,",
      stats["T"], "tvarov (nie základný tvar),", stats["N"], "nevhodných")
