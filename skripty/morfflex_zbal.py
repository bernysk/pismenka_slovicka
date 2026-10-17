# Zbalí MorfFlex SK (UniMorph slk, ~1,5 GB, 28 mil. riadkov) do malého súboru pre GitHub.
#
# Ponechá len lemy, ktoré sú v data/slova.tsv (overené slová), a každú lemu zapíše na jeden riadok:
#   lema <TAB> (rezervované) <TAB> tvar1 <TAB> tvar2 …
# kde tvar = "ID_značky:tvar_ako_rozdiel" (značka obsahuje aj rod/vid, napr. N;GEN;PL|FEM); rozdiel "3ami" znamená: z lemy odober 3 posledné znaky a pridaj „ami“,
# "=" znamená rovnaký tvar ako lema. Zoznam značiek (ID → napr. N;GEN;PL) je v hlavičke súboru (riadky "#T").
#
# python -I skripty/morfflex_zbal.py zdroje/slk data/slova.tsv morfflex/morfflex-sk.tsv.xz
# Späť do pôvodného formátu: python -I skripty/morfflex_rozbal.py morfflex/morfflex-sk.tsv.xz > slk
import lzma, re, sys

src, words_tsv, out = sys.argv[1:4]
keep = {line.split("\t", 1)[0] for line in open(words_tsv, encoding="utf-8")}
LEMMA_MARK = re.compile(r"(`\d+|-\d+)+$")

def diff(lemma, form):
    if form == lemma:
        return "="
    i = 0
    while i < min(len(lemma), len(form)) and lemma[i] == form[i]:
        i += 1
    cut = len(lemma) - i
    return (str(cut) if cut else "") + form[i:]

tags, rows = {}, []
cur, cur_extra, forms = None, None, []

def flush():
    if cur is not None and LEMMA_MARK.sub("", cur) in keep:
        rows.append("\t".join([cur, cur_extra] + forms))

with open(src, encoding="utf-8") as f:
    for line in f:
        lemma, form, tag, extra = line.rstrip("\n").split("\t")
        key = tag + "|" + extra if extra else tag  # rod/vid patrí k tvaru (pri slovesách sa vid strieda)
        if lemma != cur:
            flush()
            cur, cur_extra, forms = lemma, "", []
        tid = tags.setdefault(key, len(tags))
        forms.append(f"{tid:x}:{diff(lemma, form)}")
    flush()

with lzma.open(out, "wt", encoding="utf-8", preset=9 | lzma.PRESET_EXTREME) as f:
    f.write("# MorfFlex SK 170914 (Hajič, Hric; UFAL MFF UK) – CC BY-NC-SA 4.0, cez UniMorph slk; len overené lemy\n")
    for key, tid in tags.items():
        f.write(f"#T\t{tid:x}\t{key}\n")
    for r in rows:
        f.write(r + "\n")
print(len(rows), "lem,", len(tags), "značiek")
