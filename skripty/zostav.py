# Zostaví všetky dáta aplikácie jedným príkazom: stiahne chýbajúce zdroje do zdroje/ a spustí kroky v poradí.
#
#   python -I skripty/zostav.py                  # všetko (prvé spustenie stiahne ~2,5 GB a trvá desiatky minút)
#   python -I skripty/zostav.py --bez-stahovania # len kroky, zdroje musia byť stiahnuté
#   python -I skripty/zostav.py --od web         # začni od kroku „web“ (predchádzajúce sa preskočia)
#   python -I skripty/zostav.py --len synonyma   # len jeden krok
#
# Kroky: hunspell → vyklady → wiki → web → synonyma → morfflex → tvary (pozri KROKY nižšie a skripty/README.md).
# Spúšťa sa z koreňa repozitára (priečinok s index.html).
import argparse, bz2, lzma, os, shutil, subprocess, sys, time, urllib.request

KOREN = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Z = os.path.join(KOREN, "zdroje")
SNK = os.path.join(Z, "snk")
PY = [sys.executable, "-I"]

def s(*p):
    return os.path.join(KOREN, "skripty", *p)

# --- zdroje: (cieľový súbor, URL, rozbaliť?)
SNK_FREQ = "https://korpus.juls.savba.sk/files/prim-11.0/tag/prim-11.0-public-all-{}-lemma-frequency.bz2"
ZDROJE = [
    (os.path.join(Z, "sk_SK.dic"), "https://raw.githubusercontent.com/sk-spell/hunspell-sk/master/sk_SK.dic", None),
    (os.path.join(Z, "skwiktionary-latest-pages-articles.xml"),
     "https://dumps.wikimedia.org/skwiktionary/latest/skwiktionary-latest-pages-articles.xml.bz2", "bz2"),
    (os.path.join(Z, "kaikki.org-dictionary-Slovak.jsonl"),
     "https://kaikki.org/dictionary/Slovak/kaikki.org-dictionary-Slovak.jsonl", None),
    (os.path.join(Z, "sk_full.txt"),
     "https://raw.githubusercontent.com/hermitdave/FrequencyWords/master/content/2018/sk/sk_full.txt", None),
    (os.path.join(Z, "skwiki-latest-pages-articles.xml.bz2"),
     "https://dumps.wikimedia.org/skwiki/latest/skwiki-latest-pages-articles.xml.bz2", None),
    (os.path.join(Z, "slk"), "https://raw.githubusercontent.com/unimorph/slk/main/slk.xz", "xz"),
    (os.path.join(Z, "th_sk_SK_v2.dat"),
     "https://raw.githubusercontent.com/LibreOffice/dictionaries/master/sk_SK/th_sk_SK_v2.dat", None),
    (os.path.join(SNK, "ma-2015-02-05.txt.xz"),
     "https://korpus.sk/wp-content/uploads/uploaded/documents/databases/morfologicka_databaza/ma-2015-02-05.txt.xz", None),
    (os.path.join(SNK, "sk-wn-2013-01-23.txt.gz"),
     "https://korpus.sk/wp-content/uploads/uploaded/documents/databases/wordnet/sk-wn-2013-01-23.txt.gz", None),
    (os.path.join(SNK, "prim-11.0-public-img-sk-lemma_frequency.txt.bz2"),
     "https://korpus.juls.savba.sk/files/prim-11.0/prim-11.0-public-img-sk-lemma_frequency.txt.bz2", None),
    (os.path.join(SNK, "s-hovor-6.0-lemma_frequency.txt.bz2"),
     "https://korpus.juls.savba.sk/files/s-hovor-6.0/s-hovor-6.0-lemma_frequency.txt.bz2", None),
] + [(os.path.join(SNK, f"prim-11.0-public-all-{p}-lemma-frequency.bz2"), SNK_FREQ.format(p), None)
     for p in "SAGVDPRNEOTJW"]

TIMEOUT = 60  # s – bez neho by sa sťahovanie pri zaseknutom spojení nikdy neukončilo

