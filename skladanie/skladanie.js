/*
 * Skladanie slov – z dostupných písmen vypíše všetky slová, ktoré sa z nich dajú zložiť.
 *
 * Používa rovnaký slovník ako hlavná aplikácia (../data/slova.tsv). Načítanie slov, konštanty (CH, strip, enc,
 * COLLATOR, $) a okno so slovom (openDetail – výklad, tvary, synonymá) sú v ../slovnik.js.
 *
 * Pravidlá:
 *   - každé zadané písmeno sa dá použiť toľkokrát, koľkokrát je zadané (aaa = tri „a“), pokiaľ nie je
 *     zapnuté „písmená sa môžu opakovať“; nemusia sa použiť všetky,
 *   - „?“ alebo „*“ je žolík (prázdna kocka v Scrabble) – nahradí jedno ľubovoľné písmeno,
 *   - „ch“ je predvolene jedno písmeno (ako v slovenskej abecede a v hlavnej aplikácii),
 *   - známe písmená na pozíciách (vzor ?a??) určujú dĺžku a sú to písmená, ktoré už sú na hracej ploche –
 *     neodpočítavajú sa z dostupných písmen.
 */
"use strict";

DATA_BASE = "../data/";  // slovnik.js: podstránka je o priečinok nižšie
const PER_GROUP = 300;   // koľko slov jednej dĺžky sa ukáže, kým nekliknete „ďalšie“
let words = [];          // len jednoslovné slová z písmen (kandidáti na skladanie)

async function load() {
  const all = await loadWords();  // slovnik.js – parseLine
  setDetailWords(all);            // okno so slovom potrebuje všetky slová (preklik na synonymá)
  words = all.filter((e) => /^\p{L}+$/u.test(e.w));  // bez medzier, spojovníkov a bodiek
  for (const e of words) {
    e.plain = strip(e.lower);
    e.proper = e.w !== e.lower || e.pos === "name" || e.pos === "acronym";
  }
  restoreFromUrl();
  run();
}

// ---------- vstup ----------
function settings() {
  const ignore = $("ignore-diacritics").checked;
  const chOne = $("ch-one").checked;
  // tvar na porovnávanie: malé písmená, prípadne bez diakritiky, prípadne „ch“ ako jeden znak
  const norm = (s) => { let t = s.toLowerCase(); if (ignore) t = strip(t); return chOne ? enc(t) : t; };
  return { ignore, chOne, norm };
}

// dostupné písmená → počty; žolíky zvlášť
function parseLetters(raw, norm) {
  const counts = new Map();
  let wild = 0;
  for (const ch of norm(raw)) {
    if (ch === "?" || ch === "*") wild++;
    else if (/\p{L}/u.test(ch) || ch === CH) counts.set(ch, (counts.get(ch) || 0) + 1);
  }
  return { counts, wild };
}

// vzor „?a??“ → pole: null = neznáme písmeno, inak písmeno
function parsePattern(raw, norm) {
  const t = norm(raw.trim());
  if (!t) return null;
  return [...t].map((ch) => (ch === "?" || ch === "_" || ch === "." || ch === "*" ? null : ch));
}

// Dá sa slovo zložiť? Vráti pozície písmen, ktoré pokryl žolík (prázdne pole = bez žolíka), alebo null.
function compose(tokens, avail, pattern, repeat) {
  const left = repeat ? null : new Map(avail.counts);
  let wild = avail.wild;
  const wildPos = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (pattern && pattern[i] !== null) {          // písmeno už je na ploche
      if (pattern[i] !== t) return null;
      continue;
    }
    if (repeat ? avail.counts.has(t) : left.get(t) > 0) {
      if (!repeat) left.set(t, left.get(t) - 1);
    } else if (wild > 0 || (repeat && avail.wild > 0)) {
      if (!repeat) wild--;
      wildPos.push(i);
    } else {
      return null;
    }
  }
  return wildPos;
}

// ---------- hľadanie ----------
function run() {
  const { ignore, chOne, norm } = settings();
  const avail = parseLetters($("letters").value, norm);
  const pattern = parsePattern($("pattern").value, norm);
  const repeat = $("repeat").checked;
  const kids = $("kids").checked;
  const names = $("names").checked;
  const minFreq = +(document.querySelector('input[name="minfreq"]:checked')?.value || 0);
  let lenMin = parseInt($("len-min").value, 10) || 2;
  let lenMax = parseInt($("len-max").value, 10) || Infinity;
  if (pattern) lenMin = lenMax = pattern.length;
  saveToUrl();

  // počet všetkých dostupných písmen (kokot = 5), nie rôznych (k, o, t = 3) – slúži na rýchle vyradenie dlhších slov
  let available = avail.wild;
  for (const n of avail.counts.values()) available += n;
  if (!available && !pattern) {
    $("count").textContent = "Napíš písmená, ktoré máš k dispozícii.";
    $("groups").replaceChildren();
    return;
  }

  const found = [];
  let hiddenKids = 0;  // zložiteľné slová skryté režimom pre deti – len na upozornenie
  for (const e of words) {
    if (!names && e.proper) continue;
    if (minFreq && e.snk < minFreq) continue;
    const s = ignore ? e.plain : e.lower;
    const tokens = [...(chOne ? enc(s) : s)];
    if (tokens.length < lenMin || tokens.length > lenMax) continue;
    if (!repeat && !pattern && tokens.length > available) continue;
    const wildPos = compose(tokens, avail, pattern, repeat);
    if (!wildPos) continue;
    if (kids && e.bad) { hiddenKids++; continue; }
    found.push({ e, tokens, wildPos });
  }

  // skupiny podľa dĺžky (najdlhšie prvé), v skupine najprv bežnejšie slová
  const groups = new Map();
  for (const f of found) {
    const n = f.tokens.length;
    if (!groups.has(n)) groups.set(n, []);
    groups.get(n).push(f);
  }
  const frag = document.createDocumentFragment();
  for (const n of [...groups.keys()].sort((a, b) => b - a)) {
    const list = groups.get(n).sort((a, b) => a.wildPos.length - b.wildPos.length || b.e.snk - a.e.snk || COLLATOR.compare(a.e.lower, b.e.lower));
    frag.appendChild(renderGroup(n, list));
  }
  $("groups").replaceChildren(frag);
  const total = found.length;
  $("count").textContent = (total === 0 ? "Z týchto písmen sa nedá zložiť žiadne slovo."
    : foundText(total) + (groups.size > 1 ? ` (${groups.size} ${groups.size < 5 ? "dĺžky" : "dĺžok"})` : ""))
    + (hiddenKids ? ` · ${hiddenKids} ${hiddenKids === 1 ? "nevhodné slovo je skryté" : hiddenKids < 5 ? "nevhodné slová sú skryté" : "nevhodných slov je skrytých"} (vypni „vhodné pre deti“)` : "");
}

