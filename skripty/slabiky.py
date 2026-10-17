# Počet slabík slovenského slova.
#
# Slabikotvorné sú samohlásky a dvojhlásky a slabičné spoluhlásky r, ŕ, l, ĺ:
#   - dvojhlásky ia, ie, iu, ô sa počítajú ako jedna slabika (mie-sto, kôň);
#   - au, eu, ou len na začiatku slova (au-to, eu-ro); inde ide väčšinou o predponu (na-u-čiť, po-u-žiť);
#   - r, ŕ, l, ĺ sú slabičné medzi spoluhláskami alebo na konci po spoluhláske (krk, vlk, štvrť, myseľ nie).
# Viacslovné výrazy sa sčítajú po slovách. Je to pravidlo, nie slovník – pri cudzích slovách sa môže mýliť
# (napr. „ideál“ = i-de-ál sa počíta správne, „neurón“ dá 3 namiesto 2).
import re, sys

VOWELS = set("aáäeéiíoóôuúyý")
SYLLABIC = set("rŕlĺ")
DIPHTHONG = re.compile(r"i[aeu]")

def pocet_slabik(slovo):
    total = 0
    for w in re.findall(r"[^\W\d_]+", slovo.lower()):
        w = DIPHTHONG.sub("a", w)              # ia, ie, iu → jedna samohláska
        if w[:2] in ("au", "eu", "ou"):
            w = "a" + w[2:]
        n = 0
        for i, ch in enumerate(w):
            if ch in VOWELS:
                n += 1
            elif ch in SYLLABIC:
                prev_cons = i > 0 and w[i - 1] not in VOWELS
                next_cons = i + 1 >= len(w) or w[i + 1] not in VOWELS
                # jab-lko: „bl k“ medzi samohláskami – l patrí do skupiny spoluhlások, slabiku netvorí
                between_vowels = i >= 2 and w[i - 2] in VOWELS and i + 2 < len(w) and w[i + 2] in VOWELS
                if prev_cons and next_cons and not between_vowels and (i + 1 < len(w) or i > 0):
                    n += 1
        total += max(n, 1) if w else 0
    return total

if __name__ == "__main__":
    tests = {"pes": 1, "mačka": 2, "rozprávka": 3, "auto": 2, "krk": 1, "vlk": 1, "štvrť": 1, "miesto": 2,
             "kôň": 1, "naučiť": 3, "trambulína": 4, "chlieb": 1, "zmrzlina": 3, "prst": 1, "vietor": 2,
             "euro": 2, "smrť": 1, "Bratislava": 4, "slnko": 2, "mlieko": 2, "čln": 1, "jablko": 2,
             "hrdlo": 2, "srdce": 2, "tvrdý": 2, "zrnko": 2, "vŕba": 2, "škola": 2, "dieťa": 2, "kvapalný": 3}
    bad = {w: (pocet_slabik(w), n) for w, n in tests.items() if pocet_slabik(w) != n}
    print("chyby:", bad or "žiadne")
    for w in sys.argv[1:]:
        print(w, pocet_slabik(w))
