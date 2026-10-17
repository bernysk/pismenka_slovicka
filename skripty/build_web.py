# Zostaví zoznam základných tvarov (lem) s vlastnosťami z morfologického slovníka MorfFlex SK
# a doplní výklady, frekvencie a príznak nevhodnosti.
#
# Výstupy:
#   data/slova.tsv    – slovo <TAB> slovný druh <TAB> 1 ak má výklad <TAB> frekvencia (titulky) <TAB> príznaky
#                       <TAB> frekvencia (Wikipédia) <TAB> frekvencia (Slovenský národný korpus)
#                       príznaky: m/f/s = rod (mužský/ženský/stredný), A/I = životné/neživotné,
#                                 P = pomnožné, D/E = dokonavé/nedokonavé, N = nevhodné pre deti
#   data/vyklady.json – {slovo: {"sk": [...], "en": [...]}}
#   slova.json, slova_s_vykladom.json, slova.txt – úplný export
#
# python -I skripty/build_web.py --morfflex zdroje/slk --slovnik zdroje/slova.json --freq zdroje/sk_full.txt
#        --freq-wiki zdroje/sk_wiki_freq.txt --kaikki zdroje/kaikki.org-dictionary-Slovak.jsonl --blocklist skripty/nevhodne.txt --out .
import argparse, json, os, re, collections

ap = argparse.ArgumentParser()
ap.add_argument("--morfflex", required=True, help="UniMorph slk (MorfFlex SK): lema, tvar, značky, rod/vid")
ap.add_argument("--slovnik", required=True, help="slova.json z merge.py (Hunspell + výklady z Wiktionary)")
ap.add_argument("--freq", help="frekvenčný zoznam tvarov 'slovo počet' (FrequencyWords sk_full.txt, titulky)")
ap.add_argument("--freq-wiki", help="frekvenčný zoznam tvarov zo slovenskej Wikipédie (wiki_freq.py)")
ap.add_argument("--kaikki", help="kaikki.org JSONL – značky vulgar/offensive")
ap.add_argument("--blocklist", help="skripty/nevhodne.txt")
ap.add_argument("--wiki-vety", help="prvé vety článkov Wikipédie (wiki_freq.py, tretí argument)")
ap.add_argument("--snk", help="priečinok s dátami Slovenského národného korpusu: prim-11.0-public-all-*-lemma-frequency.bz2 "
                              "a ma-2015-02-05.txt.xz (morfologická databáza)")
ap.add_argument("--out", default=".")
a = ap.parse_args()

# Slovné druhy, ktoré MorfFlex nemá – doplnia sa z Hunspell/Wiktionary
CLOSED = {"pronoun", "number", "preposition", "conjunction", "particle", "interjection"}
POS_MF = {"N": "noun", "V": "verb", "V.PTCP": "verb", "ADJ": "adjective", "ADV": "adverb"}
PRIORITY = ["noun", "verb", "adjective", "adverb"]

POS_NORM = {"adj": "adjective", "adv": "adverb", "intj": "interjection", "pron": "pronoun", "prep": "preposition",
            "conj": "conjunction", "num": "number", "abbrev": "acronym", "proverb": "phrase"}
SKIP_POS = {"suffix", "prefix", "character", "combining_form", "interfix", "symbol", "punct"}

# --- slovník z merge.py: výklady, slovné druhy, overenie existencie slova
known, defs, hun_pos = set(), {}, {}
for e in json.load(open(a.slovnik, encoding="utf-8")):
    w = e["slovo"]
    known.add(w)
    d = {}
    if e.get("vyklad_sk"): d["sk"] = e["vyklad_sk"]
    if e.get("vyklad_en"): d["en"] = e["vyklad_en"]
    if d: defs[w] = d
    pos = POS_NORM.get(e.get("slovny_druh"), e.get("slovny_druh"))
    if pos and pos not in SKIP_POS and not w.startswith("-") and not w.endswith("-"):
        hun_pos.setdefault(w, (pos, e.get("rod")))

