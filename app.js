/*
 * Písmenká – hľadač slovenských slov
 *
 * Celá aplikácia beží v prehliadači. Pri štarte načíta zoznam slov (data/slova.tsv, ~1,4 MB po kompresii),
 * výklady, významové vzťahy a tvary sa načítavajú až pri otvorení slova, a to len súbor pre jeho prvé písmeno.
 *
 * Tento súbor obsahuje filtre a zoznam výsledkov. Spoločné časti – formát data/slova.tsv (parseLine),
 * konštanty a okno so slovom (openDetail) – sú v slovnik.js, ktorý sa načítava pred týmto súborom.
 */
"use strict";

const PAGE = 500;  // koľko slov sa vykreslí naraz („Zobraziť ďalšie“ pridá ďalších 500)

let words = [];   // všetky slová (pozri parseLine)
let results = [];  // slová, ktoré vyhovujú filtrom, už zoradené
let shown = 0;     // koľko z results je vykreslených

// ---------- načítanie ----------
async function load() {
  words = await loadWords();  // slovnik.js
  setDetailWords(words);
  addRule();
  run();
  // ?slovo=pes otvorí detail slova (odkazy zo stránky Skladanie slov)
  const asked = new URLSearchParams(location.search).get("slovo");
  const target = asked && words.find((e) => e.w === asked);
  if (target) openDetail(target);
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
    case "pos":  // pozícia sa počíta od 1; 0 a záporné čísla sa ignorujú (substr by inak počítal od konca)
      if (Number.isFinite(r.pos) && r.pos >= 1 && word.substring(r.pos - 1, r.pos - 1 + k) !== r.s) return false;
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
  const alpha = (a, b) => COLLATOR.compare(a.lower, b.lower);
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
  for (let i = shown; i < Math.min(results.length, shown + PAGE); i++) {
    const e = results[i];
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = e.w;
    b.dataset.i = i;  // index do results – klik rieši jeden spoločný poslucháč na #list
    if (e.def) { b.className = "has-def"; b.title = "má výklad"; }
    li.appendChild(b);
    frag.appendChild(li);
  }
  $("list").appendChild(frag);
  shown = Math.min(results.length, shown + PAGE);
  const n = results.length;
  const found = n === 1 ? "Našlo sa 1 slovo" : n < 5 ? `Našli sa ${n} slová` : `Nájdených ${n.toLocaleString("sk")} slov`;
  $("count").textContent = n === 0 ? "Žiadne slovo nevyhovuje filtrom."
    : found + (n > shown ? ` (zobrazených ${shown.toLocaleString("sk")})` : "");
  $("more").hidden = shown >= n;
}

// ---------- udalosti ----------
let timer;
const schedule = () => { clearTimeout(timer); timer = setTimeout(run, 120); };  // filtruj až po krátkej pauze v písaní
$("filters").addEventListener("input", schedule);
$("filters").addEventListener("change", schedule);
$("filters").addEventListener("submit", (ev) => ev.preventDefault());
$("add-rule").addEventListener("click", () => addRule().querySelector(".r-letter").focus());
$("more").addEventListener("click", renderMore);
$("list").addEventListener("click", (ev) => {  // jeden poslucháč namiesto 500 (results sa mení len spolu so zoznamom)
  const b = ev.target.closest("button[data-i]");
  if (b && results[+b.dataset.i]) openDetail(results[+b.dataset.i]);
});
$("clear-filters").addEventListener("click", () => {
  $("filters").reset();
  $("rules").replaceChildren();
  addRule();
  run();
});
document.querySelectorAll("[data-pos]").forEach((b) => b.addEventListener("click", () => {  // rýchle výbery druhov
  const want = new Set(b.dataset.pos.split(",").filter(Boolean));
  document.querySelectorAll('input[name="pos"]').forEach((i) => { i.checked = want.has(i.value); });
  run();
}));

load().catch((err) => {
  $("count").textContent = "Slovník sa nepodarilo načítať. Otvor stránku cez webový server (napr. GitHub Pages), nie ako súbor.";
  console.error(err);
});