def stiahni(ciel, url, rozbal):
    """Stiahne url do ciel (a prípadne rozbalí). Do cieľa sa zapíše až úplný súbor, takže prerušené
    stiahnutie alebo rozbalenie po sebe nenechá polovičný súbor, ktorý by ďalšie spustenie považovalo za hotový."""
    if os.path.exists(ciel):
        return
    if not url.startswith("https://"):
        raise ValueError(f"povolené je len https: {url}")
    os.makedirs(os.path.dirname(ciel), exist_ok=True)
    tmp, unpacked = ciel + ".part", ciel + ".rozbaluje"
    print(f"  sťahujem {url}", flush=True)
    req = urllib.request.Request(url, headers={"User-Agent": "pismenka-slovicka/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as r, open(tmp, "wb") as f:
            expected = r.headers.get("Content-Length")
            shutil.copyfileobj(r, f, 1 << 20)
        if expected and os.path.getsize(tmp) != int(expected):
            raise IOError(f"neúplné stiahnutie {url}: {os.path.getsize(tmp)} z {expected} B")
        if rozbal:
            opener = {"bz2": bz2.open, "xz": lzma.open}[rozbal]
            with opener(tmp, "rb") as src, open(unpacked, "wb") as dst:
                shutil.copyfileobj(src, dst, 1 << 20)
            os.replace(unpacked, ciel)
            os.remove(tmp)
        else:
            os.replace(tmp, ciel)
    finally:
        for leftover in (tmp, unpacked):
            if os.path.exists(leftover):
                os.remove(leftover)

# --- kroky: (názov, popis, príkaz)
KROKY = [
    ("hunspell", "zoznam slov zo slovníka Hunspell → zdroje/slova.json",
     [s("convert.py"), os.path.join(Z, "sk_SK.dic"), Z]),
    ("vyklady", "výklady z Wikislovníka a Wiktionary → zdroje/slova.json",
     [s("merge.py"), os.path.join(Z, "skwiktionary-latest-pages-articles.xml"),
      os.path.join(Z, "kaikki.org-dictionary-Slovak.jsonl"), os.path.join(Z, "slova.json"), Z]),
    ("wiki", "frekvencia a prvé vety z Wikipédie (~8 min)",
     [s("wiki_freq.py"), os.path.join(Z, "skwiki-latest-pages-articles.xml.bz2"),
      os.path.join(Z, "sk_wiki_freq.txt"), os.path.join(Z, "sk_wiki_vety.json")]),
    ("web", "slová, gramatika, frekvencie a výklady → data/, slova.json (~3 min)",
     [s("build_web.py"), "--morfflex", os.path.join(Z, "slk"), "--slovnik", os.path.join(Z, "slova.json"),
      "--freq", os.path.join(Z, "sk_full.txt"), "--freq-wiki", os.path.join(Z, "sk_wiki_freq.txt"),
      "--wiki-vety", os.path.join(Z, "sk_wiki_vety.json"), "--snk", SNK,
      "--kaikki", os.path.join(Z, "kaikki.org-dictionary-Slovak.jsonl"),
      "--blocklist", s("nevhodne.txt"), "--out", KOREN]),
    ("synonyma", "synonymá, antonymá, nadradené a podradené pojmy → data/synonyma/, synonyma.json",
     [s("synonyma.py"), "--wordnet", os.path.join(SNK, "sk-wn-2013-01-23.txt.gz"),
      "--thesaurus", os.path.join(Z, "th_sk_SK_v2.dat"),
      "--wikt", os.path.join(Z, "skwiktionary-latest-pages-articles.xml"),
      "--kaikki", os.path.join(Z, "kaikki.org-dictionary-Slovak.jsonl"),
      "--slova", os.path.join(KOREN, "data", "slova.tsv"), "--out", KOREN]),
    ("morfflex", "zbalené tvary slov → morfflex/morfflex-sk.tsv.xz (~8 min)",
     [s("morfflex_zbal.py"), os.path.join(Z, "slk"), os.path.join(KOREN, "data", "slova.tsv"),
      os.path.join(KOREN, "morfflex", "morfflex-sk.tsv.xz")]),
    ("tvary", "tabuľky tvarov bežných slov → data/tvary/",
     [s("tvary_web.py"), os.path.join(KOREN, "morfflex", "morfflex-sk.tsv.xz"), os.path.join(KOREN, "data", "slova.tsv"),
      os.path.join(KOREN, "data", "tvary"), "--freq", os.path.join(Z, "sk_full.txt"),
      "--freq", os.path.join(Z, "sk_wiki_freq.txt")]),
]

def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--bez-stahovania", action="store_true", help="nesťahovať chýbajúce zdroje")
    ap.add_argument("--od", choices=[k[0] for k in KROKY], help="začať od tohto kroku")
    ap.add_argument("--len", choices=[k[0] for k in KROKY], help="spustiť len tento krok")
    a = ap.parse_args()

    if not a.bez_stahovania:
        print("Zdroje:")
        for ciel, url, rozbal in ZDROJE:
            stiahni(ciel, url, rozbal)
        print("  všetky zdroje sú v zdroje/")

    names = [k[0] for k in KROKY]
    start = names.index(a.od) if a.od else 0
    for name, popis, cmd in KROKY[start:]:
        if a.len and name != a.len:
            continue
        print(f"\n== {name}: {popis}", flush=True)
        t = time.time()
        subprocess.run(PY + cmd, check=True, cwd=KOREN)
        print(f"   hotovo za {time.time() - t:.0f} s")
    print("\nHotovo. Aplikáciu si pozri cez: python -m http.server 8765")

if __name__ == "__main__":
    main()