def load_freq(path):
    out = {}
    if path:
        with open(path, encoding="utf-8") as f:
            for line in f:
                p = line.split()
                if len(p) == 2 and p[1].isdigit():
                    out[p[0].lower()] = out.get(p[0].lower(), 0) + int(p[1])
    return out

freq = load_freq(a.freq)        # titulky (hovorová reč)
wfreq = load_freq(a.freq_wiki)  # Wikipédia (spisovná, encyklopedická)

# --- Slovenský národný korpus (SNK, JÚĽŠ SAV)
#   frekvencia základných tvarov z korpusu prim-11.0-public-all, zvlášť pre každý slovný druh
#   morfologická databáza: lema, tvar, značka (SSis1 = podstatné meno, neživotný mužský rod, jedn. číslo, nominatív)
SNK_POS = {"S": "noun", "A": "adjective", "G": "adjective", "V": "verb", "D": "adverb", "P": "pronoun", "R": "pronoun",
           "N": "number", "E": "preposition", "O": "conjunction", "T": "particle", "J": "interjection", "W": "acronym"}
snk_freq = collections.Counter()      # (lema, náš slovný druh) -> počet
snk_any = collections.Counter()       # lema -> počet (všetky slovné druhy)
snk_morph = {}                        # lema -> [Counter slovných druhov, rody, životnosť, SG?, PL?]
if a.snk:
    import bz2, glob, lzma
    for path in glob.glob(os.path.join(a.snk, "prim-*-lemma-frequency.bz2")):
        letter = re.search(r"-([A-Z0-9])-lemma-frequency", path).group(1)
        if letter not in SNK_POS:
            continue
        with bz2.open(path, "rt", encoding="utf-8") as f:
            for line in f:
                p = line.split(None, 1)
                if len(p) == 2 and p[0].isdigit():
                    lemma, n = p[1].strip(), int(p[0])
                    snk_freq[(lemma, SNK_POS[letter])] += n
                    snk_any[lemma] += n
    morph_files = glob.glob(os.path.join(a.snk, "ma-*.txt.xz"))
    if morph_files:
        with lzma.open(morph_files[0], "rt", encoding="utf-8") as f:
            for line in f:
                p = line.rstrip("\n").split("\t")
                if len(p) < 3 or not p[2] or p[2][0] not in SNK_POS:
                    continue
                lemma, form, tag = p[0], p[1], p[2]
                d = snk_morph.get(lemma)
                if d is None:
                    d = snk_morph[lemma] = [collections.Counter(), set(), set(), False, False]
                d[0][SNK_POS[tag[0]]] += 1
                if tag[0] == "S" and len(tag) >= 5:  # SSis1: rod (m/i/f/n), číslo (s/p), pád
                    g = tag[2]
                    if g in "mi": d[1].add("m"); d[2].add("A" if g == "m" else "I")
                    elif g == "f": d[1].add("f")
                    elif g == "n": d[1].add("s")
                    d[3] |= tag[3] == "s"
                    d[4] |= tag[3] == "p"
    known |= set(snk_morph)
    known |= {l for l, n in snk_any.items() if n >= 10}
    print("SNK: frekvencie pre", len(snk_any), "lem, morfologická databáza", len(snk_morph), "lem")

def snk_count(w, pos):
    """Počet výskytov lemy v SNK pre daný slovný druh (vlastné mená a spojenia ako podstatné meno)."""
    p = {"name": "noun", "phrase": "noun"}.get(pos, pos)
    return snk_freq.get((w, p)) or snk_any.get(w, 0)

closed_words = {w.lower() for w, (pos, _) in hun_pos.items() if pos in CLOSED}
LEMMA_MARK = re.compile(r"(`\d+|-\d+)+$")  # aj kombinácie: tisíc`1000-2

