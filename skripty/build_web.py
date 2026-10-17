# Z slova.json vytvorí kompaktné dáta pre webovú aplikáciu:
#   data/slova.tsv    – slovo <TAB> slovný druh <TAB> 1 ak má výklad
#   data/vyklady.json – {slovo: {"sk": [...], "en": [...]}}
import json, sys, os
src, outdir = sys.argv[1], sys.argv[2]
os.makedirs(outdir, exist_ok=True)
entries = json.load(open(src, encoding="utf-8"))
defs = {}
with open(os.path.join(outdir, "slova.tsv"), "w", encoding="utf-8", newline="\n") as f:
    for e in entries:
        w = e["slovo"]
        if not w or "\t" in w or "\n" in w or w.startswith("-") or w.endswith("-") \
                or not any(ch.isalpha() for ch in w) or e.get("slovny_druh") in ("character", "symbol", "punct"):
            continue
        d = {}
        if e.get("vyklad_sk"): d["sk"] = e["vyklad_sk"]
        if e.get("vyklad_en"): d["en"] = e["vyklad_en"]
        if d: defs[w] = d
        f.write(f"{w}\t{e.get('slovny_druh') or ''}\t{1 if d else ''}\n")
with open(os.path.join(outdir, "vyklady.json"), "w", encoding="utf-8") as f:
    json.dump(defs, f, ensure_ascii=False, separators=(",", ":"))
print(len(entries), "slov,", len(defs), "s výkladom")
