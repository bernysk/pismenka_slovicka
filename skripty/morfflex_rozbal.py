# Rozbalí morfflex/morfflex-sk.tsv.xz späť do formátu UniMorph: lema <TAB> tvar <TAB> značky <TAB> rod/vid
# python -I skripty/morfflex_rozbal.py morfflex/morfflex-sk.tsv.xz > slk
import lzma, re, sys

tags = {}
out = sys.stdout
out.reconfigure(encoding="utf-8", newline="\n")
with lzma.open(sys.argv[1], "rt", encoding="utf-8") as f:
    for line in f:
        line = line.rstrip("\n")
        if line.startswith("#T\t"):
            _, tid, key = line.split("\t")
            tags[tid] = key
            continue
        if line.startswith("#"):
            continue
        lemma, extra, *forms = line.split("\t")
        for item in forms:
            tid, d = item.split(":", 1)
            tag, _, tag_extra = tags[tid].partition("|")
            if d == "=":
                form = lemma
            else:
                m = re.match(r"(\d*)(.*)", d)
                cut = int(m.group(1) or 0)
                form = (lemma[: len(lemma) - cut] if cut else lemma) + m.group(2)
            out.write(f"{lemma}\t{form}\t{tag}\t{tag_extra or extra}\n")
