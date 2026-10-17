"use strict";

const PAGE = 500;
const POS_SK = {
  noun: "podstatné meno", adjective: "prídavné meno", verb: "sloveso", adverb: "príslovka",
  number: "číslovka", num: "číslovka", pronoun: "zámeno", preposition: "predložka", prep: "predložka",
  conjunction: "spojka", conj: "spojka", interjection: "citoslovce", intj: "citoslovce",
  particle: "častica", participle: "príčastie", acronym: "skratka", abbrev: "skratka",
  name: "vlastné meno", phrase: "slovné spojenie", proverb: "príslovie", character: "písmeno",
};
const GENDER_SK = { m: "mužský rod", f: "ženský rod", s: "stredný rod" };

const $ = (id) => document.getElementById(id);
let words = [];        // [{w, pos, def, freq, lower, t, tp, len}]
let defs = null;       // načítané až pri prvom otvorení výkladu
let results = [];
let shown = 0;

const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

// „ch“ je v slovenčine jedno písmeno: pri porovnávaní ho nahradíme jedným znakom,
// takže počíta sa ako jedno písmeno a „c“ ani „h“ sa s ním nezhodujú.
const CH = "\uE000";
const enc = (s) => s.replace(/ch/g, CH);

async function load() {
  const text = await (await fetch("data/slova.tsv")).text();
  words = text.split("\n").filter(Boolean).map((line) => {
    const [w, pos, def, freq, flags = "", wfreq] = line.split("\t");
    const lower = w.toLowerCase();
    const t = enc(lower);
    return {
      w, pos, def: def === "1", freq: +freq || 0, wfreq: +wfreq || 0, lower, t, tp: enc(strip(lower)), len: [...t].length,
      rod: flags.replace(/[^mfs]/g, ""),                                  // m/f/s, môže byť aj viac (napr. „mf“)
      ziv: flags.includes("A") ? "A" : flags.includes("I") ? "I" : "",
      pomn: flags.includes("P"), bad: flags.includes("N"),
    };
  });
  // spoločné skóre: priemer relatívnej frekvencie v titulkoch a vo Wikipédii (každý zdroj má inú veľkosť)
  const sumSub = words.reduce((s, e) => s + e.freq, 0) || 1;
  const sumWiki = words.reduce((s, e) => s + e.wfreq, 0) || 1;
  for (const e of words) e.score = e.freq / sumSub + e.wfreq / sumWiki;
  addRule();
  run();
}

// ---------- pravidlá ----------
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
    s: norm(n.querySelector(".r-letter").value.trim().toLowerCase()),
    where: n.querySelector(".r-where").value,
    pos: parseInt(n.querySelector(".r-pos").value, 10),
    cmp: n.querySelector(".r-cmp").value,
    count: parseInt(n.querySelector(".r-count").value, 10),
  })).filter((r) => r.s);
}

function countOf(word, s) {
  let n = 0, i = word.indexOf(s);
  while (i !== -1) { n++; i = word.indexOf(s, i + 1); }
  return n;
}

