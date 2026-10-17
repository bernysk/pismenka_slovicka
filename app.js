/*
 * Písmenká – hľadač slovenských slov
 *
 * Celá aplikácia beží v prehliadači. Pri štarte načíta zoznam slov (data/slova.tsv, ~1,4 MB po kompresii),
 * výklady a významové vzťahy sa načítavajú až pri otvorení slova, a to len súbor pre jeho prvé písmeno
 * (data/vyklady/<x>.json, data/synonyma/<x>.json – desiatky kB).
 *
 * Formát data/slova.tsv (formát 2, generuje skripty/build_web.py), stĺpce oddelené tabulátorom:
 *   0 slovo · 1 kód slovného druhu (POS_FROM_CODE) · 2 „1“ ak má výklad · 3 príznaky ·
 *   4 frekvencia SNK · 5 v knihách · 6 v hovorenej reči · 7 vo Wikipédii · 8 počet slabík
 * Príznaky: m/f/s rod (aj viac naraz), A/I životné/neživotné, P pomnožné, N nevhodné pre deti.
 */
"use strict";

const PAGE = 500;  // koľko slov sa vykreslí naraz („Zobraziť ďalšie“ pridá ďalších 500)

// kód v slova.tsv → názov slovného druhu (rovnaké hodnoty používajú prepínače v index.html)
const POS_FROM_CODE = {
  n: "noun", a: "adjective", v: "verb", d: "adverb", p: "pronoun", c: "number", e: "preposition",
  o: "conjunction", t: "particle", j: "interjection", x: "acronym", m: "name", f: "phrase",
};
const POS_SK = {
  noun: "podstatné meno", adjective: "prídavné meno", verb: "sloveso", adverb: "príslovka",
  number: "číslovka", pronoun: "zámeno", preposition: "predložka", conjunction: "spojka",
  interjection: "citoslovce", particle: "častica", acronym: "skratka", name: "vlastné meno", phrase: "slovné spojenie",
};
const GENDER_SK = { m: "mužský rod", f: "ženský rod", s: "stredný rod" };

const $ = (id) => document.getElementById(id);
let words = [];   // všetky slová (pozri parseLine)
let results = [];  // slová, ktoré vyhovujú filtrom, už zoradené
let shown = 0;     // koľko z results je vykreslených

const strip = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");  // odstráni diakritiku

// „ch“ je v slovenčine jedno písmeno: pri porovnávaní ho nahradíme jedným znakom (súkromná oblasť Unicode),
// takže sa počíta ako jedno písmeno a „c“ ani „h“ sa s ním nezhodujú.
const CH = "";
const enc = (s) => s.replace(/ch/g, CH);

// ---------- načítanie ----------
function parseLine(line) {
  const [w, posCode, def, flags = "", snk, knihy, hovor, wiki, slabiky] = line.split("\t");
  const lower = w.toLowerCase();
  const t = enc(lower);
  return {
    w,
    pos: POS_FROM_CODE[posCode] || posCode,
    def: def === "1",
    snk: +snk || 0, knihy: +knihy || 0, hovor: +hovor || 0, wiki: +wiki || 0,
    syl: +slabiky || 0,
    rod: flags.replace(/[^mfs]/g, ""),                             // „m“, „f“, „s“ alebo viac naraz („mf“)
    ziv: flags.includes("A") ? "A" : flags.includes("I") ? "I" : "",
    pomn: flags.includes("P"),
    bad: flags.includes("N"),
    lower,
    t,                        // tvar na porovnávanie: malé písmená, „ch“ ako jeden znak
    tp: enc(strip(lower)),    // to isté bez diakritiky (prepínač „ignorovať diakritiku“)
    len: [...t].length,       // dĺžka v písmenách („ch“ = 1)
  };
}

async function load() {
  const text = await (await fetch("data/slova.tsv")).text();
  words = text.split("\n").filter((l) => l && !l.startsWith("#")).map(parseLine);
  addRule();
  run();
}

// ---------- pravidlá „písmená, ktoré slovo musí obsahovať“ ----------
function addRule(data = {}) {
  const node = $("rule-tpl").content.firstElementChild.cloneNode(true);
  const q = (c) => node.querySelector(c);
  if (data.letter) q(".r-letter").value = data.letter;
  if (data.where) q(".r-where").value = data.where;
  q(".r-pos").hidden = q(".r-where").value !== "pos";
  q(".r-where").addEventListener("change", () => { q(".r-pos").hidden = q(".r-where").value !== "pos"; });
  q(".r-del").addEventListener("click", () => { node.remove(); run(); });
  $("rules").appendChild(node);
  return node;
}

