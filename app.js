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
 * Tabuľky tvarov (skloňovanie, časovanie) sa načítajú z data/tvary/<x>.json – pozri loadForms().
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
  const [defs, rels, forms] = await Promise.all([
    e.def ? loadShard("vyklady", e.w) : {}, loadShard("synonyma", e.w),
    FORM_POS.has(e.pos) ? loadForms(e.w) : null,
  ]);
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
  if (forms) renderForms(e, forms, body);
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

// ---------- tvary slova: skloňovanie a časovanie (data/tvary/, generuje skripty/tvary_web.py) ----------
// data/tvary/znacky.json = zoznam značiek (index = ID), data/tvary/<x>.json = {slovo: [[ID značky, rozdiel], …]}.
// Rozdiel: "=" rovnaký tvar ako slovo, "2sa" = odober 2 posledné znaky a pridaj „sa“ (pes → psa).
// Viac tvarov s rovnakou značkou sú varianty (psi, psy), prvý je hlavný.
const FORM_POS = new Set(["noun", "adjective", "verb", "name"]);
let formTags = null;  // Promise<["N;NOM;SG", …]>
async function loadForms(w) {
  formTags ??= fetch("data/tvary/znacky.json").then((r) => (r.ok ? r.json() : [])).catch(() => []);
  const [tags, shard] = await Promise.all([formTags, loadShard("tvary", w)]);
  const rows = shard[w];
  if (!rows || !tags.length) return null;
  const m = new Map();  // značka → [tvar, …]
  for (const [id, d] of rows) {
    const [, cut, add] = d === "=" ? [, "", ""] : d.match(/^(\d*)(.*)$/);
    const form = (cut ? w.slice(0, w.length - +cut) : w) + add;
    if (!m.has(tags[id])) m.set(tags[id], []);
    m.get(tags[id]).push(form);
  }
  return m;
}

const CASES = [  // poradie a otázky ako v škole; vokatív sa ako pád neuvádza
  ["NOM", "N", "nominatív", "kto? čo?"], ["GEN", "G", "genitív", "(bez) koho? čoho?"],
  ["DAT", "D", "datív", "komu? čomu?"], ["ACC", "A", "akuzatív", "koho? čo?"],
  ["ESS", "L", "lokál", "(o) kom? čom?"], ["INS", "I", "inštrumentál", "(s) kým? čím?"],
];
// stredný rod hneď za mužským: v jednotnom čísle má s ním rovnaké tvary v G, D, L, I a bunky sa zlúčia
const ADJ_GENDERS = [["MASC", "mužský"], ["NEUT", "stredný"], ["FEM", "ženský"]];
const PERSONS = [["1;SG", "ja"], ["2;SG", "ty"], ["3;SG", "on, ona, ono"], ["1;PL", "my"], ["2;PL", "vy"], ["3;PL", "oni, ony"]];

function el(tag, cls, text) {
  const x = document.createElement(tag);
  if (cls) x.className = cls;
  if (text != null) x.textContent = text;
  return x;
}
// hlavička riadku s pádom: „nominatív“ + otázka; na úzkej obrazovke len „N“ (CSS .case-short)
function caseHeader([, short, name, q]) {
  const th = el("th");
  th.scope = "row";
  th.title = `${name} – ${q}`;
  th.append(el("span", "case-short", short), el("span", "case-long", name), el("small", "case-q", q));
  return th;
}
// tabuľka: hlavičky stĺpcov + riadky [hlavička riadku alebo null, [text bunky, …]]; susedné rovnaké bunky sa zlúčia
function formTable(cols, rows, cls) {
  const wrap = el("div", "forms-wrap");
  const t = el("table", "forms " + (cls || ""));
  const heads = rows.some(([head]) => head !== null);
  if (cols) {
    const tr = el("tr");
    if (heads) tr.appendChild(el("td"));
    for (const c of cols) { const th = el("th", "", c); th.scope = "col"; tr.appendChild(th); }
    t.createTHead().appendChild(tr);
  }
  const tb = t.createTBody();
  for (const [head, cells] of rows) {
    const tr = el("tr");
    if (typeof head === "string") { const th = el("th", "", head); th.scope = "row"; tr.appendChild(th); }
    else if (head) tr.appendChild(head);
    for (let i = 0; i < cells.length; i++) {
      let span = 1;
      while (i + span < cells.length && JSON.stringify(cells[i + span]) === JSON.stringify(cells[i])) span++;
      const td = el("td", cells[i] ? "" : "muted", typeof cells[i] === "string" ? cells[i] || "–" : null);
      if (Array.isArray(cells[i])) {  // viac riadkov s menovkou: [["živ.", "pekného"], ["neživ.", "pekný"]]
        cells[i].forEach(([label, text], j) => { if (j) td.append(el("br")); td.append(el("small", "muted", label + " "), text); });
      }
      if (span > 1) td.colSpan = span;
      tr.appendChild(td);
      i += span - 1;
    }
    tb.appendChild(tr);
  }
  wrap.appendChild(t);
  return wrap;
}