function matchRule(word, r) {
  const L = word.length, k = r.s.length;
  switch (r.where) {
    case "start": if (!word.startsWith(r.s)) return false; break;
    case "end": if (!word.endsWith(r.s)) return false; break;
    case "not-start": if (word.startsWith(r.s)) return false; break;
    case "not-end": if (word.endsWith(r.s)) return false; break;
    case "middle": {
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

function parseExclude(raw, norm) {
  raw = norm(raw.toLowerCase());
  const parts = /[\s,;]/.test(raw) ? raw.split(/[\s,;]+/) : [...raw];
  return parts.filter(Boolean);
}

function patternRegex(raw, norm) {
  raw = norm(raw.trim().toLowerCase());
  if (!raw) return null;
  const esc = [...raw].map((ch) => (ch === "?" || ch === "_" || ch === "." ? "." : ch === "*" ? ".*" : ch.replace(/[\\^$+()[\]{}|]/g, "\\$&")));
  return new RegExp("^" + esc.join("") + "$", "u");
}

// ---------- filtrovanie ----------
function run() {
  const ignore = $("ignore-diacritics").checked;
  const norm = ignore ? (s) => enc(strip(s)) : enc;
  const rules = readRules(norm);
  const excl = parseExclude($("exclude").value, norm);
  const pat = patternRegex($("pattern").value, norm);
  const min = parseInt($("len-min").value, 10);
  const max = parseInt($("len-max").value, 10);
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

  results = words.filter((e) => {
    if (onlyLower && (e.w !== e.lower || e.pos === "acronym" || e.pos === "name" || e.w.includes("."))) return false;
    if (noSpaces && /[\s-]/.test(e.w)) return false;
    if (onlyDefs && !e.def) return false;
    if (kids && e.bad) return false;
    if (minFreq && e.freq + e.wfreq < minFreq) return false;
    if (posSet.size && !posSet.has(e.pos)) return false;
    if (rodSet.length && !rodSet.some((r) => e.rod.includes(r))) return false;
    if (zivSet.length && !zivSet.includes(e.ziv)) return false;
    if (pomn === "P" && !e.pomn) return false;
    if (pomn === "-P" && e.pomn) return false;
    const word = ignore ? e.tp : e.t;
    if (min && e.len < min) return false;
    if (max && e.len > max) return false;
    for (const x of excl) if (word.includes(x)) return false;
    if (pat && !pat.test(word)) return false;
    for (const r of rules) if (!matchRule(word, r)) return false;
    return true;
  });

  const sort = $("sort").value;
  const by = (k) => (a, b) => b[k] - a[k] || a.lower.localeCompare(b.lower, "sk");
  if (sort === "freq") results.sort(by("score"));
  else if (sort === "freq-sub") results.sort(by("freq"));
  else if (sort === "freq-wiki") results.sort(by("wfreq"));
  else if (sort === "len") results.sort((a, b) => a.len - b.len || a.lower.localeCompare(b.lower, "sk"));
  else if (sort === "len-desc") results.sort((a, b) => b.len - a.len || a.lower.localeCompare(b.lower, "sk"));
  else results.sort((a, b) => a.lower.localeCompare(b.lower, "sk"));

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

// ---------- detail ----------
async function openDetail(e) {
  $("detail-word").textContent = e.w;
  const freqText = `výskyty (všetky tvary): titulky ${e.freq.toLocaleString("sk")}×, Wikipédia ${e.wfreq.toLocaleString("sk")}×`;
  const gram = [
    POS_SK[e.pos] || e.pos,
    [...e.rod].map((r) => GENDER_SK[r]).join(" / "),
    e.ziv === "A" ? "životné" : e.ziv === "I" ? "neživotné" : "",
    e.pomn ? "pomnožné" : "",
  ];
  $("detail-pos").textContent = [...gram, freqText].filter(Boolean).join(" · ");
  const body = $("detail-body");
  body.replaceChildren();
  if (!$("detail").open) $("detail").showModal();  // pri preklikaní na synonymum je okno už otvorené
  $("detail").scrollTop = 0;
  if (e.def) {
    if (!defs) {
      body.textContent = "Načítavam výklad…";
      defs = await (await fetch("data/vyklady.json")).json();
      body.replaceChildren();
    }
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
      const a = document.createElement("a");
      a.href = "https://sk.wikipedia.org/wiki/" + encodeURIComponent(clanok.replace(/ /g, "_"));
      a.target = "_blank";
      a.rel = "noopener";
      a.textContent = "Celý článok ↗";
      p.appendChild(a);
      body.append(h, p);
    }
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "K tomuto slovu zatiaľ nemáme výklad.";
    body.appendChild(p);
  }
  await renderRelations(e, body);
  const p = document.createElement("p");
  const a = document.createElement("a");
  a.href = "https://slovnik.juls.savba.sk/?w=" + encodeURIComponent(e.w);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Hľadať v slovníkoch JÚĽŠ SAV ↗";
  p.appendChild(a);
  body.appendChild(p);
}

// ---------- významové vzťahy (synonymá, antonymá) ----------
let relations = null;  // data/synonyma.json, načítané pri prvom otvorení detailu
let byWord = null;

async function renderRelations(e, body) {
  if (!relations) {
    try { relations = await (await fetch("data/synonyma.json")).json(); } catch { relations = {}; }
    byWord = new Map(words.map((x) => [x.w, x]));
  }
  const r = relations[e.w];
  if (!r) return;
  const kids = $("kids").checked;
  const ok = (s) => !(kids && (s.includes("vulgarizmus") || byWord.get(s)?.bad));
  const chipFor = (s) => {
    const target = byWord.get(s.replace(/\s*\(.*\)$/, ""));
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
  if (!groups.length && !ants.length) return;
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
  body.appendChild(dl);
}

// ---------- udalosti ----------
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 120); };
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
$("detail").addEventListener("click", (ev) => { if (ev.target === $("detail")) $("detail").close(); });
document.querySelectorAll("[data-pos]").forEach((b) => b.addEventListener("click", () => {
  const want = new Set(b.dataset.pos.split(",").filter(Boolean));
  document.querySelectorAll('input[name="pos"]').forEach((i) => { i.checked = want.has(i.value); });
  run();
}));

load().catch((err) => {
  $("count").textContent = "Slovník sa nepodarilo načítať. Otvor stránku cez webový server (napr. GitHub Pages), nie ako súbor.";
  console.error(err);
});
