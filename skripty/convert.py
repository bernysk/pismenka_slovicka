# Krok 1: zoznam slov zo slovníka Hunspell sk_SK.dic → <out>/slova.json a <out>/slova.txt
# Riadok .dic: „slovo/PRÍZNAKY po:noun is:masculine“ – berie sa slovo, slovný druh (po:) a rod (is:).
# Výsledok je vstupom pre merge.py (výklady) a slúži na overovanie slov v build_web.py.
#
# python -I skripty/convert.py zdroje/sk_SK.dic zdroje
import json, sys, collections
src, out = sys.argv[1], sys.argv[2]
words = {}
with open(src, encoding="utf-8") as f:
    next(f)  # count line
    for line in f:
        line = line.rstrip("\n")
        if not line.strip():
            continue
        head, _, morph = line.partition("\t") if "\t" in line.split(" ")[0] or "\t" in line else (line.split(" ")[0], "", " ".join(line.split(" ")[1:]))
        head = head.strip()
        word = head.split("/")[0]
        tags = dict(t.split(":", 1) for t in morph.split() if ":" in t)
        e = {"slovo": word, "slovny_druh": tags.get("po"), "rod": tags.get("is")}
        key = (word, e["slovny_druh"])
        words.setdefault(key, e)
entries = sorted(words.values(), key=lambda e: (e["slovo"].lower(), e["slovo"]))
with open(out + "/slova.json", "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=0)
uniq = sorted({e["slovo"] for e in entries}, key=lambda w: (w.lower(), w))
with open(out + "/slova.txt", "w", encoding="utf-8") as f:
    f.write("\n".join(uniq) + "\n")
print(len(entries), "zaznamov,", len(uniq), "unikatnych slov")
print(collections.Counter(e["slovny_druh"] for e in entries).most_common())
