# Jednorazová migrácia štruktúry repozitára (2026-10): exporty do export/ ako JSON Lines, licencie do licenses/.
#
#   slova.json             → export/slova.jsonl     (jedno slovo na riadok)
#   synonyma.json          → export/synonyma.jsonl  (jeden záznam {"slovo": …, "synonyma": …} na riadok)
#   slova.txt              → export/slova.txt
#   slova_s_vykladom.json  → zmazané (je to len výber zo slova.json: záznamy s poľom vyklad_*)
#   LICENSE-hunspell-sk.txt      → licenses/hunspell-sk.txt
#   LICENSE-openthesaurus-sk.txt → licenses/openthesaurus-sk.txt
#
# Skript je idempotentný – opakované spustenie nič nepokazí. Po migrácii zapisujú build_web.py a synonyma.py
# rovno do nových ciest, takže ďalšie zostavenie (skripty/zostav.py) už migráciu nepotrebuje.
#
# python -I skripty/migracia_export.py            # spustiť z koreňa repozitára
# python -I skripty/migracia_export.py --skusobne # len vypíše, čo by spravil
import argparse, importlib.util, json, os, shutil

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_spec = importlib.util.spec_from_file_location("spolocne", os.path.join(KOREN, "skripty", "spolocne.py"))
spolocne = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(spolocne)

def cesta(*p):
    return os.path.join(KOREN, *p)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--skusobne", action="store_true", help="nič nemeniť, len vypísať plán")
    a = ap.parse_args()
    kroky = []

    if os.path.exists(cesta("slova.json")):
        def slova():
            data = json.load(open(cesta("slova.json"), encoding="utf-8"))
            n = spolocne.zapis_jsonl(cesta("export", "slova.jsonl"), data)
            # kontrola pred zmazaním originálu: rovnaký počet a obsah záznamov
            back = [json.loads(l) for l in open(cesta("export", "slova.jsonl"), encoding="utf-8")]
            assert n == len(data) and back == data, "export/slova.jsonl sa nezhoduje so slova.json"
            os.remove(cesta("slova.json"))
            return f"{n} slov"
        kroky.append(("slova.json → export/slova.jsonl", slova))

    if os.path.exists(cesta("synonyma.json")):
        def synonyma():
            data = json.load(open(cesta("synonyma.json"), encoding="utf-8"))
            n = spolocne.zapis_jsonl(cesta("export", "synonyma.jsonl"), ({"slovo": k, **v} for k, v in data.items()))
            back = {}
            for l in open(cesta("export", "synonyma.jsonl"), encoding="utf-8"):
                z = json.loads(l)
                back[z.pop("slovo")] = z
            assert n == len(data) and back == data, "export/synonyma.jsonl sa nezhoduje so synonyma.json"
            os.remove(cesta("synonyma.json"))
            return f"{n} záznamov"
        kroky.append(("synonyma.json → export/synonyma.jsonl", synonyma))

    for src, dst in [("slova.txt", ("export", "slova.txt")),
                     ("LICENSE-hunspell-sk.txt", ("licenses", "hunspell-sk.txt")),
                     ("LICENSE-openthesaurus-sk.txt", ("licenses", "openthesaurus-sk.txt"))]:
        if os.path.exists(cesta(src)):
            def presun(src=src, dst=dst):
                os.makedirs(cesta(dst[0]), exist_ok=True)
                shutil.move(cesta(src), cesta(*dst))
                return "presunuté"
            kroky.append((f"{src} → {'/'.join(dst)}", presun))

    if os.path.exists(cesta("slova_s_vykladom.json")):
        kroky.append(("slova_s_vykladom.json → zmazať (výber zo slova.json)",
                      lambda: (os.remove(cesta("slova_s_vykladom.json")), "zmazané")[1]))

    if not kroky:
        print("Nič na migráciu – štruktúra je už nová.")
        return
    for popis, fn in kroky:
        print(("[skúšobne] " if a.skusobne else "") + popis, end="")
        print("" if a.skusobne else f" … {fn()}")

if __name__ == "__main__":
    main()