# --- MorfFlex: jeden prechod cez ~28 mil. riadkov
lem = {}                                   # lema -> [pos Counter, rody NOM SG, rody NOM PL, vid, SG?, PL?]
form_lemmas = collections.defaultdict(set)  # tvar (len tie, čo sú vo frekvenčnom zozname) -> lemy
hun_lower = {w.lower() for w in hun_pos}
morf_forms = set()
with open(a.morfflex, encoding="utf-8") as f:
    for line in f:
        lemma, form, tag, extra = line.rstrip("\n").split("\t")
        lemma = LEMMA_MARK.sub("", lemma)  # sto`100 → sto, obor-1 → obor
        t = tag.split(";")
        d = lem.get(lemma)
        if d is None:
            d = lem[lemma] = [collections.Counter(), set(), set(), set(), False, False]
        d[0][POS_MF[t[0]]] += 1
        if t[0] == "N":
            if "NOM" in t:
                d[1 if "SG" in t else 2].add(extra)
            d[4] |= "SG" in t
            d[5] |= "PL" in t
        elif t[0] == "V" and "NFIN" in t and extra:
            d[3].add(extra)
        lf = form.lower()
        if lf != lemma.lower() and lf in hun_lower:
            morf_forms.add(lf)  # slovo z Hunspellu, ktoré je v MorfFlex tvarom iného slova (absurdít, predispozíciu)
        if (lf in freq or lf in wfreq) and (lf not in closed_words or lf == lemma.lower()):  # aby, mi, ho patria spojke/zámenu, nie slovám aba, mať…
            form_lemmas[lf].add(lemma)

# Frekvencia lemy = súčet výskytov jej tvarov. Tvar patriaci viacerým lemám (je: byť, jesť) sa rozdelí
# v pomere frekvencií, ktoré lemy majú z jednoznačných tvarov (byť dostane takmer všetko).
def lemma_freqs(src):
    base = collections.Counter()
    for form, ls in form_lemmas.items():
        if len(ls) == 1 and form in src:
            base[next(iter(ls))] += src[form]
    res = collections.Counter(base)
    for form, ls in form_lemmas.items():
        if len(ls) > 1 and form in src:
            # lema zhodná s tvarom dostane bonus 10 % výskytov tvaru: potom → príslovka „potom“, nie „pot“;
            # bola → stále takmer celé sloveso byť (má obrovskú frekvenciu z iných tvarov), nie „bola“ (zbraň)
            weight = {l: base[l] + (0.1 * src[form] if l.lower() == form else 0) for l in ls}
            total = sum(weight.values())
            for l in ls:
                res[l] += src[form] * (weight[l] / total if total else 1 / len(ls))
    return res

lemma_freq = lemma_freqs(freq)
wiki_lemma_freq = lemma_freqs(wfreq)

# --- nevhodné slová
vulgar = set()
BAD_TAGS = {"vulgar", "offensive", "slur", "obscene"}
if a.kaikki:
    for line in open(a.kaikki, encoding="utf-8"):
        e = json.loads(line)
        senses = [s for s in e.get("senses", []) if s.get("glosses") and "form_of" not in s]
        if senses and all(BAD_TAGS & set(s.get("tags", [])) for s in senses):
            vulgar.add(e["word"])
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

GENDER = {"MASC": "m", "FEM": "f", "NEUT": "s"}
entries = []
dropped = 0
for w, (pc, g_sg, g_pl, aspect, has_sg, has_pl) in lem.items():
    f = round(lemma_freq.get(w, 0)) + round(wiki_lemma_freq.get(w, 0))
    # MorfFlex obsahuje aj veľa umelo odvodených slov – ponecháme len tie, ktoré pozná aj iný zdroj
    if w not in known and f == 0:
        dropped += 1
        continue
    pos = max(pc, key=lambda p: (pc[p], -PRIORITY.index(p)))
    if hun_pos.get(w, ("",))[0] in CLOSED:
        pos = hun_pos[w][0]  # sto, tisíc → číslovka (MorfFlex ich má ako podstatné meno)
    e = {"slovo": w, "slovny_druh": pos}
    if pos == "noun":
        g = g_sg or g_pl
        rody = sorted({GENDER[x.split(";")[0]] for x in g if x.split(";")[0] in GENDER})
        if rody: e["rod"] = "".join(rody)
        anim = {x.split(";")[1] for x in g if ";" in x}
        if anim == {"ANIM"}: e["zivotnost"] = "životné"
        elif anim == {"INAN"}: e["zivotnost"] = "neživotné"
        if has_pl and not has_sg: e["pomnozne"] = True
    if pos == "verb" and len(aspect) == 1:
        e["vid"] = "dokonavé" if aspect == {"PFV"} else "nedokonavé"
    entries.append(e)

