/* Req2Test Crew dashboard. Vanilla JS, no build step.
   State is driven by the server's event stream (SSE): the same code path renders a live run and a past one.
   Views are string templates morphed into the live DOM, so unchanged nodes are kept: focus, scroll and
   running animations survive repaints, and entrance animations play once, only for genuinely new elements. */
(() => {
  'use strict';

  // ------------------------------------------------------------------ utils
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${pad(Math.floor(Math.max(sec, 0) / 60))}:${pad(Math.floor(Math.max(sec, 0) % 60))}`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const criteriaWord = (n) => plural(n, 'criterion').replace('criterions', 'criteria');
  const ago = (ts) => {
    const s = Date.now() / 1000 - ts;
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)}m ago`;
    if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
    return `${Math.floor(s / 86400)}d ago`;
  };
  const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');
  const MOD = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';

  const ICONS = {
    plus: '<path d="M5 12h14M12 5v14"/>',
    history: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    copy: '<rect width="14" height="14" x="8" y="8" rx="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
    alert: '<path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3Z"/><path d="M12 9v4M12 17h.01"/>',
    file: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8"/>',
    code: '<path d="m16 18 6-6-6-6M8 6l-6 6 6 6"/>',
    list: '<path d="m3 17 2 2 4-4M3 7l2 2 4-4M13 6h8M13 12h8M13 18h8"/>',
    shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
    trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
    search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    upload: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12"/>',
    refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M21 3v5h-5M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16M8 16H3v5"/>',
    link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
    sparkles: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 15l.8 1.7 1.7.8-1.7.8L19 20l-.8-1.7-1.7-.8 1.7-.8z"/>',
    bolt: '<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>',
    globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
    layers: '<path d="m12 2 10 5-10 5L2 7z"/><path d="m2 17 10 5 10-5M2 12l10 5 10-5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    terminal: '<path d="m4 17 6-6-6-6M12 19h8"/>',
    target: '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>',
  };
  const icon = (n) => `<svg class="i" viewBox="0 0 24 24" aria-hidden="true">${ICONS[n] || ''}</svg>`;
  const BRAND = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="brandg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#a78bfa"/><stop offset=".5" stop-color="#6d8bff"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><rect width="32" height="32" rx="9" fill="url(#brandg)"/><path class="tick" d="M9 16.5l4.5 4.5L23 11" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

  const AGENTS = [
    { id: 'analyst', name: 'Requirements Analyst', short: 'Analyst', job: 'Extracts testable acceptance criteria', ico: 'file', color: '#a78bfa' },
    { id: 'designer', name: 'Test Designer', short: 'Designer', job: 'Designs positive, negative and edge cases', ico: 'list', color: '#6d8bff' },
    { id: 'writer', name: 'Script Writer', short: 'Writer', job: 'Writes Playwright TypeScript', ico: 'code', color: '#22d3ee' },
    { id: 'reviewer', name: 'Reviewer', short: 'Reviewer', job: 'Finds gaps, duplicates and weak assertions', ico: 'shield', color: '#34d399' },
  ];
  const AGENT = Object.fromEntries(AGENTS.map((a) => [a.id, a]));

  async function api(path, opts) {
    const res = await fetch(path, opts);
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try { const j = await res.json(); msg = typeof j.detail === 'string' ? j.detail : (j.detail?.[0]?.msg || msg); } catch (_) { /* keep default */ }
      throw new Error(msg);
    }
    return res.status === 204 ? null : res.json();
  }

  // ------------------------------------------------------------------ state
  const S = {
    config: { mode: 'demo', jira: false },
    samples: [],
    runs: [],
    draft: { story: '', base_url: 'http://localhost:3000', source: 'paste', jiraKey: '', depth: 'standard', types: { positive: true, negative: true, edge: true }, gherkin: true },
    draftError: '',
    busy: false,
    run: null,
    tab: 'reqs',
    userTab: false,
    followLive: false,
    filters: { q: '', type: 'all' },
    fileIdx: 0,
    drawerTc: null,
    consoleOpen: null, // null = auto (open while running)
    menuOpen: false,
    palette: { open: false, q: '', idx: 0, focus: false },
    celebrate: false,
    es: null,
    route: { name: 'new' },
  };

  function newRun(meta) {
    return {
      id: meta.id, title: meta.title, status: meta.status, mode: meta.mode, t0: meta.created_at, t1: meta.finished_at,
      story: meta.story, base_url: meta.base_url, error: meta.error, lastEvent: -1,
      agents: Object.fromEntries(AGENTS.map((a) => [a.id, { status: 'idle', summary: null, duration: null, last: '' }])),
      logs: [], feature: '', criteria: [], tests: [], files: [], review: null, validation: null, reviewed: false,
    };
  }

  // ---------------------------------------------------------------- routing
  function parseRoute() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'runs') return { name: 'history' };
    const m = h.match(/^runs\/([a-f0-9]+)$/);
    if (m) return { name: 'run', id: m[1] };
    return { name: 'new' };
  }
  function go(hash) { if (location.hash === hash) onRoute(); else location.hash = hash; }

  async function onRoute() {
    S.route = parseRoute();
    S.drawerTc = null; S.menuOpen = false; S.palette.open = false;
    closeStream();
    window.scrollTo({ top: 0, behavior: REDUCE.matches ? 'auto' : 'smooth' });
    if (S.route.name === 'run') await openRun(S.route.id);
    else { S.run = null; if (S.route.name === 'history') await refreshRuns(); paint(); }
  }

  // ---------------------------------------------------------------- run I/O
  async function refreshRuns() { try { S.runs = await api('/api/runs'); } catch (_) { /* list just stays empty */ } }

  async function openRun(id) {
    S.run = null; S.userTab = false; S.fileIdx = 0; S.consoleOpen = null; S.filters = { q: '', type: 'all' };
    paint();
    let meta;
    try { meta = await api(`/api/runs/${id}`); } catch (e) { S.run = { missing: true, id, message: e.message }; paint(); return; }
    S.run = newRun(meta);
    S.followLive = !['completed', 'failed'].includes(meta.status);
    S.tab = S.followLive ? 'reqs' : 'tests';
    paint();
    connect(id, null);
  }

  function closeStream() { if (S.es) { S.es.close(); S.es = null; } }

  function connect(id, from) {
    const es = new EventSource(`/api/runs/${id}/events${from != null ? `?from=${from}` : ''}`);
    S.es = es;
    ['run_started', 'agent_started', 'agent_log', 'agent_completed', 'validation_result', 'run_completed', 'run_failed']
      .forEach((t) => es.addEventListener(t, (e) => onEvent(JSON.parse(e.data))));
    es.onerror = () => {
      es.close();
      if (S.es !== es) return;
      S.es = null;
      const r = S.run;
      if (r && r.id === id && !['completed', 'failed'].includes(r.status)) {
        setTimeout(() => { if (S.run && S.run.id === id && !S.es) connect(id, S.run.lastEvent); }, 1200);
      }
    };
  }

  function onEvent(ev) {
    const r = S.run;
    if (!r || ev.id <= r.lastEvent) return;
    r.lastEvent = ev.id;
    const a = ev.agent && r.agents[ev.agent];
    switch (ev.type) {
      case 'run_started': r.status = 'running'; break;
      case 'agent_started': if (a) a.status = 'active'; break;
      case 'agent_log':
        r.logs.push({ t: ev.timestamp - r.t0, agent: ev.agent, msg: ev.data.message });
        if (a) a.last = ev.data.message;
        break;
      case 'agent_completed': {
        if (a) { a.status = 'done'; a.summary = ev.data.summary; a.duration = ev.data.duration; }
        const o = ev.data.output || {};
        if (ev.agent === 'analyst') { r.feature = o.feature_name || ''; r.criteria = o.criteria || []; }
        if (ev.agent === 'designer') r.tests = o.test_cases || [];
        if (ev.agent === 'writer') r.files = o.files || [];
        if (ev.agent === 'reviewer') { r.review = o.report; r.tests = o.test_cases || r.tests; r.files = o.files || r.files; r.reviewed = true; }
        if (S.followLive && !S.userTab) S.tab = { analyst: 'reqs', designer: 'tests', writer: 'code', reviewer: 'review' }[ev.agent];
        break;
      }
      case 'validation_result': r.validation = ev.data; break;
      case 'run_completed':
        r.status = 'completed'; r.t1 = ev.timestamp;
        if (S.followLive) S.celebrate = true;
        refreshRuns().then(paint);
        break;
      case 'run_failed':
        r.status = 'failed'; r.error = ev.data.message; r.t1 = ev.timestamp;
        Object.values(r.agents).forEach((x) => { if (x.status === 'active') x.status = 'failed'; });
        r.logs.push({ t: ev.timestamp - r.t0, agent: null, msg: ev.data.message, err: true });
        refreshRuns().then(paint);
        break;
    }
    schedulePaint();
  }

  async function submitRun() {
    const d = S.draft;
    const types = Object.keys(d.types).filter((k) => d.types[k]);
    if (d.story.trim().length < 20) { S.draftError = 'Add a requirement of at least 20 characters, or pick a sample.'; paint(); return; }
    if (!types.length) { S.draftError = 'Select at least one test type.'; paint(); return; }
    S.draftError = ''; S.busy = true; paint();
    try {
      const { run_id } = await api('/api/runs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ story: d.story, base_url: d.base_url || 'http://localhost:3000', options: { depth: d.depth, types, gherkin: d.gherkin } }),
      });
      await refreshRuns();
      S.busy = false;
      go(`#/runs/${run_id}`);
    } catch (e) { S.busy = false; S.draftError = e.message; paint(); }
  }

  function loadSample(id) {
    const s = S.samples.find((x) => x.id === id);
    if (!s) return;
    Object.assign(S.draft, { story: s.story, base_url: s.base_url, source: 'paste' });
    S.draftError = ''; S.palette.open = false;
    if (S.route.name !== 'new') { go('#/new'); setTimeout(() => typeInto(s.story), 120); return; }
    paint();
    typeInto(s.story);
    toast(`Loaded sample: ${s.title}`);
  }

  // Fills the textarea with a quick typewriter pass. The full text is already in state, so a repaint mid-way just completes it.
  function typeInto(text) {
    const t = $('#story');
    if (!t) return;
    t.scrollIntoView({ behavior: REDUCE.matches ? 'auto' : 'smooth', block: 'center' });
    if (REDUCE.matches) { t.value = text; return; }
    const total = text.length; const t0 = performance.now(); const dur = Math.min(1000, 250 + total * 1.2);
    const step = (now) => {
      if ($('#story') !== t) return;
      const p = Math.min(1, (now - t0) / dur);
      t.value = text.slice(0, Math.round(total * (1 - Math.pow(1 - p, 2))));
      t.scrollTop = t.scrollHeight;
      if (p < 1) requestAnimationFrame(step);
      else { t.scrollTop = 0; t.focus({ preventScroll: true }); updateWordCount(); }
    };
    requestAnimationFrame(step);
  }

  // ------------------------------------------------------------------ morph
  function morph(root, html) {
    const tpl = document.createElement('template');
    tpl.innerHTML = html;
    syncChildren(root, tpl.content);
  }
  const keyOf = (n) => (n.nodeType === 1 ? n.getAttribute('data-key') : null);
  function syncChildren(a, b) {
    const next = [...b.childNodes];
    for (let i = 0; i < next.length; i++) {
      const bn = next[i];
      let an = a.childNodes[i];
      const k = keyOf(bn);
      if (k && (!an || keyOf(an) !== k)) {
        const match = [...a.children].find((c) => keyOf(c) === k);
        if (match) { a.insertBefore(match, an || null); an = match; }
      }
      if (!an) { a.appendChild(bn); continue; }
      if (an.nodeType === bn.nodeType && an.nodeName === bn.nodeName && keyOf(an) === k) patch(an, bn);
      else a.replaceChild(bn, an);
    }
    while (a.childNodes.length > next.length) a.removeChild(a.lastChild);
  }
  function patch(a, b) {
    if (a.nodeType !== 1) { if (a.nodeValue !== b.nodeValue) a.nodeValue = b.nodeValue; return; }
    const live = a.hasAttribute('data-live'); // style is owned by JS (spotlight, indicators)
    const sameCount = a.getAttribute('data-count') === b.getAttribute('data-count');
    for (const { name } of [...a.attributes]) if (!b.hasAttribute(name) && !(live && name === 'style')) a.removeAttribute(name);
    for (const { name, value } of [...b.attributes]) if (!(live && name === 'style') && a.getAttribute(name) !== value) a.setAttribute(name, value);
    if (a.tagName === 'INPUT') {
      if (a.type === 'checkbox') a.checked = b.hasAttribute('checked');
      else { const v = b.getAttribute('value') ?? ''; if (a.value !== v) a.value = v; }
      return;
    }
    if (a.tagName === 'TEXTAREA') { const v = b.textContent; if (a.value !== v) a.value = v; return; }
    if (a.hasAttribute('data-count') && sameCount) return; // a count-up is driving the text
    syncChildren(a, b);
  }

  // -------------------------------------------------------------- rendering
  let paintQueued = false;
  function schedulePaint() { if (paintQueued) return; paintQueued = true; requestAnimationFrame(() => { paintQueued = false; paint(); }); }

  function paint() {
    morph($('#dock'), viewDock());
    morph($('#page'), viewPage());
    morph($('#overlay'), viewDrawer() + viewPalette());
    afterPaint();
  }

  let logCount = -1;
  function afterPaint() {
    const con = $('.console');
    if (con && con.childElementCount !== logCount) { con.scrollTop = con.scrollHeight; logCount = con.childElementCount; }
    slideIndicators();
    runCounters();
    if (S.palette.open) {
      if (S.palette.focus) { $('#pal')?.focus(); S.palette.focus = false; }
      $('.pi[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }
    if (S.celebrate) { S.celebrate = false; confetti(); const c = S.run?.review?.coverage_percent; toast(c != null ? `Run complete: ${c}% requirement coverage` : 'Run complete'); }
  }

  // Sliding pill behind the selected item of any [data-ind] group.
  const placed = new WeakSet();
  function slideIndicators() {
    $$('[data-ind]').forEach((wrap) => {
      const ind = wrap.querySelector(':scope > .ind');
      if (!ind) return;
      const cur = wrap.querySelector(':scope > [aria-current="page"], :scope > [aria-selected="true"], :scope > [aria-pressed="true"]');
      if (!cur || !cur.offsetWidth) { ind.style.opacity = '0'; return; }
      const first = !placed.has(ind);
      if (first) ind.style.transition = 'none';
      ind.style.opacity = '1';
      ind.style.width = `${cur.offsetWidth}px`;
      ind.style.transform = `translateX(${cur.offsetLeft}px)`;
      if (first) { void ind.offsetWidth; ind.style.transition = ''; placed.add(ind); }
    });
  }

  // Numbers that roll up to their value when they first appear or change.
  const shown = new WeakMap();
  function runCounters() {
    $$('[data-count]').forEach((el) => {
      const to = Number(el.dataset.count);
      if (shown.get(el) === to) return;
      const from = shown.has(el) ? shown.get(el) : 0;
      shown.set(el, to);
      const suf = el.dataset.suffix || '';
      const dp = (el.dataset.count.split('.')[1] || '').length;
      if (REDUCE.matches || from === to) { el.textContent = to + suf; return; }
      const t0 = performance.now(); const dur = 1200;
      const step = (now) => {
        if (shown.get(el) !== to) return;
        const p = Math.min(1, (now - t0) / dur);
        el.textContent = p < 1 ? (from + (to - from) * (1 - Math.pow(1 - p, 4))).toFixed(dp) + suf : el.dataset.count + suf;
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    });
  }

  const dotCls = (status) => (status === 'completed' ? 'ok' : status === 'failed' ? 'bad' : 'run');

  // --- dock (replaces the old sidebar)
  function viewDock() {
    const cur = S.route; const demo = S.config.mode === 'demo'; const r = S.run;
    const runLink = cur.name === 'run' && r && !r.missing
      ? `<a class="runlink" href="#/runs/${r.id}" aria-current="page"><span class="dot ${dotCls(r.status)}"></span><span class="t">${esc(r.title)}</span></a>` : '';
    return `<div class="dock-in">
      <a class="brand" href="#/new" aria-label="Req2Test Crew, new run">${BRAND}<span>Req2Test<em>Crew</em></span></a>
      <nav class="pill-nav" aria-label="Main" data-ind><span class="ind" data-live></span>
        <a href="#/new" ${cur.name === 'new' ? 'aria-current="page"' : ''}>${icon('plus')}<span class="t">New run</span></a>
        <a href="#/runs" ${cur.name === 'history' ? 'aria-current="page"' : ''}>${icon('history')}<span class="t">History</span>${S.runs.length ? `<span class="count">${S.runs.length}</span>` : ''}</a>
        ${runLink}
      </nav>
      <div class="dock-r">
        <button class="kbtn" data-act="palette" aria-label="Open command palette">${icon('search')}<span class="lbl">Jump to</span><kbd>${MOD} K</kbd></button>
        <span class="mode-pill ${demo ? 'demo' : 'live'}" title="${demo ? 'Prepared sample outputs, no API key needed' : 'CrewAI agents calling your model'}"><i></i><span class="lbl">${demo ? 'Demo mode' : `Live &middot; ${esc(S.config.model || 'LLM')}`}</span></span>
      </div>
    </div>`;
  }

  function viewPage() {
    switch (S.route.name) {
      case 'history': return viewHistory();
      case 'run': return viewRun();
      default: return viewNew();
    }
  }

  // --- new run
  function viewNew() {
    const d = S.draft;
    const demo = S.config.mode === 'demo';
    const words = d.story.trim() ? d.story.trim().split(/\s+/).length : 0;
    const srcTab = (id, label, ico) => `<button class="stab" role="tab" data-act="src" data-v="${id}" aria-selected="${d.source === id}">${icon(ico)}${label}</button>`;
    let panel;
    if (d.source === 'upload') {
      panel = `<label class="dropzone" id="drop" for="filein"><span class="dz-ico">${icon('upload')}</span><strong>Drop a .txt or .md file here</strong><span class="hint">or click to choose a file (max 200 KB). PDF and Word are not supported yet.</span></label>
        <input id="filein" type="file" accept=".txt,.md,text/plain,text/markdown" class="sr-only">`;
    } else if (d.source === 'jira') {
      panel = S.config.jira
        ? `<div class="field"><label for="jirakey">Issue key</label><div class="row-gap"><div class="inp">${icon('link')}<input id="jirakey" type="text" data-bind="jiraKey" value="${esc(d.jiraKey)}" placeholder="PROJ-123" autocomplete="off"></div><button class="btn" data-act="jira">Import</button></div><p class="hint">Reads the issue summary and description from Jira Cloud.</p></div>`
        : `<div class="banner warn">${icon('alert')}<div><strong>Jira is not connected.</strong><br>Set JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN in backend/.env and restart the server.</div></div>`;
    } else {
      panel = `<textarea id="story" data-bind="story" aria-label="User story or PRD" placeholder="As a registered user, I want to log in with my email and password so that I can see my dashboard.&#10;&#10;Rules: lock the account after 5 failed attempts, show an inline error for a wrong password...">${esc(d.story)}</textarea>
        <div class="editor-f"><span id="wc">${plural(words, 'word')}</span><span>Include rules, limits and error behaviour for sharper tests</span></div>`;
    }
    const samples = S.samples.map((s, i) => `<button class="sample spot rise" data-live data-act="sample" data-id="${s.id}" style="--d:${620 + i * 90}"><span class="n">0${i + 1}</span><span class="t">${esc(s.title)}</span><span class="b">${esc(s.blurb)}</span><span class="go">${icon('arrow')}</span></button>`).join('');
    const typeChip = (k, label) => `<button class="tchip ${k}" data-act="type" data-v="${k}" aria-pressed="${d.types[k]}"><span class="box">${icon('check')}</span>${label}</button>`;
    const crew = AGENTS.map((a, i) => `${i ? `<span class="cf-link" style="--i:${i - 1}"><i></i></span>` : ''}<div class="cf-node" style="--ac:${a.color};--i:${i}"><span class="cf-ico">${icon(a.ico)}</span><span><b>${a.name}</b><small>${a.job}</small></span></div>`).join('');
    return `<div class="view" data-key="v-new">
      <section class="hero">
        <div class="eyebrow-chip rise" style="--d:0"><span class="tag">New</span><b>Four AI agents</b><span>&middot; Playwright &middot; TypeScript</span></div>
        <h1 class="display">
          <span class="w"><span style="--d:80">Requirements</span></span> <span class="w"><span style="--d:170">in.</span></span><br>
          <span class="w"><span class="grad" style="--d:300">Reviewed</span></span> <span class="w"><span class="grad serif" style="--d:390">tests</span></span> <span class="w"><span class="grad" style="--d:480">out.</span></span>
        </h1>
        <p class="lede rise" style="--d:560">Paste a user story or PRD. A crew of four agents extracts the criteria, designs the cases, writes Playwright code and reviews its own work, live in front of you.</p>
        <div class="crewflow rise" style="--d:680">${crew}</div>
        ${demo ? `<div class="note rise" style="--d:780">${icon('sparkles')}<span><b>Demo mode.</b> Runs replay prepared outputs for the closest sample. Set <code>MOCK_MODE=false</code> and <code>GROQ_API_KEY</code> for live generation.</span></div>` : ''}
      </section>

      <div class="composer">
        <div class="col">
          <section class="card editor rise" aria-label="Requirement" style="--d:420">
            <span class="edge-glow" aria-hidden="true"></span>
            <div class="editor-h">
              <div class="stabs" role="tablist" data-ind><span class="ind" data-live></span>${srcTab('paste', 'Paste text', 'file')}${srcTab('upload', 'Upload file', 'upload')}${srcTab('jira', 'Import from Jira', 'link')}</div>
              <span class="hint mono">requirement.md</span>
            </div>
            <div class="editor-b" data-key="src-${d.source}">${panel}</div>
          </section>
          <div class="label-row rise" style="--d:560"><h2>Or start from a sample</h2><span class="hint">Prepared stories with rules and edge cases</span></div>
          <div class="samples">${samples}</div>
        </div>

        <aside class="card settings spot rise" data-live aria-label="Run settings" style="--d:500">
          <div class="set-h"><h2>Run settings</h2><span class="hint">Tune the crew</span></div>
          <div class="field"><label for="baseurl">Application URL</label><div class="inp">${icon('globe')}<input id="baseurl" type="url" data-bind="base_url" value="${esc(d.base_url)}" placeholder="http://localhost:3000"></div><span class="hint">Becomes <code>baseURL</code> in playwright.config.ts</span></div>
          <div class="field"><span class="label">Coverage depth</span><div class="seg" role="group" aria-label="Coverage depth" data-ind><span class="ind" data-live></span><button data-act="depth" data-v="standard" aria-pressed="${d.depth === 'standard'}">Standard</button><button data-act="depth" data-v="thorough" aria-pressed="${d.depth === 'thorough'}">Thorough</button></div></div>
          <div class="field"><span class="label">Test types</span><div class="tchips">${typeChip('positive', 'Positive')}${typeChip('negative', 'Negative')}${typeChip('edge', 'Edge')}</div></div>
          <button class="switch-row" role="switch" aria-checked="${d.gherkin}" data-act="gherkin"><span><b>Gherkin feature file</b><span class="hint">Include a .feature file in the export</span></span><span class="switch"></span></button>
          <div class="divider"></div>
          ${S.draftError ? `<div class="banner error" role="alert">${icon('alert')}<div>${esc(S.draftError)}</div></div>` : ''}
          <button class="cta" data-act="submit" ${S.busy ? 'disabled' : ''}>${S.busy ? '<span class="spinner"></span>Starting the crew' : `${icon('sparkles')}Generate tests`}<span class="kbd">${MOD} Enter</span></button>
          <p class="hint center">Four agents &middot; usually under a minute</p>
        </aside>
      </div>
    </div>`;
  }

  // --- history
  function viewHistory() {
    const runs = S.runs;
    if (!runs.length) {
      return `<div class="view" data-key="v-history-empty"><div class="card empty big rise"><span class="empty-art">${icon('history')}</span><h2>No runs yet</h2><p>Your generated test suites will collect here.</p><a class="btn primary" href="#/new">${icon('plus')}Start your first run</a></div></div>`;
    }
    const covs = runs.map((r) => r.coverage).filter((x) => x != null);
    const avg = covs.length ? Math.round(covs.reduce((a, b) => a + b, 0) / covs.length) : null;
    const tests = runs.reduce((a, r) => a + (r.test_cases || 0), 0);
    const stat = (val, label, ico, d, suffix = '') => `<div class="stat spot rise" data-live style="--d:${d}"><span class="k-ico">${icon(ico)}</span><b>${val == null ? '&mdash;' : `<span data-count="${val}" data-suffix="${suffix}">${val}${suffix}</span>`}</b><span>${label}</span></div>`;
    const rows = runs.map((r, i) => {
      const cov = r.coverage;
      return `<div class="hrow spot rise" data-live data-key="h-${r.id}" data-href="#/runs/${r.id}" style="--d:${Math.min(i, 12) * 45 + 260}">
        <span class="orb-s ${r.status}" title="${esc(r.status)}"></span>
        <div class="ht"><a href="#/runs/${r.id}">${esc(r.title)}</a><span>${ago(r.created_at)} &middot; ${esc(r.mode || '')} mode &middot; <span class="mono">${r.id}</span></span></div>
        <div class="hm"><b>${r.criteria || '&mdash;'}</b><span>criteria</span></div>
        <div class="hm"><b>${r.test_cases || '&mdash;'}</b><span>tests</span></div>
        <div class="hcov">${cov == null ? `<span class="hint">${r.status === 'running' || r.status === 'queued' ? '<span class="spinner"></span> running' : 'no coverage'}</span>` : `<div class="track"><i style="width:${cov}%"></i></div><span>${cov}%</span>`}</div>
        <button class="btn ghost icon del danger" data-act="del" data-id="${r.id}" aria-label="Delete run">${icon('trash')}</button>
      </div>`;
    }).join('');
    return `<div class="view" data-key="v-history">
      <header class="page-hero rise"><div><div class="eyebrow">${icon('layers')}Archive</div><h1>Run history</h1><p>${plural(runs.length, 'run')} saved on this machine. Click one to replay it.</p></div>
        <a class="btn primary" href="#/new">${icon('plus')}New run</a></header>
      <div class="stats">${stat(runs.length, 'Runs', 'history', 80)}${stat(tests, 'Test cases generated', 'list', 140)}${stat(avg, 'Average coverage', 'target', 200, '%')}</div>
      <div class="hlist">${rows}</div>
    </div>`;
  }

  // --- run view
  function elapsed(r) { return clock((r.t1 || Date.now() / 1000) - r.t0); }

  function viewRun() {
    const r = S.run;
    if (!r) {
      return `<div class="view" data-key="v-loading"><div class="card loading rise"><div class="skel" style="width:30%"></div><div class="skel" style="width:60%;height:28px"></div><div class="skel" style="width:45%"></div></div></div>`;
    }
    if (r.missing) {
      return `<div class="view" data-key="v-missing"><div class="card empty big rise"><span class="empty-art">${icon('alert')}</span><h2>Run not found</h2><p>${esc(r.message || '')}</p><a class="btn primary" href="#/new">${icon('plus')}Start a new run</a></div></div>`;
    }
    const running = r.status === 'running' || r.status === 'queued';
    const done = r.status === 'completed';
    const consoleOpen = S.consoleOpen == null ? running : S.consoleOpen;
    const st = AGENTS.map((a) => r.agents[a.id].status);
    const nDone = st.filter((x) => x === 'done').length;
    const progress = done ? 100 : Math.round(((nDone + (st.includes('active') ? 0.5 : 0)) / AGENTS.length) * 100);

    const flow = AGENTS.map((a, i) => {
      let beam = '';
      if (i) {
        const prev = st[i - 1]; const cur = st[i];
        const cls = prev !== 'done' ? '' : cur === 'active' ? 'live' : 'on';
        beam = `<div class="beam ${cls}" style="--a:${AGENTS[i - 1].color};--b:${a.color}"><i></i></div>`;
      }
      return beam + viewStage(a, r.agents[a.id], i);
    }).join('');

    const logs = r.logs.map((l) => {
      const ag = l.agent && AGENT[l.agent];
      return `<div class="ln ${l.err ? 'err' : ''}" ${ag ? `style="--ac:${ag.color}"` : ''}><span class="ts">${clock(l.t)}</span><span class="ag">${ag ? ag.short : 'system'}</span><span>${esc(l.msg)}</span></div>`;
    }).join('') || '<div class="ln"><span class="ts">00:00</span><span class="ag">system</span><span class="ts">Waiting for the first event<span class="caret"></span></span></div>';
    const statusLabel = { queued: 'Queued', running: 'Running', completed: 'Completed', failed: 'Failed' }[r.status];

    return `<div class="view" data-key="run-${r.id}">
      <header class="run-head rise">
        <div class="rh-l">
          <div class="crumb"><a href="#/runs">History</a>${icon('chevron')}<span class="mono">run ${r.id}</span></div>
          <h1>${esc(r.title)}</h1>
          <div class="meta"><span class="chip-m">${icon(r.mode === 'demo' ? 'sparkles' : 'bolt')}${r.mode === 'demo' ? 'Demo' : 'Live'} mode</span><span class="chip-m">${icon('globe')}${esc(r.base_url)}</span>${r.feature ? `<span class="chip-m">${icon('layers')}${esc(r.feature)}</span>` : ''}</div>
        </div>
        <div class="rh-r">
          <span class="status-pill ${r.status}"><i></i>${statusLabel}<span id="elapsed" class="mono">${elapsed(r)}</span></span>
          ${done ? `<button class="btn" data-act="rerun">${icon('refresh')}Edit and re-run</button>` : ''}
          <div class="menu">
            <button class="btn primary" data-act="menu" ${done ? '' : 'disabled'} aria-haspopup="true" aria-expanded="${S.menuOpen}">${icon('download')}Export${icon('chevron')}</button>
            ${S.menuOpen && done ? exportMenu(r) : ''}
          </div>
        </div>
      </header>
      ${r.status === 'failed' ? `<div class="banner error" role="alert">${icon('alert')}<div><strong>This run stopped.</strong> ${esc(r.error || 'Unknown error')}<br><button class="btn" style="margin-top:10px" data-act="rerun">${icon('refresh')}Edit and retry</button></div></div>` : ''}

      <section class="card pipe rise" aria-label="Pipeline" style="--d:90">
        <div class="pipe-h">
          <div><h2>Agent pipeline</h2><p class="hint">${done ? 'All four agents finished.' : running ? 'Agents are handing work down the line.' : 'The crew stopped before finishing.'}</p></div>
          <div class="overall"><div class="track"><i style="width:${progress}%"></i></div><span>${progress}%</span></div>
          <button class="btn ghost" data-act="console" aria-expanded="${consoleOpen}">${icon('terminal')}${consoleOpen ? 'Hide' : 'Show'} log</button>
        </div>
        <div class="flow">${flow}</div>
        <div class="term ${consoleOpen ? '' : 'collapsed'}">
          <div class="term-h"><span class="dots"><i></i><i></i><i></i></span><span>activity.log</span>${running ? '<span class="live"><span class="dot run"></span>streaming</span>' : `<span class="live idle">${plural(r.logs.length, 'event')}</span>`}</div>
          <div class="console" role="log" aria-live="off">${logs}</div>
        </div>
      </section>
      ${viewKpis(r)}
      <section class="card results rise" aria-label="Results" style="--d:260">${viewTabs(r)}${viewTabBody(r)}</section>
    </div>`;
  }

  function viewStage(a, st, i) {
    let metric = '';
    if (st.summary) {
      const s = st.summary;
      metric = { analyst: `${criteriaWord(s.criteria)} &middot; ${s.ambiguities} open`, designer: plural(s.test_cases, 'test case'), writer: `${plural(s.files, 'file')} &middot; ${plural(s.tests, 'test')}`, reviewer: `${s.coverage}% coverage` }[a.id];
    } else metric = { idle: 'Waiting', active: 'Working', failed: 'Stopped', done: '' }[st.status];
    const job = st.status === 'active' && st.last ? st.last : a.job;
    const tick = st.status === 'done' ? icon('check') : st.status === 'failed' ? icon('x') : '';
    return `<div class="stage ${st.status}" style="--ac:${a.color}">
      <span class="sweep" aria-hidden="true"></span>
      <div class="orb"><span class="halo"></span>${icon(a.ico)}<span class="tick">${tick}</span></div>
      <div class="step">STEP 0${i + 1}</div>
      <div class="name">${a.name}</div>
      <div class="job">${esc(job)}${st.status === 'active' ? '<span class="caret"></span>' : ''}</div>
      <div class="metric">${metric}${st.duration != null ? `<span class="dur">${st.duration}s</span>` : ''}</div>
    </div>`;
  }

  function exportMenu(r) {
    const item = (fmt, ext, t, d) => `<a href="/api/runs/${r.id}/download?format=${fmt}" download><span class="ext">${ext}</span><span>${t}<small>${d}</small></span></a>`;
    return `<div class="pop" role="menu">
      ${item('zip', 'ZIP', 'Playwright project', 'Tests, page objects, config, Gherkin and CSV')}
      ${item('gherkin', 'FEAT', 'Gherkin feature', 'One scenario per test case, tagged by criterion')}
      ${item('csv', 'CSV', 'Test cases', 'For TestRail, Qase, Xray or a spreadsheet')}
      ${item('json', 'JSON', 'Full result', 'Criteria, test cases, code, review')}
    </div>`;
  }

  function viewKpis(r) {
    const tile = (val, label, ico, color, d, cls = '', suffix = '') => `<div class="kpi spot rise ${cls}" data-live style="--d:${d};--kc:${color}"><span class="k-ico">${icon(ico)}</span><div class="v">${val == null ? '<span class="dim">&mdash;</span>' : `<span data-count="${val}" data-suffix="${suffix}">${val}${suffix}</span>`}</div><div class="l">${label}</div></div>`;
    const cov = r.review ? r.review.coverage_percent : null;
    let checks = null; let total = 0; let checkCls = '';
    if (r.validation) { const c = r.validation.static_checks; checks = c.filter((x) => x.passed).length; total = c.length; checkCls = checks === total ? 'good' : 'bad'; }
    return `<div class="kpis">
      ${tile(r.criteria.length || null, 'Acceptance criteria', 'file', '#a78bfa', 140)}
      ${tile(r.tests.length || null, 'Test cases', 'list', '#6d8bff', 180)}
      ${tile(r.files.length || null, 'Generated files', 'code', '#22d3ee', 220)}
      ${tile(cov, 'Requirement coverage', 'target', '#34d399', 260, cov == null ? '' : cov >= 90 ? 'good' : cov >= 70 ? 'warn' : 'bad', '%')}
      ${tile(checks, 'Code checks passed', 'shield', '#fbbf24', 300, checkCls, checks == null ? '' : `/${total}`)}
    </div>`;
  }

  function tabAvail(r) { return { reqs: r.criteria.length > 0, tests: r.tests.length > 0, trace: r.tests.length > 0, code: r.files.length > 0, review: r.reviewed }; }

  function viewTabs(r) {
    const av = tabAvail(r);
    const t = (id, label, ico, count) => `<button class="rtab" role="tab" data-act="tab" data-v="${id}" aria-selected="${S.tab === id}" ${av[id] ? '' : 'disabled'}>${icon(ico)}${label}${count ? `<span class="count">${count}</span>` : ''}</button>`;
    return `<div class="rtabs" role="tablist" data-ind><span class="ind" data-live></span>${t('reqs', 'Requirements', 'file', r.criteria.length)}${t('tests', 'Test cases', 'list', r.tests.length)}${t('trace', 'Traceability', 'grid')}${t('code', 'Playwright code', 'code', r.files.length)}${t('review', 'Review', 'shield')}</div>`;
  }

  function viewTabBody(r) {
    const av = tabAvail(r);
    if (!av[S.tab]) {
      const failed = r.status === 'failed';
      return `<div class="tbody" data-key="tb-${S.tab}-wait"><div class="empty">${failed ? `<span class="empty-art">${icon('x')}</span>This step did not finish.` : `<span class="empty-art thinking">${icon('sparkles')}</span>This view fills in as the agents finish their work.`}</div></div>`;
    }
    const body = { reqs: tabReqs, tests: tabTests, trace: tabTrace, code: tabCode, review: tabReview }[S.tab](r);
    return `<div class="tbody" data-key="tb-${S.tab}">${body}</div>`;
  }

  const countFor = (r, acId) => r.tests.filter((t) => t.criterion_id === acId).length;

  function tabReqs(r) {
    const hasTests = r.tests.length > 0;
    const open = r.criteria.filter((c) => c.ambiguity_note).length;
    const rows = r.criteria.map((c, i) => {
      const n = countFor(r, c.id);
      return `<div class="req" data-key="ac-${esc(c.id)}" style="--i:${Math.min(i, 16)}"><span class="id">${esc(c.id)}</span><div><div>${esc(c.text)}</div>${c.ambiguity_note ? `<div class="q">${icon('alert')}<div><strong>Open question.</strong> ${esc(c.ambiguity_note)}</div></div>` : ''}</div>
        <div>${hasTests ? (n ? `<span class="badge neutral">${plural(n, 'test')}</span>` : '<span class="badge negative">No tests</span>') : ''}</div></div>`;
    }).join('');
    return `<div class="toolbar"><span class="hint">${criteriaWord(r.criteria.length)} extracted${open ? `, <strong class="warn-t">${plural(open, 'open question')}</strong> to confirm with the product owner` : ''}.</span></div><div class="reqs">${rows}</div>`;
  }

  function tabTests(r) {
    const q = S.filters.q.trim().toLowerCase();
    const counts = { all: r.tests.length, positive: 0, negative: 0, edge: 0 };
    r.tests.forEach((t) => { counts[t.type]++; });
    const list = r.tests.filter((t) => (S.filters.type === 'all' || t.type === S.filters.type) && (!q || `${t.id} ${t.title} ${t.criterion_id}`.toLowerCase().includes(q)));
    const chip = (k, label) => `<button class="chip ${k}" data-act="ftype" data-v="${k}" aria-pressed="${S.filters.type === k}">${label}<span>${counts[k]}</span></button>`;
    const rows = list.map((t, i) => `<tr class="row" data-key="tc-${esc(t.id)}" data-act="tc" data-id="${esc(t.id)}" tabindex="0" style="--i:${Math.min(i, 20)}"><td class="id">${esc(t.id)}</td><td>${esc(t.title)}</td><td><span class="badge ${t.type}">${t.type}</span></td><td><span class="badge ${(t.priority || 'P1').toLowerCase()}">${esc(t.priority || 'P1')}</span></td><td class="id">${esc(t.criterion_id)}</td><td class="go">${icon('arrow')}</td></tr>`).join('');
    return `<div class="toolbar"><div class="search">${icon('search')}<input id="q" type="text" data-bind="q" value="${esc(S.filters.q)}" placeholder="Search tests (press /)" aria-label="Search test cases"></div>
      <div class="chips">${chip('all', 'All')}${chip('positive', 'Positive')}${chip('negative', 'Negative')}${chip('edge', 'Edge')}</div></div>
      <div class="tbl-wrap">${list.length ? `<table class="tbl"><thead><tr><th>ID</th><th>Title</th><th>Type</th><th>Priority</th><th>Criterion</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">No test cases match this filter.</div>'}</div>`;
  }

  function tabTrace(r) {
    const tests = [...r.tests].sort((a, b) => a.id.localeCompare(b.id));
    const head = tests.map((t) => `<th class="c"><span>${esc(t.id)}</span></th>`).join('');
    const rows = r.criteria.map((c, ri) => {
      const cells = tests.map((t, ci) => t.criterion_id === c.id ? `<td class="cell"><i class="${t.type}" style="--r:${ri + ci * 0.15}" data-act="tc" data-id="${esc(t.id)}" title="${esc(t.id)}: ${esc(t.title)}"></i></td>` : '<td class="cell"></td>').join('');
      const n = countFor(r, c.id);
      return `<tr><td class="first"><span class="mono acid">${esc(c.id)}</span> ${esc(c.text)}</td>${cells}<td class="last">${n ? plural(n, 'test') : '<span class="badge negative">No tests</span>'}</td></tr>`;
    }).join('');
    return `<div class="toolbar legend"><span>Each square is a test case verifying that requirement. Click one to open it.</span><span><i class="lg-pos"></i>Positive</span><span><i class="lg-neg"></i>Negative</span><span><i class="lg-edge"></i>Edge</span></div>
      <div class="tbl-wrap"><table class="matrix"><thead><tr><th class="first">Acceptance criterion</th>${head}<th class="last">Coverage</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  // --- code view
  const TOK = /(\/\/[^\n]*)|('(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`)|\b(import|from|export|class|const|let|var|async|await|new|return|for|if|else|readonly|constructor|type|this|of|function)\b|(\b\d+(?:\.\d+)?\b)|(\b[A-Za-z_$][\w$]*(?=\())/g;
  function hl(line) {
    let out = ''; let last = 0; let m; TOK.lastIndex = 0;
    while ((m = TOK.exec(line))) {
      out += esc(line.slice(last, m.index));
      const cls = m[1] ? 'c' : m[2] ? 's' : m[3] ? 'k' : m[4] ? 'n' : 'f';
      out += `<span class="tk-${cls}">${esc(m[0])}</span>`;
      last = TOK.lastIndex;
      if (m[0] === '') TOK.lastIndex++;
    }
    return out + esc(line.slice(last));
  }
  const codeBlock = (code) => code.replace(/\n$/, '').split('\n').map((l, i) => `<div class="l"><span class="n">${i + 1}</span><span class="t">${hl(l) || ' '}</span></div>`).join('');

  function tabCode(r) {
    const files = [...r.files].sort((a, b) => a.filename.localeCompare(b.filename));
    const idx = Math.min(S.fileIdx, files.length - 1);
    const f = files[idx];
    let strip;
    if (r.validation) {
      const c = r.validation.static_checks; const pw = r.validation.playwright;
      const pwLabel = { passed: `playwright test --list: ${pw.total ?? '?'} tests discovered`, failed: 'playwright test --list failed', skipped: 'playwright test --list skipped' }[pw.status];
      strip = `<div class="checks">${c.map((x, i) => `<span class="c ${x.passed ? 'ok' : 'no'}" style="--i:${i}" title="${esc(x.detail)}">${icon(x.passed ? 'check' : 'x')}${esc(x.name)}</span>`).join('')}<span class="c ${pw.status === 'passed' ? 'ok' : pw.status === 'failed' ? 'no' : ''}" style="--i:${c.length}" title="${esc(pw.output)}">${icon(pw.status === 'passed' ? 'check' : pw.status === 'failed' ? 'x' : 'alert')}${pwLabel}</span></div>${pw.status !== 'passed' ? `<pre class="pwbox">${esc(pw.output)}</pre>` : ''}`;
    } else {
      strip = `<div class="checks"><span class="c"><span class="spinner"></span>Draft code. Review and validation are still running.</span></div>`;
    }
    return `${strip}<div class="codeview"><div class="files" role="listbox" aria-label="Generated files">${files.map((x, i) => `<button data-act="file" data-i="${i}" aria-current="${i === idx}" title="${esc(x.filename)}">${icon('file')}<span>${esc(x.filename)}</span></button>`).join('')}</div>
      <div class="code"><div class="code-h"><span class="dots"><i></i><i></i><i></i></span><span class="fn">${esc(f.filename)}</span><button class="btn" data-act="copy" data-i="${idx}">${icon('copy')}Copy</button></div><pre data-key="f-${esc(f.filename)}"><code>${codeBlock(f.code)}</code></pre></div></div>`;
  }

  // --- review
  function tabReview(r) {
    const rv = r.review; const cov = rv.coverage_percent;
    const C = 2 * Math.PI * 70;
    const tone = cov >= 90 ? 'pos' : cov >= 70 ? 'edge' : 'neg';
    const target = C * (1 - cov / 100);
    const sec = (i, title, items, render, empty) => `<div class="sec" style="--i:${i}"><div class="sec-h"><span>${title}</span><span class="n">${items.length}</span></div>${items.length ? items.map(render).join('') : `<div class="finding ok-f">${icon('check')}<p>${empty}</p></div>`}</div>`;
    return `<div class="review"><div class="gauge ${tone}"><div class="ringwrap"><svg viewBox="0 0 170 170" aria-hidden="true"><circle class="ring-bg" cx="85" cy="85" r="70" fill="none" stroke-width="12"/><circle class="ring-fg" cx="85" cy="85" r="70" fill="none" stroke-width="12" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${target}" style="--c:${C}"/></svg><div class="num"><span data-count="${cov}" data-suffix="%">${cov}%</span><small>coverage</small></div></div>
        <div><strong>Requirement coverage</strong><p class="hint">Criteria with at least one test, recomputed from the final test list.</p></div></div>
      <div class="findings"><div class="summary">${icon('sparkles')}<p>${esc(rv.summary)}</p></div>
        ${sec(1, 'Coverage gaps', rv.gaps, (g) => `<div class="finding"><div class="h"><span class="badge negative">${esc(g.criterion_id)}</span>${esc(g.issue)}</div><p class="fix"><strong>Suggestion.</strong> ${esc(g.suggestion)}</p></div>`, 'Every criterion has at least one test.')}
        ${sec(2, 'Duplicates removed', rv.duplicates_removed, (d) => `<div class="finding"><div class="h"><span class="badge neutral">${esc(d.removed_id)}</span>merged into <span class="badge neutral">${esc(d.kept_id)}</span></div><p>${esc(d.reason)}</p></div>`, 'No duplicate tests found.')}
        ${sec(3, 'Weak assertions fixed', rv.weak_assertions, (w) => `<div class="finding"><div class="h"><span class="badge edge">${esc(w.test_id)}</span>${esc(w.issue)}</div><p class="fix"><strong>Fix.</strong> ${esc(w.fix)}</p></div>`, 'All tests assert an outcome.')}
      </div></div>`;
  }

  // --- drawer
  function snippetFor(id) {
    for (const f of S.run.files) {
      const lines = f.code.split('\n');
      const i = lines.findIndex((l) => new RegExp(`['"\`]${id}\\b`).test(l) && /\btest\(/.test(l));
      if (i < 0) continue;
      const ind = lines[i].match(/^\s*/)[0];
      let j = i; while (j < lines.length - 1 && !(lines[j].startsWith(`${ind}}`) && lines[j].trim().startsWith('})'))) j++;
      return { file: f.filename, code: lines.slice(i, j + 1).map((l) => l.startsWith(ind) ? l.slice(ind.length) : l).join('\n') };
    }
    return null;
  }

  function viewDrawer() {
    const r = S.run;
    if (!S.drawerTc || !r) return '';
    const t = r.tests.find((x) => x.id === S.drawerTc);
    if (!t) return '';
    const ac = r.criteria.find((c) => c.id === t.criterion_id);
    const snip = snippetFor(t.id);
    return `<div class="scrim" data-key="d-scrim" data-act="close"></div>
      <aside class="drawer" data-key="drawer-${esc(t.id)}" role="dialog" aria-modal="true" aria-label="${esc(t.id)} details">
        <header><div><div class="kv"><span class="mono acid">${esc(t.id)}</span><span class="badge ${t.type}">${t.type}</span><span class="badge ${(t.priority || 'P1').toLowerCase()}">${esc(t.priority || 'P1')}</span></div><h2 class="d-title">${esc(t.title)}</h2></div>
          <button class="btn ghost icon" data-act="close" aria-label="Close">${icon('x')}</button></header>
        <div class="body">
          <div style="--i:0"><h3>Verifies</h3><p class="verifies"><span class="mono acid">${esc(t.criterion_id)}</span> ${esc(ac ? ac.text : '')}</p></div>
          <div style="--i:1"><h3>Steps</h3><ol class="steps">${t.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol></div>
          <div style="--i:2"><h3>Expected result</h3><p class="expect">${icon('check')}<span>${esc(t.expected)}</span></p></div>
          ${snip ? `<div style="--i:3"><h3>Generated test <span class="hint">in ${esc(snip.file)}</span></h3><div class="code snip"><pre>${codeBlock(snip.code)}</pre></div></div>` : ''}
        </div></aside>`;
  }

  // --- command palette (Ctrl/Cmd+K): navigation, samples and recent runs in one place
  function paletteItems() {
    const q = S.palette.q.trim().toLowerCase();
    const items = [
      { group: 'Actions', label: 'New test run', hint: 'Compose a requirement', ico: 'plus', run: () => go('#/new') },
      { group: 'Actions', label: 'Run history', hint: plural(S.runs.length, 'saved run'), ico: 'history', run: () => go('#/runs') },
      ...S.samples.map((s) => ({ group: 'Samples', label: s.title, hint: s.blurb, ico: 'sparkles', run: () => loadSample(s.id) })),
      ...S.runs.slice(0, 15).map((r) => ({ group: 'Recent runs', label: r.title, hint: `${r.status} · ${ago(r.created_at)}`, dot: dotCls(r.status), run: () => go(`#/runs/${r.id}`) })),
    ];
    return q ? items.filter((i) => `${i.label} ${i.hint} ${i.group}`.toLowerCase().includes(q)) : items;
  }

  function viewPalette() {
    if (!S.palette.open) return '';
    const items = paletteItems();
    const idx = Math.min(S.palette.idx, Math.max(items.length - 1, 0));
    let group = '';
    const rows = items.map((it, i) => {
      const g = it.group !== group ? `<div class="pg">${it.group}</div>` : '';
      group = it.group;
      return `${g}<button class="pi" data-act="pal" data-i="${i}" aria-selected="${i === idx}">${it.dot ? `<span class="pi-ico"><span class="dot ${it.dot}"></span></span>` : `<span class="pi-ico">${icon(it.ico)}</span>`}<span class="pl">${esc(it.label)}</span><span class="ph">${esc(it.hint || '')}</span><span class="enter">&#8629;</span></button>`;
    }).join('');
    return `<div class="scrim" data-key="p-scrim" data-act="pclose"></div>
      <div class="palette" data-key="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="pal-in">${icon('search')}<input id="pal" type="text" data-bind="pal" value="${esc(S.palette.q)}" placeholder="Search runs, samples and actions" autocomplete="off" spellcheck="false"><kbd>Esc</kbd></div>
        <div class="pal-list">${rows || '<div class="empty">Nothing matches.</div>'}</div>
        <div class="pal-f"><span><kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate</span><span><kbd>&#8629;</kbd> open</span><span><kbd>Esc</kbd> close</span></div>
      </div>`;
  }

  // ------------------------------------------------------------------- fx
  function toast(msg) {
    const root = $('#toast-root');
    root.innerHTML = `<div class="toast" role="status"><span class="ti">${icon('check')}</span>${esc(msg)}</div>`;
    clearTimeout(toast.t); toast.t = setTimeout(() => { root.innerHTML = ''; }, 2600);
  }

  function confetti() {
    if (REDUCE.matches) return;
    const c = $('#fx'); const ctx = c.getContext('2d'); const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = innerWidth; const H = innerHeight;
    c.width = W * dpr; c.height = H * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const colors = ['#a78bfa', '#6d8bff', '#22d3ee', '#34d399', '#fbbf24', '#fb7185', '#ffffff'];
    const parts = Array.from({ length: 220 }, (_, i) => {
      const left = i % 2 === 0;
      return { x: left ? W * 0.08 : W * 0.92, y: H * 0.55, vx: (left ? 1 : -1) * (Math.random() * 11 + 4), vy: -(Math.random() * 15 + 8), rot: Math.random() * 360, vr: (Math.random() - 0.5) * 18, w: Math.random() * 6 + 4, h: Math.random() * 10 + 6, color: colors[i % colors.length] };
    });
    const t0 = performance.now(); const life = 3400;
    (function frame(now) {
      const el = now - t0;
      ctx.clearRect(0, 0, W, H);
      for (const p of parts) {
        p.vy += 0.34; p.vx *= 0.986; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate((p.rot * Math.PI) / 180);
        ctx.globalAlpha = Math.max(0, 1 - el / life); ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h * Math.abs(Math.cos(p.rot / 25)));
        ctx.restore();
      }
      if (el < life) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
    })(t0);
  }

  // Drifting constellation behind everything; nodes lean away from the cursor.
  function startBackground() {
    const c = $('#bg'); const ctx = c.getContext('2d');
    let W = 0; let H = 0; let pts = []; let raf = 0;
    const mouse = { x: -1e4, y: -1e4 };
    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      W = innerWidth; H = innerHeight;
      c.width = W * dpr; c.height = H * dpr; c.style.width = `${W}px`; c.style.height = `${H}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(95, (W * H) / 15000));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.22, vy: (Math.random() - 0.5) * 0.22, r: Math.random() * 1.3 + 0.4, tw: Math.random() * Math.PI * 2 }));
    }
    function draw(t) {
      ctx.clearRect(0, 0, W, H);
      for (const p of pts) {
        p.x += p.vx; p.y += p.vy;
        if (p.x < -20) p.x = W + 20; if (p.x > W + 20) p.x = -20;
        if (p.y < -20) p.y = H + 20; if (p.y > H + 20) p.y = -20;
        const dx = p.x - mouse.x; const dy = p.y - mouse.y; const d = Math.hypot(dx, dy);
        if (d < 150 && d > 0) { const f = (1 - d / 150) * 1.2; p.x += (dx / d) * f; p.y += (dy / d) * f; }
      }
      for (let i = 0; i < pts.length; i++) {
        for (let j = i + 1; j < pts.length; j++) {
          const a = pts[i]; const b = pts[j]; const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 135) {
            ctx.strokeStyle = `rgba(150,140,255,${(1 - d / 135) * 0.16})`;
            ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
        }
      }
      for (const p of pts) {
        const a = 0.35 + Math.sin(t / 900 + p.tw) * 0.25;
        ctx.fillStyle = `rgba(210,215,255,${a})`;
        ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill();
      }
      raf = requestAnimationFrame(draw);
    }
    function start() { cancelAnimationFrame(raf); if (REDUCE.matches) draw(0), cancelAnimationFrame(raf); else raf = requestAnimationFrame(draw); }
    resize(); start();
    addEventListener('resize', () => { resize(); if (REDUCE.matches) start(); });
    addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden) cancelAnimationFrame(raf); else start(); });
  }

  // ----------------------------------------------------------------- events
  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); toast('Copied to clipboard'); }
    catch (_) { toast('Copy is blocked by the browser. Select the code and copy manually.'); }
  }

  function updateWordCount() {
    const t = $('#story'); const wc = $('#wc');
    if (t && wc) { const w = t.value.trim(); wc.textContent = plural(w ? w.split(/\s+/).length : 0, 'word'); }
  }

  function openPalette() { S.palette = { open: true, q: '', idx: 0, focus: true }; S.menuOpen = false; paint(); }
  function closePalette() { S.palette.open = false; paint(); }
  function runPaletteItem(i) {
    const it = paletteItems()[i];
    if (!it) return;
    S.palette.open = false;
    paint();
    it.run();
  }

  document.addEventListener('click', async (e) => {
    if (S.menuOpen && !e.target.closest('.menu')) { S.menuOpen = false; paint(); }
    const row = e.target.closest('[data-href]');
    const el = e.target.closest('[data-act]');
    if (!el) { if (row && !e.target.closest('a,button')) go(row.dataset.href); return; }
    const act = el.dataset.act; const v = el.dataset.v;
    switch (act) {
      case 'src': S.draft.source = v; paint(); break;
      case 'depth': S.draft.depth = v; paint(); break;
      case 'type': S.draft.types[v] = !S.draft.types[v]; paint(); break;
      case 'gherkin': S.draft.gherkin = !S.draft.gherkin; paint(); break;
      case 'sample': loadSample(el.dataset.id); break;
      case 'submit': submitRun(); break;
      case 'jira': {
        try { const j = await api('/api/import/jira', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: S.draft.jiraKey.trim() }) }); S.draft.story = j.story; S.draft.source = 'paste'; paint(); toast(`Imported ${j.key}`); }
        catch (err) { S.draftError = err.message; paint(); }
        break;
      }
      case 'tab': S.tab = v; S.userTab = true; paint(); break;
      case 'ftype': S.filters.type = v; paint(); break;
      case 'tc': S.drawerTc = el.dataset.id; paint(); break;
      case 'close': S.drawerTc = null; paint(); break;
      case 'file': S.fileIdx = Number(el.dataset.i); paint(); break;
      case 'copy': { const files = [...S.run.files].sort((a, b) => a.filename.localeCompare(b.filename)); copyText(files[Number(el.dataset.i)].code); break; }
      case 'menu': S.menuOpen = !S.menuOpen; paint(); e.stopPropagation(); break;
      case 'console': { const running = S.run && ['running', 'queued'].includes(S.run.status); S.consoleOpen = !(S.consoleOpen == null ? running : S.consoleOpen); paint(); break; }
      case 'rerun': if (S.run) { S.draft.story = S.run.story; S.draft.base_url = S.run.base_url; S.draft.source = 'paste'; S.draftError = ''; go('#/new'); } break;
      case 'palette': openPalette(); break;
      case 'pclose': closePalette(); break;
      case 'pal': runPaletteItem(Number(el.dataset.i)); break;
      case 'del': {
        e.stopPropagation();
        if (!confirm('Delete this run and its generated files?')) break;
        try { await api(`/api/runs/${el.dataset.id}`, { method: 'DELETE' }); await refreshRuns(); paint(); toast('Run deleted'); } catch (err) { toast(err.message); }
        break;
      }
    }
  });

  document.addEventListener('input', (e) => {
    const b = e.target.dataset.bind;
    if (!b) return;
    if (b === 'q') { S.filters.q = e.target.value; paint(); return; }
    if (b === 'pal') { S.palette.q = e.target.value; S.palette.idx = 0; paint(); return; }
    S.draft[b] = e.target.value;
    if (b === 'story') updateWordCount();
  });

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (S.palette.open) closePalette(); else openPalette(); return; }
    if (S.palette.open) {
      const n = paletteItems().length;
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); S.palette.idx = n ? (Math.min(S.palette.idx, n - 1) + 1) % n : 0; paint(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); S.palette.idx = n ? (Math.min(S.palette.idx, n - 1) - 1 + n) % n : 0; paint(); }
      else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(Math.min(S.palette.idx, n - 1)); }
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && S.route.name === 'new') { e.preventDefault(); submitRun(); return; }
    if (e.key === 'Escape') { if (S.drawerTc || S.menuOpen) { S.drawerTc = null; S.menuOpen = false; paint(); } return; }
    if (e.key === '/' && S.route.name === 'run' && S.tab === 'tests' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); $('#q')?.focus(); return; }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('tr[data-act="tc"]')) { e.preventDefault(); S.drawerTc = e.target.dataset.id; paint(); }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'filein') readFile(e.target.files[0]);
  });
  document.addEventListener('dragover', (e) => { if (e.target.closest?.('#drop')) { e.preventDefault(); $('#drop').classList.add('over'); } });
  document.addEventListener('dragleave', (e) => { if (e.target.closest?.('#drop')) $('#drop').classList.remove('over'); });
  document.addEventListener('drop', (e) => { if (e.target.closest?.('#drop')) { e.preventDefault(); readFile(e.dataTransfer.files[0]); } });

  async function readFile(file) {
    if (!file) return;
    if (file.size > 200 * 1024) { S.draftError = 'That file is larger than 200 KB. Paste the relevant section instead.'; paint(); return; }
    if (!/\.(txt|md)$/i.test(file.name)) { S.draftError = 'Only .txt and .md files are supported.'; paint(); return; }
    S.draft.story = await file.text(); S.draft.source = 'paste'; S.draftError = ''; paint(); toast(`Loaded ${file.name}`);
  }

  // Cursor-tracking glow on .spot surfaces.
  document.addEventListener('pointermove', (e) => {
    const el = e.target.closest?.('.spot');
    if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--mx', `${e.clientX - b.left}px`);
    el.style.setProperty('--my', `${e.clientY - b.top}px`);
  }, { passive: true });

  addEventListener('scroll', () => document.documentElement.classList.toggle('scrolled', scrollY > 8), { passive: true });
  addEventListener('resize', slideIndicators);
  window.addEventListener('hashchange', onRoute);
  setInterval(() => {
    const r = S.run; const el = $('#elapsed');
    if (r && el && ['running', 'queued'].includes(r.status)) el.textContent = elapsed(r);
  }, 1000);

  // ------------------------------------------------------------------- boot
  (async function init() {
    startBackground();
    morph($('#dock'), viewDock());
    document.fonts?.ready.then(slideIndicators);
    try { S.config = await api('/api/config'); } catch (_) { /* defaults */ }
    try { S.samples = await api('/api/samples'); } catch (_) { /* optional */ }
    await refreshRuns();
    await onRoute();
  })();
})();