function letterWord(n) { return n === 1 ? "písmeno" : n < 5 ? "písmená" : "písmen"; }
// „Našlo sa 1 slovo“, „Našli sa 3 slová“, „Nájdených 39 slov“
function foundText(n) {
  const x = n.toLocaleString("sk");
  return n === 1 ? "Našlo sa 1 slovo" : n < 5 ? `Našli sa ${x} slová` : `Nájdených ${x} slov`;
}

function renderGroup(n, list) {
  const sec = document.createElement("section");
  sec.className = "group";
  const h = document.createElement("h2");
  h.append(`${n} ${letterWord(n)} `);
  const small = document.createElement("small");
  small.className = "muted";
  small.textContent = `(${list.length.toLocaleString("sk")})`;
  h.appendChild(small);
  const ul = document.createElement("ul");
  ul.className = "words";
  sec.append(h, ul);
  const add = (from) => {
    for (const f of list.slice(from, from + PER_GROUP)) ul.appendChild(renderWord(f));
    const shownNow = Math.min(list.length, from + PER_GROUP);
    sec.querySelector(".more-btn")?.remove();
    if (shownNow < list.length) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "ghost more-btn";
      b.textContent = `Zobraziť ďalšie (${(list.length - shownNow).toLocaleString("sk")})`;
      b.addEventListener("click", () => add(shownNow));
      sec.appendChild(b);
    }
  };
  add(0);
  return sec;
}

// slovo ako odkaz do hlavnej aplikácie; písmená pokryté žolíkom sú zvýraznené
function renderWord({ e, tokens, wildPos }) {
  const li = document.createElement("li");
  const a = document.createElement("a");
  a.href = "../?slovo=" + encodeURIComponent(e.w);  // otvorenie v novej karte (Ctrl/stredné tlačidlo) → Hľadač slov
  a.addEventListener("click", (ev) => {           // bežný klik → okno so slovom priamo tu (slovnik.js)
    if (ev.ctrlKey || ev.metaKey || ev.shiftKey || ev.button !== 0) return;
    ev.preventDefault();
    openDetail(e);
  });
  if (e.def) a.className = "has-def";
  const wild = new Set(wildPos);
  if (!wild.size) {
    a.textContent = e.w;
  } else {
    // tokeny patria k normalizovanému tvaru; zobrazujeme pôvodné písmená slova (s diakritikou)
    const orig = [...($("ch-one").checked ? enc(e.lower) : e.lower)];
    orig.forEach((t, i) => {
      const txt = t === CH ? "ch" : t;
      if (wild.has(i)) {
        const s = document.createElement("span");
        s.className = "wild";
        s.title = "žolík";
        s.textContent = txt;
        a.appendChild(s);
      } else {
        a.append(txt);
      }
    });
    a.title = "písmená podčiarknuté bodkami nahradil žolík";
  }
  li.appendChild(a);
  return li;
}

// ---------- stav v adrese (dá sa poslať odkaz) ----------
const URL_FIELDS = ["letters", "len-min", "len-max", "pattern"];
const URL_CHECKS = ["repeat", "ignore-diacritics", "ch-one", "kids", "names"];
function saveToUrl() {
  const p = new URLSearchParams();
  for (const id of URL_FIELDS) if ($(id).value) p.set(id, $(id).value);
  for (const id of URL_CHECKS) if ($(id).checked !== $(id).defaultChecked) p.set(id, $(id).checked ? "1" : "0");
  const f = document.querySelector('input[name="minfreq"]:checked');
  if (f && !f.defaultChecked) p.set("slova", f.value);
  const q = p.toString();
  history.replaceState(null, "", q ? "?" + q : location.pathname);
}
function restoreFromUrl() {
  const p = new URLSearchParams(location.search);
  for (const id of URL_FIELDS) if (p.has(id)) $(id).value = p.get(id).slice(0, 40);
  for (const id of URL_CHECKS) if (p.has(id)) $(id).checked = p.get(id) === "1";
  const f = p.get("slova") && document.querySelector(`input[name="minfreq"][value="${CSS.escape(p.get("slova"))}"]`);
  if (f) f.checked = true;
}

// ---------- udalosti ----------
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 150); };
$("form").addEventListener("input", schedule);
$("form").addEventListener("change", schedule);
$("form").addEventListener("submit", (ev) => { ev.preventDefault(); run(); });

load().catch((err) => {
  $("count").textContent = "Slovník sa nepodarilo načítať. Otvor stránku cez webový server (napr. GitHub Pages), nie ako súbor.";
  console.error(err);
});