# --- slová mimo MorfFlex (z Hunspell / Wiktionary):
#   zámená, číslovky, spojky… vždy; podstatné/prídavné mená, slovesá a príslovky (trambulína, baseball),
#   ak nie sú v MorfFlex tvarom iného slova; vlastné mená, skratky a spojenia len s výkladom vo Wiktionary
OPEN = {"noun", "adjective", "verb", "adverb"}
HUN_GENDER = {"masculine": "m", "feminine": "f", "neuter": "s"}
have = {e["slovo"] for e in entries}
added_open = 0
for w, (pos, rod) in hun_pos.items():
    if w in have:
        continue
    lw = w.lower()
    is_form = lw in morf_forms or lw in form_lemmas  # (je, som – tvary slova byť)
    if pos in CLOSED:
        pass
    elif pos in OPEN and not is_form:
        added_open += 1
    elif w in defs and not is_form:
        pass
    else:
        continue
    e = {"slovo": w, "slovny_druh": pos}
    if pos == "noun" and rod in HUN_GENDER:
        e["rod"] = HUN_GENDER[rod]
    entries.append(e)
    have.add(w)

# --- slová z morfologickej databázy SNK, ktoré ešte nemáme (lemy vybrané zo slovníkov SNK)
added_snk = 0
for w, (pc, rody, anim, has_sg, has_pl) in snk_morph.items():
    if w in have or w.lower() in morf_forms or "\t" in w:
        continue
    pos = max(pc, key=pc.get)
    if pos == "acronym":
        continue
    entries.append({"slovo": w, "slovny_druh": pos})
    have.add(w)
    added_snk += 1

# --- rod, životnosť a pomnožnosť z SNK tam, kde ich MorfFlex/Hunspell nedali
for e in entries:
    m = snk_morph.get(e["slovo"])
    if e["slovny_druh"] != "noun" or not m or not m[1]:
        continue
    if "rod" not in e:
        e["rod"] = "".join(sorted(m[1]))
    if "zivotnost" not in e and e["rod"] == "m" and len(m[2]) == 1:
        e["zivotnost"] = "životné" if m[2] == {"A"} else "neživotné"
    if "pomnozne" not in e and m[4] and not m[3]:
        e["pomnozne"] = True

# --- prvá veta článku Wikipédie s rovnakým názvom (Voda, Strom, Bratislava), aj cez presmerovanie
wiki_vety, wiki_redir = {}, {}
if a.wiki_vety:
    wd = json.load(open(a.wiki_vety, encoding="utf-8"))
    wiki_vety, wiki_redir = wd["vety"], wd["presmerovania"]
WIKI_POS = {"noun", "name", "acronym", "phrase", "number"}

def tidy(s):
    s = re.sub(r"\(\s*[,;:\s]+", "(", s)          # „(,,,, ; do 1919…“ → „(do 1919…“
    s = re.sub(r"[\s,;:]+\)", ")", s)
    s = re.sub(r"\(\s*\)", "", s)
    return re.sub(r"\s+", " ", s).replace(" ,", ",").strip()

# „Pes“ a „Mačka“ sú rozlišovacie stránky – článok je „Pes domáci“, „Mačka domáca“
WIKI_SUFFIX = ["", " domáci", " domáca", " domáce", " obyčajný", " obyčajná", " obyčajné",
               " (zviera)", " (rastlina)", " (predmet)"]

def wiki_for(w):
    cap = w[:1].upper() + w[1:]
    for title in [cap + s for s in WIKI_SUFFIX] + [w]:
        for _ in range(3):
            if title in wiki_vety:
                return title, tidy(wiki_vety[title])
            if title not in wiki_redir:
                break
            title = wiki_redir[title]
            title = title[:1].upper() + title[1:]  # auto → „automobil“ → Automobil
    return None, None

