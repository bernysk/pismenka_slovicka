/*
 * Spoločný kód stránok Hľadač slov (index.html) a Skladanie slov (skladanie/index.html):
 * konštanty, načítanie riadku data/slova.tsv (parseLine) a okno so slovom (openDetail) – výklady, významové
 * vzťahy a tabuľky tvarov. Načítava sa pred app.js / skladanie.js ako bežný skript; jeho konštanty a funkcie
 * sú pre ne globálne.
 *
 * Stránka pred použitím nastaví:
 *   DATA_BASE   – cesta k priečinku data/ („data/“ alebo „../data/“ z podstránky)
 *   setDetailWords(zoznam) – všetky slová (kvôli preklikom na synonymá)
 * a v HTML musí mať okno <dialog id="detail"> (detail-word, detail-pos, detail-body) a prepínač #kids.
 *
 * Formát data/slova.tsv (formát 2, generuje skripty/build_web.py), stĺpce oddelené tabulátorom:
 *   0 slovo · 1 kód slovného druhu (POS_FROM_CODE) · 2 „1“ ak má výklad · 3 príznaky ·
 *   4 frekvencia SNK · 5 v knihách · 6 v hovorenej reči · 7 vo Wikipédii · 8 počet slabík
 * Príznaky: m/f/s rod (aj viac naraz), A/I životné/neživotné, P pomnožné, N nevhodné pre deti.
 */
"use strict";

let DATA_BASE = "data/";
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
const COLLATOR = new Intl.Collator("sk");  // slovenské abecedné poradie (ch za h), jeden porovnávač na všetko

const strip = (s) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");  // odstráni diakritiku

// „ch“ je v slovenčine jedno písmeno: pri porovnávaní ho nahradíme jedným znakom (súkromná oblasť Unicode),
// takže sa počíta ako jedno písmeno a „c“ ani „h“ sa s ním nezhodujú.
const CH = "\uE000";
const enc = (s) => s.replace(/ch/g, CH);

// ---------- riadok data/slova.tsv ----------
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

// ---------- zoznam slov pre okno so slovom ----------
let detailWords = [];
function setDetailWords(list) { detailWords = list; byWord = null; }

// Načíta a rozparsuje data/slova.tsv.
async function loadWords() {
  const res = await fetch(DATA_BASE + "slova.tsv");
  if (!res.ok) throw new Error(`${DATA_BASE}slova.tsv: HTTP ${res.status}`);  // inak by sa chybová stránka spracovala ako slová
  const text = await res.text();
  return text.split("\n").filter((l) => l && !l.startsWith("#")).map(parseLine);
}

// ---------- dáta po písmenách (výklady, synonymá) ----------
// Rovnaký kľúč ako skripty/spolocne.py → kluc_shardu(): prvé písmeno bez diakritiky, inak „_“.
function shardKey(w) {
  const ch = strip(w.slice(0, 1).toLowerCase());
  return ch >= "a" && ch <= "z" ? ch : "_";
}
const shardCache = new Map();  // "vyklady/p" → Promise<{slovo: …}>
let loadFailed = false;        // nastaví sa pri chybe siete; detail potom zobrazí upozornenie

// Načíta JSON; chýbajúci súbor (404) = prázdne dáta, chyba siete = prázdne dáta + upozornenie.
// Neúspešný pokus sa z cache vyhodí, aby sa pri ďalšom otvorení skúsil znova (napr. po výpadku Wi-Fi).
function fetchJson(url, cache, key, empty) {
  if (!cache.has(key)) {
    const p = fetch(url)
      .then((r) => {
        if (r.status === 404) return empty;
        if (!r.ok) throw new Error(`${url}: HTTP ${r.status}`);
        return r.json();
      })
      .catch((err) => {
        console.error(err);
        loadFailed = true;
        cache.delete(key);
        return empty;
      });
    cache.set(key, p);
  }
  return cache.get(key);
}

function loadShard(dir, w) {
  const key = `${dir}/${shardKey(w)}`;
  return fetchJson(`${DATA_BASE}${key}.json`, shardCache, key, {});
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
  loadFailed = false;
  const [defs, rels, forms] = await Promise.all([
    e.def ? loadShard("vyklady", e.w) : {}, loadShard("synonyma", e.w),
    FORM_POS.has(e.pos) ? loadForms(e.w) : null,
  ]);
  if ($("detail-word").textContent !== e.w) return;  // medzitým sa otvorilo iné slovo
  body.replaceChildren();
  if (loadFailed) {
    body.appendChild(el("p", "muted", "Časť údajov sa nepodarilo načítať (skontroluj pripojenie a otvor slovo znova)."));
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
  byWord ??= new Map(detailWords.map((x) => [x.w, x]));
  const kids = $("kids").checked;
  // položka synoným je "slovo" alebo ["slovo", "označenie"] – označenie je štylistický štítok z OpenThesaurus-SK
  const KIDS_HIDE = new Set(["vulgarizmus", "nesprávne"]);
  const parts = (item) => (Array.isArray(item) ? item : [item, ""]);
  const bare = (s) => s.replace(/\s*\(.*\)$/, "");  // staršie dáta: „fáro (hovorovo)“ → „fáro“
  const ok = (item) => {
    const [s, label] = parts(item);
    return !(kids && (KIDS_HIDE.has(label) || s.includes("vulgarizmus") || byWord.get(bare(s))?.bad));
  };
  const chipFor = (item) => {
    const [s, label] = parts(item);
    const target = byWord.get(bare(s));
    let node;
    if (target) {
      node = el("button", "rel-word link", s);
      node.type = "button";
      node.addEventListener("click", () => openDetail(target));
    } else {
      node = el("span", "rel-word", s);
    }
    if (!label) return node;
    const wrap = el("span", "rel-item" + (label === "nesprávne" ? " rel-wrong" : ""));
    wrap.append(node, " ", el("small", "rel-label", label));
    wrap.title = label === "nesprávne" ? "nesprávny alebo nespisovný tvar" : `štylistické označenie: ${label}`;
    return wrap;
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
async function loadForms(w) {
  const [tags, shard] = await Promise.all([
    fetchJson(DATA_BASE + "tvary/znacky.json", shardCache, "tvary/znacky", []),  // Promise<["N;NOM;SG", …]>
    loadShard("tvary", w),
  ]);
  const rows = shard[w];
  if (!Array.isArray(rows) || !tags.length) return null;
  const m = new Map();  // značka → [tvar, …]
  for (const row of rows) {
    if (!Array.isArray(row) || typeof row[1] !== "string" || tags[row[0]] === undefined) continue;  // poškodené dáta
    const [id, d] = row;
    const [, cut, add] = d === "=" ? [, "", ""] : d.match(/^(\d*)(.*)$/);
    if (+cut > w.length) continue;
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

// klik mimo okna so slovom ho zavrie (skript sa načítava na konci stránky, okno už existuje)
$("detail")?.addEventListener("click", (ev) => { if (ev.target === $("detail")) $("detail").close(); });