function renderForms(e, m, body) {
  const get = (tag) => (m.get(tag) || []).join(", ");
  const section = (title) => { const h = el("h4", "", title); body.appendChild(h); };
  const sub = (title) => body.appendChild(el("p", "forms-sub", title));

  // podstatné mená: riadky = pády, stĺpce = jednotné a množné číslo (pomnožné majú len množné)
  if (CASES.some(([c]) => m.has(`N;${c};SG`) || m.has(`N;${c};PL`))) {
    section("Skloňovanie");
    const nums = [["SG", "jednotné číslo"], ["PL", "množné číslo"]].filter(([n]) => CASES.some(([c]) => m.has(`N;${c};${n}`)));
    body.appendChild(formTable(nums.map(([, x]) => x), CASES.map((c) => [caseHeader(c), nums.map(([n]) => get(`N;${c[0]};${n}`))])));
  }

  // prídavné mená: pre každé číslo tabuľka riadky = pády, stĺpce = rody
  if (CASES.some(([c]) => m.has(`ADJ;MASC;ANIM;${c};SG`))) {
    section("Skloňovanie");
    for (const [n, title] of [["SG", "Jednotné číslo"], ["PL", "Množné číslo"]]) {
      sub(title);
      body.appendChild(formTable(ADJ_GENDERS.map(([, x]) => x),
        CASES.map((c) => [caseHeader(c), ADJ_GENDERS.map(([g]) => {
          if (g !== "MASC") return get(`ADJ;${g};${c[0]};${n}`);
          // mužský rod: životné a neživotné sa líšia len v niektorých pádoch (pekného / pekný)
          const an = get(`ADJ;MASC;ANIM;${c[0]};${n}`), inan = get(`ADJ;MASC;INAN;${c[0]};${n}`);
          return an === inan ? an : [["živ.", an], ["neživ.", inan]];
        })]), "adj"));
    }
    const cmp = get("ADJ;MASC;ANIM;NOM;SG;CMPR"), sup = get("ADJ;MASC;ANIM;NOM;SG;SPRL");
    if (cmp || sup) {
      section("Stupňovanie");
      body.appendChild(formTable(["1. stupeň", "2. stupeň", "3. stupeň"], [[null, [e.w, cmp, sup]]], "compare"));
    }
  }

  // slovesá
  if (m.has("V;NFIN") || PERSONS.some(([p]) => m.has(`V;PRS;IND;${p}`))) {
    section("Časovanie");
    const persons = (tense) => {
      const sg = PERSONS.slice(0, 3), pl = PERSONS.slice(3);
      return formTable(["jednotné číslo", "množné číslo"], [0, 1, 2].map((i) => [
        `${i + 1}. osoba`, [sg[i], pl[i]].map(([p, pron]) => { const f = get(`V;${tense};IND;${p}`); return f ? [[pron, f]] : ""; }),
      ]), "verb");
    };
    if (m.has("V;NFIN")) body.appendChild(el("p", "forms-line", "")).append(el("span", "muted", "neurčitok: "), get("V;NFIN"));
    if (PERSONS.some(([p]) => m.has(`V;PRS;IND;${p}`))) {
      sub("Prítomný čas");
      body.appendChild(persons("PRS"));
      body.appendChild(el("p", "muted forms-note", "Pri dokonavých slovesách (urobiť, prísť) majú tieto tvary význam budúceho času."));
    }
    if (PERSONS.some(([p]) => m.has(`V;FUT;IND;${p}`))) { sub("Budúci čas"); body.appendChild(persons("FUT")); }
    const past = ["V;PST;IND;3;SG;MASC", "V;PST;IND;3;SG;FEM", "V;PST;IND;3;SG;NEUT", "V;PST;IND;3;PL"].map(get);
    if (past.some(Boolean)) {
      sub("Minulý čas");
      body.appendChild(formTable(["on", "ona", "ono", "oni, ony"], [[null, past]], "verb past"));
    }
    const imp = [["V;IMP;2;SG", "ty"], ["V;IMP;1;PL", "my"], ["V;IMP;2;PL", "vy"]].map(([t]) => get(t));
    if (imp.some(Boolean)) {
      sub("Rozkazovací spôsob");
      body.appendChild(formTable(["(ty)", "(my)", "(vy)"], [[null, imp.map((f) => (f ? f + "!" : ""))]], "verb imp"));
    }
  }
  if (body.querySelector(".forms")) {
    body.appendChild(el("p", "muted forms-note", "Tvary podľa morfologického slovníka MorfFlex SK (ÚFAL MFF UK), CC BY-NC-SA 4.0."));
  }
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
