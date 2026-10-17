"use strict";

const PAGE = 500;
const POS_SK = {
  noun: "podstatné meno", adjective: "prídavné meno", verb: "sloveso", adverb: "príslovka",
  number: "číslovka", num: "číslovka", pronoun: "zámeno", preposition: "predložka", prep: "predložka",
  conjunction: "spojka", conj: "spojka", interjection: "citoslovce", intj: "citoslovce",
  particle: "častica", participle: "príčastie", acronym: "skratka", abbrev: "skratka",
  name: "vlastné meno", phrase: "slovné spojenie", proverb: "príslovie", character: "písmeno",
};
const GENDER_SK = { masculine: "mužský rod", feminine: "ženský rod", neuter: "stredný rod" };

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
    const [w, pos, def, freq, flags = ""] = line.split("\t");
    const lower = w.toLowerCase();
    const t = enc(lower);
    return { w, pos, def: def === "1", freq: +freq || 0, form: flags.includes("T"), bad: flags.includes("N"), lower, t, tp: enc(strip(lower)), len: [...t].length };
  });
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
  const onlyBase = $("only-base").checked;

  results = words.filter((e) => {
    if (onlyLower && (e.w !== e.lower || e.pos === "acronym" || e.pos === "name" || e.w.includes("."))) return false;
    if (noSpaces && /[\s-]/.test(e.w)) return false;
    if (onlyDefs && !e.def) return false;
    if (kids && e.bad) return false;
    if (onlyBase && e.form) return false;
    const word = ignore ? e.tp : e.t;
    if (min && e.len < min) return false;
    if (max && e.len > max) return false;
    for (const x of excl) if (word.includes(x)) return false;
    if (pat && !pat.test(word)) return false;
    for (const r of rules) if (!matchRule(word, r)) return false;
    return true;
  });

  const sort = $("sort").value;
  if (sort === "freq") results.sort((a, b) => b.freq - a.freq || a.lower.localeCompare(b.lower, "sk"));
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
  const freqText = e.freq ? `${e.freq.toLocaleString("sk")}× v korpuse titulkov` : "v korpuse titulkov sa nevyskytuje";
  $("detail-pos").textContent = [POS_SK[e.pos] || e.pos, freqText].filter(Boolean).join(" · ");
  const body = $("detail-body");
  body.replaceChildren();
  $("detail").showModal();
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
  } else {
    const p = document.createElement("p");
    p.className = "muted";
    p.textContent = "K tomuto slovu zatiaľ nemáme výklad.";
    body.appendChild(p);
  }
  const p = document.createElement("p");
  const a = document.createElement("a");
  a.href = "https://slovnik.juls.savba.sk/?w=" + encodeURIComponent(e.w);
  a.target = "_blank";
  a.rel = "noopener";
  a.textContent = "Hľadať v slovníkoch JÚĽŠ SAV ↗";
  p.appendChild(a);
  body.appendChild(p);
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

load().catch((err) => {
  $("count").textContent = "Slovník sa nepodarilo načítať. Otvor stránku cez webový server (napr. GitHub Pages), nie ako súbor.";
  console.error(err);
});