for e in entries:
    w = e["slovo"]
    if e["slovny_druh"] in WIKI_POS:
        title, veta = wiki_for(w)
        if veta:
            e["vyklad_wiki"] = veta
            e["wiki_clanok"] = title
    abbr = len(w) > 1 and w.isupper()  # skratky (SA, OSN) nie
    n = 0 if abbr else round(lemma_freq.get(w, 0)) or freq.get(w.lower(), 0)
    nw = 0 if abbr else round(wiki_lemma_freq.get(w, 0)) or wfreq.get(w.lower(), 0)
    if n: e["frekvencia"] = n
    if nw: e["frekvencia_wiki"] = nw
    ns = 0 if abbr else snk_count(w, e["slovny_druh"])
    if ns: e["frekvencia_snk"] = ns
    if is_vulgar(w): e["nevhodne"] = True
    if w in defs:
        if "sk" in defs[w]: e["vyklad_sk"] = defs[w]["sk"]
        if "en" in defs[w]: e["vyklad_en"] = defs[w]["en"]
entries.sort(key=lambda e: (e["slovo"].lower(), e["slovo"]))

# --- zápis
os.makedirs(os.path.join(a.out, "data"), exist_ok=True)
FLAG_ZIV = {"životné": "A", "neživotné": "I"}
FLAG_VID = {"dokonavé": "D", "nedokonavé": "E"}
web_defs = {}
with open(os.path.join(a.out, "data", "slova.tsv"), "w", encoding="utf-8", newline="\n") as f:
    for e in entries:
        w = e["slovo"]
        if "\t" in w or "\n" in w or not any(ch.isalpha() for ch in w):
            continue
        flags = e.get("rod", "") + FLAG_ZIV.get(e.get("zivotnost"), "") + ("P" if e.get("pomnozne") else "") \
            + FLAG_VID.get(e.get("vid"), "") + ("N" if e.get("nevhodne") else "")
        d = dict(defs.get(w, {}))
        if "vyklad_wiki" in e:
            d["wiki"] = [e["vyklad_wiki"], e["wiki_clanok"]]
        has_def = bool(d)
        if has_def: web_defs[w] = d
        f.write(f"{w}\t{e['slovny_druh']}\t{1 if has_def else ''}\t{e.get('frekvencia', '')}\t{flags}\t{e.get('frekvencia_wiki', '')}\t{e.get('frekvencia_snk', '')}\n")
with open(os.path.join(a.out, "data", "vyklady.json"), "w", encoding="utf-8") as f:
    json.dump(web_defs, f, ensure_ascii=False, separators=(",", ":"))
with open(os.path.join(a.out, "slova.json"), "w", encoding="utf-8") as f:
    json.dump(entries, f, ensure_ascii=False, indent=1)
with open(os.path.join(a.out, "slova_s_vykladom.json"), "w", encoding="utf-8") as f:
    json.dump([e for e in entries if "vyklad_sk" in e or "vyklad_en" in e or "vyklad_wiki" in e], f, ensure_ascii=False, indent=1)
with open(os.path.join(a.out, "slova.txt"), "w", encoding="utf-8", newline="\n") as f:
    f.write("\n".join(e["slovo"] for e in entries) + "\n")

c = collections.Counter(e["slovny_druh"] for e in entries)
print(f"lem v MorfFlex: {len(lem)}, vyradených neoverených: {dropped}, doplnených z Hunspellu: {added_open}, zo SNK: {added_snk}, "
      f"spolu slov: {len(entries)}")
print("slovné druhy:", c.most_common())
print("s výkladom:", len(web_defs), "| s frekvenciou:", sum("frekvencia" in e for e in entries),
      "| nevhodné:", sum("nevhodne" in e for e in entries))
print("vid:", collections.Counter(e.get("vid") for e in entries if e["slovny_druh"] == "verb"))
print("životnosť:", collections.Counter(e.get("zivotnost") for e in entries if e.get("rod") == "m"))
