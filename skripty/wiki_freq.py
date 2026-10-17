# Spočíta frekvenciu slov (tvarov) zo slovenskej Wikipédie a voliteľne vytiahne prvú vetu každého článku.
# Vstup: dump https://dumps.wikimedia.org/skwiki/latest/skwiki-latest-pages-articles.xml.bz2
# Výstupy: "slovo počet" zoradené od najčastejšieho (rovnaký formát ako FrequencyWords);
#          voliteľne JSON {názov článku: prvá veta} + presmerovania {názov: cieľ}.
#
# python -I skripty/wiki_freq.py zdroje/skwiki-latest-pages-articles.xml.bz2 zdroje/sk_wiki_freq.txt [zdroje/sk_wiki_vety.json]
import bz2, collections, html, json, re, sys

src, out = sys.argv[1:3]
out_vety = sys.argv[3] if len(sys.argv) > 3 else None

NS0 = re.compile(r"<ns>0</ns>")
TEXT = re.compile(r"<text[^>]*>(.*?)</text>", re.S)
REDIRECT = re.compile(r"^#(redirect|presmeruj)", re.I)
REF = re.compile(r"<ref[^>/]*/>|<ref[^>]*>.*?</ref>", re.S)
COMMENT = re.compile(r"<!--.*?-->", re.S)
TAG_BLOCK = re.compile(r"<(math|code|pre|syntaxhighlight|score|gallery|timeline|chem)[^>]*>.*?</\1>", re.S | re.I)
TAG = re.compile(r"<[^>]+>")
TEMPLATE = re.compile(r"\{\{[^{}]*\}\}")
TABLE = re.compile(r"\{\|.*?\|\}", re.S)
FILE_LINK = re.compile(r"\[\[(Súbor|Obrázok|File|Image|Kategória|Category)[^\[\]]*(\[\[[^\]]*\]\][^\[\]]*)*\]\]", re.I)
LINK = re.compile(r"\[\[(?:[^\]|]*\|)?([^\]]*)\]\]")
EXT_LINK = re.compile(r"\[https?://[^\s\]]*\s?([^\]]*)\]")
URL = re.compile(r"https?://\S+")
ATTR = re.compile(r"\b[\w-]+\s*=\s*(\"[^\"]*\"|'[^']*'|[^\s|]*)")  # align=right, style="…"
WORD = re.compile(r"[^\W\d_]+(?:-[^\W\d_]+)*")

def clean(t):
    t = html.unescape(t)
    t = COMMENT.sub(" ", t)
    t = REF.sub(" ", t)
    t = TAG_BLOCK.sub(" ", t)
    for _ in range(5):  # vnorené šablóny
        t2 = TEMPLATE.sub(" ", t)
        if t2 == t: break
        t = t2
    t = TABLE.sub(" ", t)
    t = FILE_LINK.sub(" ", t)
    t = LINK.sub(r"\1", t)
    t = EXT_LINK.sub(r"\1", t)
    t = URL.sub(" ", t)
    t = TAG.sub(" ", t)
    t = ATTR.sub(" ", t)
    # vyhodíme riadky tabuliek (| !) a nadpisy sekcií (== Referencie ==, == Iné projekty ==)
    t = "\n".join(l for l in t.split("\n") if not l.lstrip().startswith(("|", "!", "{", "}", "=")))
    return t.replace("'''", "").replace("''", "")

TITLE = re.compile(r"<title>(.*?)</title>")
REDIRECT_TARGET = re.compile(r"\[\[([^\]|#]+)")
DISAMBIG = re.compile(r"\{\{\s*(rozlišovacia stránka|rozlišovacia|disambig)", re.I)
EMPTY_PARENS = re.compile(r"\(\s*[,;:–-]?\s*\)")
SENT_END = re.compile(r"(?<=[.!?])\s+(?=[A-ZÁÄČĎÉÍĹĽŇÓÔŔŠŤÚÝŽ])")
ABBR = re.compile(r"(\b\w{1,4}\.|\b[A-ZÁČĎÉÍĽŇÓŠŤÚÝŽ]\.)$")  # napr. r., tzv., resp., sv., J.

def first_sentence(raw):
    lead = raw.split("\n==", 1)[0]
    for para in clean(lead).split("\n"):
        para = re.sub(r"\s+", " ", EMPTY_PARENS.sub("", para)).strip()
        para = para.replace(" ,", ",").replace(" .", ".").replace("( ", "(").replace(" )", ")")
        if len(WORD.findall(para)) < 4 or para.startswith(("*", "#", ":", ";")):
            continue
        parts, sent = SENT_END.split(para), ""
        for p in parts:
            sent = (sent + " " + p).strip()
            if not ABBR.search(sent):
                break
        return sent[:400]
    return None

counts = collections.Counter()
vety, presmerovania = {}, {}
pages = 0
buf = []
with bz2.open(src, "rt", encoding="utf-8") as f:
    for line in f:
        if "<page>" in line:
            buf = []
        buf.append(line)
        if "</page>" in line:
            page = "".join(buf)
            if NS0.search(page):
                m = TEXT.search(page)
                title = html.unescape(TITLE.search(page).group(1))
                if m and REDIRECT.match(m.group(1).lstrip()):
                    t = REDIRECT_TARGET.search(html.unescape(m.group(1)))
                    if t: presmerovania[title] = t.group(1).strip()
                elif m:
                    raw = html.unescape(m.group(1))
                    counts.update(w.lower() for w in WORD.findall(clean(m.group(1))))
                    if out_vety and not DISAMBIG.search(raw):
                        s = first_sentence(raw)
                        if s: vety[title] = s
                    pages += 1
                    if pages % 50000 == 0:
                        print(pages, "článkov,", len(counts), "rôznych slov", file=sys.stderr)
with open(out, "w", encoding="utf-8", newline="\n") as f:
    for w, n in counts.most_common():
        if n >= 2:
            f.write(f"{w} {n}\n")
if out_vety:
    with open(out_vety, "w", encoding="utf-8") as f:
        json.dump({"vety": vety, "presmerovania": presmerovania}, f, ensure_ascii=False)
print(pages, "článkov,", sum(counts.values()), "slov,", len(counts), "rôznych,", len(vety), "prvých viet")