function readRules(norm) {
  return [...document.querySelectorAll(".rule")].map((n) => ({
    s: norm(n.querySelector(".r-letter").value.trim().toLowerCase()),  // písmeno alebo skupina písmen
    where: n.querySelector(".r-where").value,                            // any/start/end/middle/not-start/not-end/pos
    pos: parseInt(n.querySelector(".r-pos").value, 10),                  // pozícia (1 = prvé písmeno)
    cmp: n.querySelector(".r-cmp").value,                                // min/eq/max
    count: parseInt(n.querySelector(".r-count").value, 10),
  })).filter((r) => r.s);
}

function countOf(word, s) {
  let n = 0, i = word.indexOf(s);
  while (i !== -1) { n++; i = word.indexOf(s, i + 1); }
  return n;
}

// Vyhovuje slovo jednému pravidlu? Najprv poloha, potom počet výskytov v celom slove.
function matchRule(word, r) {
  const L = word.length, k = r.s.length;
  switch (r.where) {
    case "start": if (!word.startsWith(r.s)) return false; break;
    case "end": if (!word.endsWith(r.s)) return false; break;
    case "not-start": if (word.startsWith(r.s)) return false; break;
    case "not-end": if (word.endsWith(r.s)) return false; break;
    case "middle": {  // aspoň jeden výskyt, ktorý nie je na začiatku ani na konci
      const i = word.indexOf(r.s, 1);
      if (i === -1 || i + k >= L) return false;
      break;
    }
    case "pos":
      if (Number.isFinite(r.pos) && word.substr(r.pos - 1, k) !== r.s) return false;
      break;
  }
  const c = countOf(word, r.s);
  const want = Number.isFinite(r.count) ? r.count : 1;
  if (r.cmp === "min") return c >= want;
  if (r.cmp === "eq") return c === want;
  return c <= want;
}

// „xyz“ → [x, y, z]; „ch, x“ alebo „ch x“ → [ch, x]
function parseExclude(raw, norm) {
  raw = norm(raw.toLowerCase());
  const parts = /[\s,;]/.test(raw) ? raw.split(/[\s,;]+/) : [...raw];
  return parts.filter(Boolean);
}

// vzor „m??ka“: ? (alebo _ .) = jedno písmeno, * = čokoľvek
function patternRegex(raw, norm) {
  raw = norm(raw.trim().toLowerCase());
  if (!raw) return null;
  const esc = [...raw].map((ch) => (ch === "?" || ch === "_" || ch === "." ? "." : ch === "*" ? ".*" : ch.replace(/[\\^$+()[\]{}|]/g, "\\$&")));
  return new RegExp("^" + esc.join("") + "$", "u");
}

// ---------- filtrovanie a zoradenie ----------
function run() {
  const ignore = $("ignore-diacritics").checked;
  const norm = ignore ? (s) => enc(strip(s)) : enc;
  const rules = readRules(norm);
  const excl = parseExclude($("exclude").value, norm);
  const pat = patternRegex($("pattern").value, norm);
  const num = (id) => parseInt($(id).value, 10);
  const [lenMin, lenMax, sylMin, sylMax] = [num("len-min"), num("len-max"), num("syl-min"), num("syl-max")];
  const onlyLower = $("only-lower").checked;
  const onlyDefs = $("only-defs").checked;
  const noSpaces = $("no-spaces").checked;
  const kids = $("kids").checked;
  const checked = (name) => [...document.querySelectorAll(`input[name="${name}"]:checked`)].map((i) => i.value);
  const posSet = new Set(checked("pos"));
  const rodSet = checked("rod");
  const zivSet = checked("ziv");
  const pomn = checked("pomn")[0] || "";
  const minFreq = +(checked("minfreq")[0] || 0);

  // lacné podmienky (príznaky, čísla) idú pred drahšími (reťazce, regulárne výrazy)
  results = words.filter((e) => {
    if (onlyLower && (e.w !== e.lower || e.pos === "acronym" || e.pos === "name" || e.w.includes("."))) return false;
    if (noSpaces && /[\s-]/.test(e.w)) return false;
    if (onlyDefs && !e.def) return false;
    if (kids && e.bad) return false;
    if (minFreq && e.snk < minFreq) return false;
    if (posSet.size && !posSet.has(e.pos)) return false;
    if (rodSet.length && !rodSet.some((r) => e.rod.includes(r))) return false;
    if (zivSet.length && !zivSet.includes(e.ziv)) return false;
    if (pomn === "P" && !e.pomn) return false;
    if (pomn === "-P" && e.pomn) return false;
    if (lenMin && e.len < lenMin) return false;
    if (lenMax && e.len > lenMax) return false;
    if (sylMin && e.syl < sylMin) return false;
    if (sylMax && e.syl > sylMax) return false;
    const word = ignore ? e.tp : e.t;
    for (const x of excl) if (word.includes(x)) return false;
    if (pat && !pat.test(word)) return false;
    for (const r of rules) if (!matchRule(word, r)) return false;
    return true;
  });

  const sort = $("sort").value;
  const alpha = (a, b) => a.lower.localeCompare(b.lower, "sk");
  const by = (k) => (a, b) => b[k] - a[k] || alpha(a, b);
  const sorters = {
    freq: by("snk"), "freq-books": by("knihy"), "freq-sub": by("hovor"), "freq-wiki": by("wiki"),
    len: (a, b) => a.len - b.len || alpha(a, b), "len-desc": (a, b) => b.len - a.len || alpha(a, b),
  };
  results.sort(sorters[sort] || alpha);

  $("list").replaceChildren();
  shown = 0;
  renderMore();
}

