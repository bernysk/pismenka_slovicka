# Z slova.json vytvorí kompaktné dáta pre webovú aplikáciu:
#   data/slova.tsv    – slovo <TAB> slovný druh <TAB> 1 ak má výklad <TAB> počet výskytov
#   data/vyklady.json – {slovo: {"sk": [...], "en": [...]}}
# Voliteľný tretí argument: frekvenčný zoznam "slovo počet" (napr. sk_full.txt z FrequencyWords).
import json, sys, os
src, outdir = sys.argv[1], sys.argv[2]
freq = {}
if len(sys.argv) > 3:
    with open(sys.argv[3], encoding="utf-8") as f:
        for line in f:
            parts = line.split()
            if len(parts) == 2 and parts[1].isdigit():
                freq[parts[0].lower()] = freq.get(parts[0].lower(), 0) + int(parts[1])
os.makedirs(outdir, exist_ok=True)
entries = json.load(open(src, encoding="utf-8"))
defs = {}
with_freq = 0
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
        n = 0 if len(w) > 1 and w.isupper() else freq.get(w.lower(), 0)  # skratky (SA, OSN) nie
        with_freq += n > 0
        f.write(f"{w}\t{e.get('slovny_druh') or ''}\t{1 if d else ''}\t{n or ''}\n")
with open(os.path.join(outdir, "vyklady.json"), "w", encoding="utf-8") as f:
    json.dump(defs, f, ensure_ascii=False, separators=(",", ":"))
print(len(entries), "slov,", len(defs), "s výkladom,", with_freq, "s frekvenciou")