function renderMore() {
  const frag = document.createDocumentFragment();
  for (const e of results.slice(shown, shown + PAGE)) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e.w;
    if (e.def) { b.className = "has-def"; b.title = "má výklad"; }
    b.addEventListener("click", () => openDetail(e));
    li.appendChild(b);
    frag.appendChild(li);
  }
  $("list").appendChild(frag);
  shown = Math.min(results.length, shown + PAGE);
  const n = results.length;
  $("count").textContent = n === 0 ? "Žiadne slovo nevyhovuje filtrom."
    : `Nájdených ${n.toLocaleString("sk")} slov` + (n > shown ? ` (zobrazených ${shown.toLocaleString("sk")})` : "");
  $("more").hidden = shown >= n;
}

// ---------- dáta po písmenách (výklady, synonymá) ----------
// Rovnaký kľúč ako skripty/spolocne.py → kluc_shardu(): prvé písmeno bez diakritiky, inak „_“.
function shardKey(w) {
  const ch = strip(w.slice(0, 1).toLowerCase());
  return ch >= "a" && ch <= "z" ? ch : "_";
}
const shardCache = new Map();  // "vyklady/p" → Promise<{slovo: …}>
function loadShard(dir, w) {
  const key = `${dir}/${shardKey(w)}`;
  if (!shardCache.has(key)) {
    shardCache.set(key, fetch(`data/${key}.json`).then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
  }
  return shardCache.get(key);
}

// ---------- detail slova ----------
function link(href, text) {
  const a = document.createElement("a");
  a.href = href;
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = text;
  return a;
}

async function openDetail(e) {
  $("detail-word").textContent = e.w;
  const n = (x) => x.toLocaleString("sk");
  const gram = [
    POS_SK[e.pos] || e.pos,
    [...e.rod].map((r) => GENDER_SK[r]).join(" / "),
    e.ziv === "A" ? "životné" : e.ziv === "I" ? "neživotné" : "",
    e.pomn ? "pomnožné" : "",
    e.syl ? `${e.syl} ${e.syl === 1 ? "slabika" : e.syl < 5 ? "slabiky" : "slabík"}` : "",
  ];
  const freqText = `výskyty: Slovenský národný korpus ${n(e.snk)}× (z toho knihy ${n(e.knihy)}×), ` +
    `hovorená reč ${n(e.hovor)}×, Wikipédia ${n(e.wiki)}×`;
  $("detail-pos").textContent = [...gram, freqText].filter(Boolean).join(" · ");
  const body = $("detail-body");
  body.replaceChildren();
  if (!$("detail").open) $("detail").showModal();  // pri preklikaní na synonymum je okno už otvorené
  $("detail").scrollTop = 0;
  body.textContent = "Načítavam…";
  const [defs, rels] = await Promise.all([e.def ? loadShard("vyklady", e.w) : {}, loadShard("synonyma", e.w)]);
  if ($("detail-word").textContent !== e.w) return;  // medzitým sa otvorilo iné slovo
  body.replaceChildren();

  const d = defs[e.w] || {};
  for (const [key, title] of [["sk", "Výklad"], ["en", "Po anglicky"]]) {
    if (!d[key]) continue;
    const h = document.createElement("h4");
    h.textContent = title;
    const ol = document.createElement("ol");
    for (const t of d[key]) { const li = document.createElement("li"); li.textContent = t; ol.appendChild(li); }
    body.append(h, ol);
  }
  if (d.wiki) {
    const [veta, clanok] = d.wiki;
    const h = document.createElement("h4");
    h.textContent = "Z Wikipédie";
    const p = document.createElement("p");
    p.textContent = veta + " ";
    p.appendChild(link("https://sk.wikipedia.org/wiki/" + encodeURIComponent(clanok.replace(/ /g, "_")), "Celý článok ↗"));
    body.append(h, p);
  }
  if (!e.def) {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "K tomuto slovu zatiaľ nemáme výklad.";
    body.appendChild(p);
  }
  renderRelations(e, rels[e.w], body);
  // Miesto pre budúcu tabuľku tvarov (skloňovanie/časovanie) – pozri docs/plan-tvary.md
  const p = document.createElement("p");
  p.appendChild(link("https://slovnik.juls.savba.sk/?w=" + encodeURIComponent(e.w), "Hľadať v slovníkoch JÚĽŠ SAV ↗"));
  body.appendChild(p);
}

// ---------- významové vzťahy: synonymá, antonymá, nadradené a podradené pojmy ----------
let byWord = null;  // Map slovo → záznam, na preklik na súvisiace slovo

function renderRelations(e, r, body) {
  if (!r) return;
  byWord ??= new Map(words.map((x) => [x.w, x]));
  const kids = $("kids").checked;
  const ok = (s) => !(kids && (s.includes("vulgarizmus") || byWord.get(s)?.bad));
  const chipFor = (s) => {
    const target = byWord.get(s.replace(/\s*\(.*\)$/, ""));  // „fáro (hovorovo)“ → „fáro“
    if (!target) { const span = document.createElement("span"); span.className = "rel-word"; span.textContent = s; return span; }
    const b = document.createElement("button");
    b.type = "button";
    b.className = "rel-word link";
    b.textContent = s;
    b.addEventListener("click", () => openDetail(target));
    return b;
  };
  const groups = (r.s || []).map((g) => g.filter(ok)).filter((g) => g.length);
  const ants = (r.a || []).filter(ok);
  const hyper = (r.h || []).filter(ok);
  const hypo = (r.d || []).filter(ok);
  if (!groups.length && !ants.length && !hyper.length && !hypo.length) return;
  const h = document.createElement("h4");
  h.textContent = "Významové vzťahy";
  body.appendChild(h);
  const dl = document.createElement("dl");
  dl.className = "relations";
  const row = (label, lines) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    dl.appendChild(dt);
    for (const line of lines) {
      const dd = document.createElement("dd");
      line.forEach((s, i) => { if (i) dd.append(", "); dd.appendChild(chipFor(s)); });
      dl.appendChild(dd);
    }
  };
  if (groups.length) row("Synonymá", groups);
  if (ants.length) row("Antonymá", [ants]);
  if (hyper.length) row("Nadradené pojmy", [hyper]);
  if (hypo.length) row("Podradené pojmy", [hypo]);
  body.appendChild(dl);
}

// ---------- udalosti ----------
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 120); };  // filtruj až po krátkej pauze v písaní
$("filters").addEventListener("input", schedule);
$("filters").addEventListener("change", schedule);
$("filters").addEventListener("submit", (ev) => ev.preventDefault());
$("add-rule").addEventListener("click", () => addRule().querySelector(".r-letter").focus());
$("more").addEventListener("click", renderMore);
$("clear-filters").addEventListener("click", () => {
  $("filters").reset();
  $("rules").replaceChildren();
  addRule();
  run();
});
$("detail").addEventListener("click", (ev) => { if (ev.target === $("detail")) $("detail").close(); });  // klik mimo okna
document.querySelectorAll("[data-pos]").forEach((b) => b.addEventListener("click", () => {  // rýchle výbery druhov
  const want = new Set(b.dataset.pos.split(",").filter(Boolean));
  document.querySelectorAll('input[name="pos"]').forEach((i) => { i.checked = want.has(i.value); });
  run();
}));

load().catch((err) => {
  $("count").textContent = "Slovník sa nepodarilo načítať. Otvor stránku cez webový server (napr. GitHub Pages), nie ako súbor.";
  console.error(err);
});
