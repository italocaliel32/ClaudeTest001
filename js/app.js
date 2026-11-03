/* Sistema de Gestão de Limpeza — Web Summit Lisboa */
(function () {
  'use strict';
  const { CATS, STATUS, DONE, CLOSED, PRIORITY, TIERS, FLOORS, ROLES, SHIFTS, Seed, util } = window.WSC;
  const CAT_KEYS = Object.keys(CATS);

  /* ================= Utilitários ================= */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const uid = (p = 'x') => p + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = (n) => String(n).padStart(2, '0');
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const S = () => Store.state;
  const byId = (c, id) => S()[c].find((x) => x.id === id);
  const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
  const fmtDay = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT', { weekday: 'short', day: 'numeric', month: 'short' }) : '—';
  const fmtDate = (iso) => iso ? new Date(iso + 'T12:00:00').toLocaleDateString('pt-PT') : '—';
  const fmtTs = (ts) => ts ? new Date(ts).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';
  const fmtTime = (ts) => ts ? new Date(ts).toLocaleTimeString('pt-PT', { hour: '2-digit', minute: '2-digit' }) : '—';
  const EUR = new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' });
  const eur = (n) => (n == null || n === '' || isNaN(n)) ? '—' : EUR.format(Number(n));
  const num = (n, d = 0) => Number(n || 0).toLocaleString('pt-PT', { maximumFractionDigits: d });
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const hm2min = (t) => { if (!t) return 0; const [h, m] = t.split(':').map(Number); return h * 60 + (m || 0); };
  const sortCode = (a, b) => String(a.code).localeCompare(String(b.code), 'pt', { numeric: true });
  const user = () => { try { return localStorage.getItem('wsc.user') || ''; } catch (e) { return ''; } };
  const who = () => user() || 'Gestor';

  const eventDays = () => util.daysBetween(S().settings.eventStart, S().settings.eventEnd);
  const defaultDay = () => { const t = todayISO(); const d = eventDays(); return d.includes(t) ? t : d[0]; };

  const badge = (st) => { const s = STATUS[st] || [st || '—', 'gray']; return `<span class="badge t-${s[1]}">${esc(s[0])}</span>`; };
  const prioBadge = (p) => p && p !== 'normal' ? `<span class="badge t-${PRIORITY[p][1]} solid">${PRIORITY[p][0]}</span>` : '';
  const catTag = (c) => `<span class="cat-tag" style="--c:${CATS[c].color}">${CATS[c].short}</span>`;
  const bar = (v, max, color) => `<div class="bar"><span style="width:${Math.min(100, pct(v, max))}%;background:${color || 'var(--accent)'}"></span></div>`;

  /* ================= Regras de negócio ================= */
  const areaOf = (s) => byId('areas', s.areaId) || { code: '?', name: '(área removida)', pavilionId: '' };
  const pavOf = (a) => byId('pavilions', a && a.pavilionId) || { name: '—', num: '' };
  const isDaily = (s) => CATS[s.cat].mode === 'daily';

  function overall(s) {
    if (!isDaily(s)) return s.status;
    const v = Object.values(s.days || {});
    if (!v.length) return 'pendente';
    if (v.every((x) => x === 'verificada')) return 'verificada';
    if (v.every((x) => DONE.includes(x))) return 'concluida';
    if (v.some((x) => DONE.includes(x) || x === 'nao_realizada')) return 'em_curso';
    return 'pendente';
  }
  const isOpen = (s) => !CLOSED.includes(overall(s));

  function dedHours(s) {
    let m = hm2min(s.end) - hm2min(s.start); if (m < 0) m += 1440;
    return (m / 60) * (Number(s.people) || 0);
  }
  const dedTotalHours = (s) => dedHours(s) * (s.days || []).length;
  const dedRate = (s) => Number(s.rate) || Number(S().settings.hourlyRate) || 0;
  const withVat = (n) => Number(n || 0) * (1 + (Number(S().settings.vat) || 0) / 100);

  function roundsOn(s, day) { return (s.rounds || []).filter((r) => r.day === day).sort((a, b) => a.ts - b.ts); }
  function overdue(s) {
    // Ronda de área comum em atraso (apenas no dia de hoje e dentro do horário)
    const t = todayISO();
    if (s.cat !== 'comum' || !(s.days && t in s.days) || DONE.includes(s.days[t])) return 0;
    const now = hm2min(nowHM()), start = hm2min(s.start || S().settings.dayStart), end = hm2min(s.end || S().settings.dayEnd);
    if (now < start || now > end) return 0;
    const rs = roundsOn(s, t);
    const last = rs.length ? hm2min(fmtTime(rs[rs.length - 1].ts)) : start;
    const late = now - last - (Number(s.intervalMin) || 120);
    return late > 0 ? late : 0;
  }

  function svcSummary(s, day) {
    const st = S().settings;
    switch (s.cat) {
      case 'abertura': return `${fmtDay(s.date)} · ${esc(s.time || '—')}`;
      case 'noturna': return `${Object.keys(s.days || {}).length} noite(s) · a partir das ${esc(s.time || st.nightStart)}`;
      case 'dedicada': return `${s.people || 0} pessoa(s) · ${esc(s.start)}–${esc(s.end)} · ${(s.days || []).length} dia(s) · ${num(dedTotalHours(s), 1)} h`;
      case 'comum': return `Ronda a cada ${s.intervalMin || 120} min · ${esc(s.start || st.dayStart)}–${esc(s.end || st.dayEnd)}${day ? ` · ${roundsOn(s, day).length} ronda(s) em ${fmtDay(day)}` : ''}`;
      case 'orcamento': return `${esc(s.title || 'Pedido especial')} · ${s.amount != null ? eur(s.amount) + ' s/ IVA' : 'sem valor'}`;
    }
    return '';
  }
  const staffNames = (ids) => (ids || []).map((id) => byId('staff', id)).filter(Boolean).map((p) => p.name);

  /* ================= Registo / gravação ================= */
  function logOp(text, ref = '') { return { t: 'upsert', c: 'log', item: { id: uid('l'), ts: Date.now(), by: who(), text, ref } }; }
  function svcOps(s, msg) {
    s.updatedAt = Date.now();
    if (msg) (s.history = s.history || []).push({ ts: s.updatedAt, by: who(), text: msg });
    const a = areaOf(s);
    return [{ t: 'upsert', c: 'services', item: s }].concat(msg ? [logOp(`${CATS[s.cat].short} · ${a.code} ${a.name}: ${msg}`, s.id)] : []);
  }
  function saveSvc(s, msg) { return Store.apply(svcOps(s, msg)).then(refresh); }

  /* ================= Estado de UI ================= */
  const ui = { route: 'painel', pav: 'p1', day: null, f: {}, drawer: null, q: '', areaType: '', selected: new Set() };
  const filt = (k) => (ui.f[k] = ui.f[k] || { pav: '', status: '', prio: '', q: '', staff: '' });

  /* ================= Componentes ================= */
  function dayChips() {
    const t = todayISO();
    return `<div class="chips">${eventDays().map((d) => `<button class="chip ${d === ui.day ? 'on' : ''}" data-act="day" data-day="${d}">${fmtDay(d)}${d === t ? ' · hoje' : ''}</button>`).join('')}</div>`;
  }
  function pavOptions(sel, all = 'Todos os pavilhões') {
    return `<option value="">${all}</option>` + S().pavilions.map((p) => `<option value="${p.id}" ${p.id === sel ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
  }
  function dayButtons(s, day) {
    if (!s.days || !(day in s.days)) return '<span class="muted small">Não agendado</span>';
    const cur = s.days[day];
    const opts = [['pendente', '○', 'Pendente'], ['concluida', '✓', 'Concluída'], ['verificada', '✓✓', 'Verificada (supervisor)'], ['nao_realizada', '✕', 'Não realizada']];
    return `<div class="seg">${opts.map(([k, ic, t]) => `<button class="${cur === k ? 'on t-' + STATUS[k][1] : ''}" data-act="set-day" data-id="${s.id}" data-day="${day}" data-st="${k}" title="${t}">${ic}</button>`).join('')}</div>`;
  }
  function dayDots(s) {
    return `<span class="dots">${eventDays().map((d) => { const v = s.days && s.days[d]; return `<i class="${v ? 't-' + STATUS[v][1] : 'none'}" title="${fmtDay(d)}: ${v ? STATUS[v][0] : 'não agendado'}"></i>`; }).join('')}</span>`;
  }
  function statusSelect(s) {
    return `<select class="status-sel" data-change="status" data-id="${s.id}">${CATS[s.cat].statuses.map((k) => `<option value="${k}" ${k === s.status ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select>`;
  }
  function empty(msg) { return `<div class="empty">${msg}</div>`; }
  function kpi(label, value, sub, color) {
    return `<div class="kpi" style="--c:${color || 'var(--accent)'}"><div class="kpi-label">${label}</div><div class="kpi-value">${value}</div><div class="kpi-sub">${sub || ''}</div></div>`;
  }

  /* ================= Vistas ================= */
  const views = {};

  /* ---------- Painel ---------- */
  views.painel = function () {
    const st = S(), day = ui.day, sv = st.services;
    const by = (c) => sv.filter((s) => s.cat === c);
    const ab = by('abertura').filter((s) => s.status !== 'cancelada');
    const abDone = ab.filter((s) => DONE.includes(s.status)).length;
    const nt = by('noturna').filter((s) => s.days && day in s.days);
    const ntDone = nt.filter((s) => DONE.includes(s.days[day])).length;
    const dd = by('dedicada').filter((s) => !['cancelado'].includes(s.status) && (s.days || []).includes(day));
    const ddPeople = dd.reduce((a, s) => a + Number(s.people || 0), 0);
    const ddAlloc = dd.reduce((a, s) => a + Math.min((s.staffIds || []).length, Number(s.people || 0)), 0);
    const cm = by('comum').filter((s) => s.days && day in s.days);
    const cmRounds = cm.reduce((a, s) => a + roundsOn(s, day).length, 0);
    const cmDone = cm.filter((s) => DONE.includes(s.days[day])).length;
    const oq = by('orcamento');
    const oqOpen = oq.filter((s) => ['pedido', 'em_orcamentacao', 'enviado'].includes(s.status)).length;
    const oqApproved = oq.filter((s) => ['aprovado', 'em_execucao', 'concluido'].includes(s.status)).reduce((a, s) => a + Number(s.amount || 0), 0);

    const alerts = buildAlerts();

    const pavCards = st.pavilions.map((p) => {
      const areas = st.areas.filter((a) => a.pavilionId === p.id);
      const ids = new Set(areas.map((a) => a.id));
      const mine = sv.filter((s) => ids.has(s.areaId));
      const pab = mine.filter((s) => s.cat === 'abertura' && s.status !== 'cancelada');
      const pnt = mine.filter((s) => s.cat === 'noturna' && s.days && day in s.days);
      const pcm = mine.filter((s) => s.cat === 'comum' && s.days && day in s.days);
      const pdd = mine.filter((s) => s.cat === 'dedicada' && s.status !== 'cancelado' && (s.days || []).includes(day));
      const poq = mine.filter((s) => s.cat === 'orcamento' && ['pedido', 'em_orcamentacao', 'enviado'].includes(s.status));
      const urgent = mine.filter((s) => s.priority === 'urgente' && isOpen(s)).length;
      const late = pcm.filter((s) => overdue(s)).length;
      const pabD = pab.filter((s) => DONE.includes(s.status)).length;
      const pntD = pnt.filter((s) => DONE.includes(s.days[day])).length;
      const pcmD = pcm.filter((s) => DONE.includes(s.days[day])).length;
      return `<button class="pav-card" data-act="goto-pav" data-pav="${p.id}" style="--c:${p.color}">
        <div class="pav-head"><span class="pav-num">${p.num}</span><div><div class="pav-name">${esc(p.name)}</div><div class="muted small">${esc(p.desc || '')}</div></div>
        ${urgent ? `<span class="badge t-red solid">${urgent} urgente(s)</span>` : ''}${late ? `<span class="badge t-amber solid">${late} ronda(s) em atraso</span>` : ''}</div>
        <div class="muted small">${areas.filter((a) => a.type === 'stand').length} stands · ${areas.filter((a) => a.type === 'comum').length} áreas comuns</div>
        <div class="pav-row"><span>Abertura</span><b>${pabD}/${pab.length}</b>${bar(pabD, pab.length, CATS.abertura.color)}</div>
        <div class="pav-row"><span>Noturna</span><b>${pntD}/${pnt.length}</b>${bar(pntD, pnt.length, CATS.noturna.color)}</div>
        <div class="pav-row"><span>Comuns</span><b>${pcmD}/${pcm.length}</b>${bar(pcmD, pcm.length, CATS.comum.color)}</div>
        <div class="pav-foot"><span>👥 ${pdd.reduce((a, s) => a + Number(s.people || 0), 0)} em apoio dedicado</span><span>€ ${poq.length} orçamento(s) em aberto</span></div>
      </button>`;
    }).join('');

    const recent = st.log.slice(-12).reverse().map((l) => `<li><span class="muted small">${fmtTs(l.ts)} · ${esc(l.by)}</span><div>${esc(l.text)}</div></li>`).join('');

    return `
      <div class="page-head">
        <div><h1>${esc(st.settings.eventName)}</h1><div class="muted">${esc(st.settings.venue)} · Abertura ${fmtDate(st.settings.openingDate)} · Evento ${fmtDate(st.settings.eventStart)} – ${fmtDate(st.settings.eventEnd)}</div></div>
      </div>
      ${dayChips()}
      <div class="kpis">
        <a class="kpi-link" href="#abertura">${kpi('Limpeza de abertura', `${abDone}<small>/${ab.length}</small>`, `${pct(abDone, ab.length)}% concluída ${bar(abDone, ab.length, CATS.abertura.color)}`, CATS.abertura.color)}</a>
        <a class="kpi-link" href="#noturna">${kpi('Noturna · ' + fmtDay(day), `${ntDone}<small>/${nt.length}</small>`, `${pct(ntDone, nt.length)}% concluída ${bar(ntDone, nt.length, CATS.noturna.color)}`, CATS.noturna.color)}</a>
        <a class="kpi-link" href="#dedicada">${kpi('Apoio dedicado · ' + fmtDay(day), `${ddPeople}<small> pessoas</small>`, `${dd.length} stands · ${ddAlloc}/${ddPeople} alocadas ${bar(ddAlloc, ddPeople, CATS.dedicada.color)}`, CATS.dedicada.color)}</a>
        <a class="kpi-link" href="#comum">${kpi('Áreas comuns · ' + fmtDay(day), `${cmRounds}<small> rondas</small>`, `${cmDone}/${cm.length} áreas fechadas ${bar(cmDone, cm.length, CATS.comum.color)}`, CATS.comum.color)}</a>
        <a class="kpi-link" href="#orcamento">${kpi('Orçamentos', `${oqOpen}<small> em aberto</small>`, `${eur(oqApproved)} aprovados (s/ IVA)`, CATS.orcamento.color)}</a>
      </div>
      <h2 class="section-title">Pavilhões</h2>
      <div class="pav-grid">${pavCards}</div>
      <div class="two-col">
        <section class="card"><div class="card-head"><h2>Alertas e pendentes críticos</h2><span class="badge ${alerts.length ? 't-red' : 't-green'}">${alerts.length}</span></div>
          ${alerts.length ? `<ul class="alerts">${alerts.slice(0, 40).map((a) => `<li class="al-${a.level}"><button class="link" data-act="area" data-id="${a.areaId}"><b>${esc(a.title)}</b><span class="muted small">${esc(a.text)}</span></button></li>`).join('')}</ul>` : empty('Sem alertas. Tudo em ordem ✓')}
        </section>
        <section class="card"><div class="card-head"><h2>Atividade recente</h2><a href="#registo" class="small">Ver tudo</a></div><ul class="activity">${recent || '<li class="muted">Sem atividade</li>'}</ul></section>
      </div>`;
  };

  function buildAlerts() {
    const out = [];
    const t = todayISO();
    for (const s of S().services) {
      const a = areaOf(s), where = `${a.code} · ${a.name}`;
      if (s.priority === 'urgente' && isOpen(s)) out.push({ level: 'red', areaId: s.areaId, title: `Urgente · ${CATS[s.cat].short}`, text: `${where} — ${STATUS[overall(s)][0]}` });
      const late = overdue(s);
      if (late) out.push({ level: 'amber', areaId: s.areaId, title: `Ronda em atraso (${late} min)`, text: where });
      if (isDaily(s)) for (const [d, v] of Object.entries(s.days || {})) if (v === 'nao_realizada') out.push({ level: 'red', areaId: s.areaId, title: `${CATS[s.cat].short} não realizada · ${fmtDay(d)}`, text: where });
      if (s.cat === 'dedicada' && ['pedido', 'confirmado'].includes(s.status) && (s.staffIds || []).length < Number(s.people || 0)) out.push({ level: 'amber', areaId: s.areaId, title: `Apoio dedicado sem pessoal suficiente (${(s.staffIds || []).length}/${s.people})`, text: where });
      if (s.cat === 'dedicada' && s.status === 'pedido') out.push({ level: 'blue', areaId: s.areaId, title: 'Apoio dedicado por confirmar', text: where });
      if (s.cat === 'orcamento' && ['pedido', 'em_orcamentacao'].includes(s.status) && Date.now() - (s.createdAt || 0) > 86400000) out.push({ level: 'amber', areaId: s.areaId, title: 'Orçamento por enviar há mais de 24h', text: `${where} — ${s.title || ''}` });
      if (s.cat === 'orcamento' && s.status === 'enviado') out.push({ level: 'blue', areaId: s.areaId, title: 'Orçamento a aguardar resposta do cliente', text: `${where} — ${eur(s.amount)}` });
      if (s.cat === 'abertura' && !DONE.includes(s.status) && s.status !== 'cancelada' && s.date && s.date < t) out.push({ level: 'red', areaId: s.areaId, title: 'Limpeza de abertura atrasada', text: `${where} — previsto ${fmtDay(s.date)}` });
    }
    const rank = { red: 0, amber: 1, blue: 2 };
    return out.sort((a, b) => rank[a.level] - rank[b.level]);
  }

  /* ---------- Pavilhões ---------- */
  views.pavilhoes = function () {
    const st = S(), p = byId('pavilions', ui.pav) || st.pavilions[0];
    ui.pav = p.id;
    const f = filt('pav');
    const q = f.q.toLowerCase();
    let areas = st.areas.filter((a) => a.pavilionId === p.id).sort(sortCode);
    const total = areas.length;
    if (ui.areaType) areas = areas.filter((a) => a.type === ui.areaType);
    if (f.tier) areas = areas.filter((a) => a.tier === f.tier);
    if (q) areas = areas.filter((a) => [a.code, a.name, a.contact, a.location, a.email].join(' ').toLowerCase().includes(q));
    const svcByArea = {};
    for (const s of st.services) (svcByArea[s.areaId] = svcByArea[s.areaId] || []).push(s);
    const day = ui.day;

    const cell = (a, c) => {
      const list = (svcByArea[a.id] || []).filter((s) => s.cat === c);
      if (!list.length) return `<td class="c-cat"><button class="add-mini" data-act="new-svc" data-cat="${c}" data-area="${a.id}" title="Adicionar ${CATS[c].label}">+</button></td>`;
      const s = list[0];
      const stt = isDaily(s) && s.days && day in s.days ? s.days[day] : overall(s);
      return `<td class="c-cat">${badge(stt)}${list.length > 1 ? `<span class="muted small"> +${list.length - 1}</span>` : ''}</td>`;
    };
    const sqm = areas.reduce((a, x) => a + Number(x.sqm || 0), 0);

    return `
      <div class="page-head"><div><h1>Pavilhões</h1><div class="muted">Expositores e áreas com limpeza, por pavilhão. Estado diário referente a ${fmtDay(day)}.</div></div>
        <div class="actions"><button class="btn" data-act="import-areas">Importar CSV</button><button class="btn" data-act="new-area" data-pav="${p.id}">+ Stand / área</button></div></div>
      <div class="tabs">${st.pavilions.map((x) => `<button class="tab ${x.id === p.id ? 'on' : ''}" style="--c:${x.color}" data-act="pav-tab" data-pav="${x.id}"><span class="pav-num sm">${x.num}</span>${esc(x.name)}<span class="muted small">${st.areas.filter((a) => a.pavilionId === x.id).length}</span></button>`).join('')}</div>
      <div class="card">
        <div class="card-head"><div><h2>${esc(p.name)}</h2><div class="muted small">${esc(p.desc || '')}</div></div><div class="muted small">${areas.length} de ${total} áreas · ${num(sqm)} m²</div></div>
        <div class="toolbar">
          <input type="search" placeholder="Filtrar por código, empresa, contacto…" value="${esc(f.q)}" data-filter="pav.q">
          <select data-act-change="area-type"><option value="">Stands e áreas comuns</option><option value="stand" ${ui.areaType === 'stand' ? 'selected' : ''}>Só stands / expositores</option><option value="comum" ${ui.areaType === 'comum' ? 'selected' : ''}>Só áreas comuns</option></select>
          <select data-filter="pav.tier"><option value="">Todas as tipologias</option>${TIERS.map((t) => `<option ${f.tier === t ? 'selected' : ''}>${t}</option>`).join('')}</select>
          ${dayChips()}
        </div>
        <div class="table-wrap"><table class="tbl">
          <thead><tr><th>Código</th><th>Expositor / área</th><th>Tipologia</th><th class="r">m²</th>${CAT_KEYS.map((c) => `<th class="c-cat"><span class="dot" style="--c:${CATS[c].color}"></span>${CATS[c].short}</th>`).join('')}</tr></thead>
          <tbody>${areas.map((a) => `<tr class="clickable" data-act="area" data-id="${a.id}">
            <td class="mono">${esc(a.code)}</td>
            <td><b>${esc(a.name)}</b>${a.location ? `<div class="muted small">${esc(a.location)}</div>` : ''}</td>
            <td>${a.type === 'comum' ? '<span class="badge t-teal">Área comum</span>' : esc(a.tier || '')}</td>
            <td class="r">${num(a.sqm)}</td>
            ${CAT_KEYS.map((c) => cell(a, c)).join('')}</tr>`).join('') || `<tr><td colspan="9">${empty('Sem áreas para os filtros escolhidos.')}</td></tr>`}</tbody>
        </table></div>
      </div>`;
  };

  /* ---------- Vista genérica de categoria ---------- */
  function catList(cat) {
    const f = filt(cat), q = f.q.toLowerCase();
    return S().services.filter((s) => {
      if (s.cat !== cat) return false;
      const a = areaOf(s);
      if (f.pav && a.pavilionId !== f.pav) return false;
      if (f.prio && s.priority !== f.prio) return false;
      if (f.staff && !(s.staffIds || []).includes(f.staff)) return false;
      if (f.status) {
        const st = isDaily(s) ? (s.days && s.days[ui.day]) : s.status;
        if (st !== f.status) return false;
      }
      if (isDaily(s) && f.onlyDay !== false && !(s.days && ui.day in s.days)) return false;
      if (cat === 'dedicada' && f.onlyDay && !(s.days || []).includes(ui.day)) return false;
      if (q && ![a.code, a.name, s.title, s.notes, s.requester, s.ref, staffNames(s.staffIds).join(' ')].join(' ').toLowerCase().includes(q)) return false;
      return true;
    }).sort((x, y) => {
      const pr = { urgente: 0, alta: 1, normal: 2 };
      return (pr[x.priority] ?? 2) - (pr[y.priority] ?? 2) || sortCode(areaOf(x), areaOf(y));
    });
  }

  function catToolbar(cat, extra = '') {
    const f = filt(cat);
    const statuses = CATS[cat].statuses;
    const staff = S().staff.filter((p) => p.active !== false).sort((a, b) => a.name.localeCompare(b.name));
    return `<div class="toolbar">
      <input type="search" placeholder="Pesquisar…" value="${esc(f.q)}" data-filter="${cat}.q">
      <select data-filter="${cat}.pav">${pavOptions(f.pav)}</select>
      <select data-filter="${cat}.status"><option value="">${isDaily({ cat }) ? 'Estado (do dia): todos' : 'Todos os estados'}</option>${statuses.map((k) => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${STATUS[k][0]}</option>`).join('')}</select>
      <select data-filter="${cat}.prio"><option value="">Todas as prioridades</option>${Object.entries(PRIORITY).map(([k, v]) => `<option value="${k}" ${f.prio === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select>
      <select data-filter="${cat}.staff"><option value="">Toda a equipa</option>${staff.map((p) => `<option value="${p.id}" ${f.staff === p.id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select>
      ${extra}
    </div>`;
  }

  function catHead(cat, actions = '') {
    const c = CATS[cat];
    return `<div class="page-head"><div><h1><span class="dot lg" style="--c:${c.color}"></span>${c.label}</h1><div class="muted">${c.desc}</div></div>
      <div class="actions">${actions}<button class="btn" data-act="export-csv" data-cat="${cat}">Exportar CSV</button><button class="btn" data-act="print" data-cat="${cat}">Imprimir folha</button><button class="btn primary" data-act="new-svc" data-cat="${cat}">+ Novo</button></div></div>`;
  }

  const areaCell = (s) => { const a = areaOf(s); return `<td><button class="link" data-act="area" data-id="${a.id}"><span class="mono">${esc(a.code)}</span> <b>${esc(a.name)}</b></button><div class="muted small">${esc(pavOf(a).name)}${a.location ? ' · ' + esc(a.location) : ''}</div></td>`; };
  const staffCell = (s) => { const n = staffNames(s.staffIds); return `<td class="small">${n.length ? esc(n.join(', ')) : '<span class="muted">Por atribuir</span>'}</td>`; };
  const rowActions = (s) => `<td class="r nowrap"><button class="icon-btn" data-act="edit-svc" data-id="${s.id}" title="Editar">✎</button></td>`;
  const noRows = (n) => `<tr><td colspan="${n}">${empty('Nenhum registo para os filtros escolhidos.')}</td></tr>`;

  /* ---------- Abertura ---------- */
  views.abertura = function () {
    const list = catList('abertura');
    const all = S().services.filter((s) => s.cat === 'abertura' && s.status !== 'cancelada');
    const cnt = (k) => all.filter((s) => s.status === k).length;
    const done = all.filter((s) => DONE.includes(s.status)).length;
    const missing = S().areas.filter((a) => !S().services.some((s) => s.cat === 'abertura' && s.areaId === a.id)).length;
    return `${catHead('abertura', `<button class="btn" data-act="bulk-abertura">Gerar em falta (${missing})</button>`)}
      <div class="kpis sm">${kpi('Total', all.length, '', CATS.abertura.color)}${kpi('Pendentes', cnt('pendente'))}${kpi('Em curso', cnt('em_curso'), '', '#2563eb')}${kpi('Concluídas', cnt('concluida'), '', '#16a34a')}${kpi('Verificadas', cnt('verificada'), `${pct(done, all.length)}% do total ${bar(done, all.length, '#0d9488')}`, '#0d9488')}</div>
      <div class="card">${catToolbar('abertura')}${bulkBar('abertura', list)}
      <div class="table-wrap"><table class="tbl"><thead><tr><th class="cb"><input type="checkbox" data-act="sel-all" data-cat="abertura"></th><th>Stand / área</th><th>Data e hora prevista</th><th>Equipa</th><th>Prioridade</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr>${selCell(s)}${areaCell(s)}<td>${fmtDay(s.date)} · ${esc(s.time || '—')}</td>${staffCell(s)}<td>${prioBadge(s.priority) || '<span class="muted small">Normal</span>'}</td><td>${statusSelect(s)}</td>${rowActions(s)}</tr>`).join('') || noRows(7)}</tbody></table></div></div>`;
  };

  /* ---------- Noturna ---------- */
  views.noturna = function () {
    const day = ui.day;
    const list = catList('noturna');
    const sched = S().services.filter((s) => s.cat === 'noturna' && s.days && day in s.days);
    const c = (k) => sched.filter((s) => s.days[day] === k).length;
    const done = c('concluida') + c('verificada');
    const sqm = sched.reduce((a, s) => a + Number(areaOf(s).sqm || 0), 0);
    return `${catHead('noturna', `<button class="btn" data-act="bulk-noturna">Gerar em massa</button>`)}
      ${dayChips()}
      <div class="kpis sm">${kpi('Agendadas · ' + fmtDay(day), sched.length, `${num(sqm)} m² a limpar`, CATS.noturna.color)}${kpi('Pendentes', c('pendente'))}${kpi('Concluídas', c('concluida'), '', '#16a34a')}${kpi('Verificadas', c('verificada'), '', '#0d9488')}${kpi('Não realizadas', c('nao_realizada'), `${pct(done, sched.length)}% feito ${bar(done, sched.length, CATS.noturna.color)}`, '#dc2626')}</div>
      <div class="card">${catToolbar('noturna')}${bulkBar('noturna', list, true)}
      <div class="table-wrap"><table class="tbl"><thead><tr><th class="cb"><input type="checkbox" data-act="sel-all" data-cat="noturna"></th><th>Stand / área</th><th class="r">m²</th><th>Noites</th><th>Equipa</th><th>Estado em ${fmtDay(day)}</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr>${selCell(s)}${areaCell(s)}<td class="r">${num(areaOf(s).sqm)}</td><td>${dayDots(s)}</td>${staffCell(s)}<td>${dayButtons(s, day)}${s.notes ? `<div class="muted small">📝 ${esc(s.notes)}</div>` : ''}</td>${rowActions(s)}</tr>`).join('') || noRows(7)}</tbody></table></div></div>`;
  };

  /* ---------- Apoio dedicado ---------- */
  views.dedicada = function () {
    const day = ui.day, f = filt('dedicada');
    if (f.onlyDay === undefined) f.onlyDay = false;
    const list = catList('dedicada');
    const active = S().services.filter((s) => s.cat === 'dedicada' && s.status !== 'cancelado');
    const today = active.filter((s) => (s.days || []).includes(day));
    const people = today.reduce((a, s) => a + Number(s.people || 0), 0);
    const alloc = today.reduce((a, s) => a + Math.min((s.staffIds || []).length, Number(s.people || 0)), 0);
    const hours = active.reduce((a, s) => a + dedTotalHours(s), 0);
    const cost = active.reduce((a, s) => a + dedTotalHours(s) * dedRate(s), 0);
    return `${catHead('dedicada')}
      ${dayChips()}
      <div class="kpis sm">${kpi('Stands com apoio · ' + fmtDay(day), today.length, '', CATS.dedicada.color)}${kpi('Pessoas necessárias', people, `${alloc} alocadas ${bar(alloc, people, CATS.dedicada.color)}`)}${kpi('Por confirmar', active.filter((s) => s.status === 'pedido').length, '', '#d97706')}${kpi('Horas contratadas (evento)', num(hours, 1) + ' h')}${kpi('Valor estimado', eur(cost), `${eur(withVat(cost))} c/ IVA`, '#16a34a')}</div>
      <div class="card">${catToolbar('dedicada', `<label class="check"><input type="checkbox" data-act="ded-onlyday" ${f.onlyDay ? 'checked' : ''}> Só ${fmtDay(day)}</label>`)}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Stand</th><th>Pessoas</th><th>Horário</th><th>Dias</th><th class="r">Horas</th><th class="r">Valor</th><th>Pessoal alocado</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map((s) => {
        const n = (s.staffIds || []).length, need = Number(s.people || 0);
        return `<tr>${areaCell(s)}<td><b>${need}</b></td><td class="nowrap">${esc(s.start)}–${esc(s.end)}</td><td class="small">${(s.days || []).map((d) => `<span class="mini-day ${d === day ? 'on' : ''}">${d.slice(8, 10)}/${d.slice(5, 7)}</span>`).join(' ')}</td>
          <td class="r">${num(dedTotalHours(s), 1)}</td><td class="r nowrap">${eur(dedTotalHours(s) * dedRate(s))}</td>
          <td class="small">${n ? esc(staffNames(s.staffIds).join(', ')) : ''} <span class="badge ${n >= need ? 't-green' : 't-amber'}">${n}/${need}</span></td><td>${statusSelect(s)}</td>${rowActions(s)}</tr>`;
      }).join('') || noRows(9)}</tbody></table></div></div>`;
  };

  /* ---------- Áreas comuns ---------- */
  views.comum = function () {
    const day = ui.day, list = catList('comum');
    const sched = S().services.filter((s) => s.cat === 'comum' && s.days && day in s.days);
    const rounds = sched.reduce((a, s) => a + roundsOn(s, day).length, 0);
    const late = sched.filter((s) => overdue(s));
    const done = sched.filter((s) => DONE.includes(s.days[day])).length;
    return `${catHead('comum', `<button class="btn" data-act="bulk-comum">Gerar para todas as áreas comuns</button>`)}
      ${dayChips()}
      <div class="kpis sm">${kpi('Áreas em manutenção', sched.length, fmtDay(day), CATS.comum.color)}${kpi('Rondas registadas', rounds, fmtDay(day))}${kpi('Rondas em atraso', late.length, day === todayISO() ? 'agora' : 'só calculado no próprio dia', late.length ? '#dc2626' : '#16a34a')}${kpi('Dia fechado', `${done}/${sched.length}`, bar(done, sched.length, CATS.comum.color), '#0d9488')}</div>
      <div class="card">${catToolbar('comum')}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Área</th><th>Frequência</th><th>Rondas em ${fmtDay(day)}</th><th>Equipa</th><th>Estado do dia</th><th></th></tr></thead>
      <tbody>${list.map((s) => {
        const rs = roundsOn(s, day), od = day === todayISO() ? overdue(s) : 0;
        return `<tr class="${od ? 'row-alert' : ''}">${areaCell(s)}<td class="small">${s.intervalMin || 120} min<div class="muted">${esc(s.start || S().settings.dayStart)}–${esc(s.end || S().settings.dayEnd)}</div></td>
          <td><b>${rs.length}</b> ${rs.length ? `<span class="muted small">última ${fmtTime(rs[rs.length - 1].ts)} (${esc(rs[rs.length - 1].by)})</span>` : '<span class="muted small">nenhuma</span>'}${od ? `<div><span class="badge t-red solid">Atraso ${od} min</span></div>` : ''}
            <div><button class="btn xs" data-act="round" data-id="${s.id}" data-day="${day}">+ Registar ronda</button></div></td>
          ${staffCell(s)}<td>${dayButtons(s, day)}</td>${rowActions(s)}</tr>`;
      }).join('') || noRows(6)}</tbody></table></div></div>`;
  };

  /* ---------- Orçamentos ---------- */
  views.orcamento = function () {
    const all = S().services.filter((s) => s.cat === 'orcamento');
    const list = catList('orcamento');
    const f = filt('orcamento');
    const pipeline = CATS.orcamento.statuses.map((k) => {
      const l = all.filter((s) => s.status === k);
      return `<button class="pipe ${f.status === k ? 'on' : ''}" data-act="pipe" data-st="${k}"><span class="muted small">${STATUS[k][0]}</span><b>${l.length}</b><span class="small">${eur(l.reduce((a, s) => a + Number(s.amount || 0), 0))}</span></button>`;
    }).join('<span class="pipe-arrow">›</span>');
    const approved = all.filter((s) => ['aprovado', 'em_execucao', 'concluido'].includes(s.status)).reduce((a, s) => a + Number(s.amount || 0), 0);
    const sent = all.filter((s) => s.status === 'enviado').reduce((a, s) => a + Number(s.amount || 0), 0);
    const decided = all.filter((s) => ['aprovado', 'em_execucao', 'concluido', 'recusado'].includes(s.status));
    const rate = pct(decided.filter((s) => s.status !== 'recusado').length, decided.length);
    return `${catHead('orcamento')}
      <div class="kpis sm">${kpi('Pedidos', all.length, '', CATS.orcamento.color)}${kpi('A aguardar cliente', eur(sent), 'orçamentos enviados', '#7c3aed')}${kpi('Aprovado (s/ IVA)', eur(approved), `${eur(withVat(approved))} c/ IVA`, '#16a34a')}${kpi('Taxa de aprovação', rate + '%', `${decided.length} decididos`)}</div>
      <div class="pipeline">${pipeline}</div>
      <div class="card">${catToolbar('orcamento')}
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Ref.</th><th>Stand</th><th>Trabalho</th><th>Data pretendida</th><th class="r">Valor s/ IVA</th><th class="r">c/ IVA</th><th>Estado</th><th></th></tr></thead>
      <tbody>${list.map((s) => `<tr><td class="mono small nowrap">${esc(s.ref || '—')}</td>${areaCell(s)}<td><b>${esc(s.title || '')}</b>${prioBadge(s.priority)}<div class="muted small clamp">${esc(s.scope || '')}</div></td><td>${fmtDay(s.date)}</td>
        <td class="r nowrap">${eur(s.amount)}</td><td class="r nowrap muted">${s.amount != null ? eur(withVat(s.amount)) : '—'}</td><td>${statusSelect(s)}${s.sentAt ? `<div class="muted small">enviado ${fmtTs(s.sentAt)}</div>` : ''}</td>${rowActions(s)}</tr>`).join('') || noRows(8)}</tbody></table></div></div>`;
  };

  /* ---------- Seleção em massa ---------- */
  function selCell(s) { return `<td class="cb"><input type="checkbox" data-act="sel" data-id="${s.id}" ${ui.selected.has(s.id) ? 'checked' : ''}></td>`; }
  function bulkBar(cat, list, daily) {
    const n = list.filter((s) => ui.selected.has(s.id)).length;
    if (!n) return '';
    const opts = daily ? ['pendente', 'concluida', 'verificada', 'nao_realizada'] : CATS[cat].statuses;
    return `<div class="bulkbar"><b>${n} selecionado(s)</b> · Marcar como ${opts.map((k) => `<button class="btn xs" data-act="bulk-status" data-cat="${cat}" data-st="${k}">${STATUS[k][0]}</button>`).join('')}
      <button class="btn xs" data-act="bulk-assign" data-cat="${cat}">Atribuir equipa…</button><button class="btn xs ghost" data-act="sel-clear">Limpar seleção</button></div>`;
  }

  /* ---------- Equipa ---------- */
  views.equipa = function () {
    const f = filt('equipa'), q = f.q.toLowerCase(), day = ui.day;
    let list = S().staff.slice().sort((a, b) => ROLES.indexOf(a.role) - ROLES.indexOf(b.role) || a.name.localeCompare(b.name));
    if (f.pav) list = list.filter((p) => p.pavilionId === f.pav);
    if (f.shift) list = list.filter((p) => p.shift === f.shift);
    if (q) list = list.filter((p) => [p.name, p.role, p.phone].join(' ').toLowerCase().includes(q));
    const load = (p) => S().services.filter((s) => (s.staffIds || []).includes(p.id) && isOpen(s));
    const busyDed = (p) => S().services.some((s) => s.cat === 'dedicada' && s.status !== 'cancelado' && (s.staffIds || []).includes(p.id) && (s.days || []).includes(day));
    const all = S().staff.filter((p) => p.active !== false);
    return `<div class="page-head"><div><h1>Equipa de limpeza</h1><div class="muted">Pessoas, funções, turnos e afetação por pavilhão.</div></div>
      <div class="actions"><button class="btn" data-act="export-staff">Exportar CSV</button><button class="btn primary" data-act="new-staff">+ Pessoa</button></div></div>
      <div class="kpis sm">${kpi('Pessoas ativas', all.length)}${SHIFTS.map((s) => kpi('Turno ' + s, all.filter((p) => p.shift === s).length)).join('')}${kpi('Em apoio dedicado · ' + fmtDay(day), all.filter(busyDed).length, '', CATS.dedicada.color)}</div>
      <div class="card"><div class="toolbar"><input type="search" placeholder="Pesquisar nome, função, telefone…" value="${esc(f.q)}" data-filter="equipa.q">
        <select data-filter="equipa.pav">${pavOptions(f.pav)}</select>
        <select data-filter="equipa.shift"><option value="">Todos os turnos</option>${SHIFTS.map((s) => `<option ${f.shift === s ? 'selected' : ''}>${s}</option>`).join('')}</select>${dayChips()}</div>
      <div class="table-wrap"><table class="tbl"><thead><tr><th>Nome</th><th>Função</th><th>Turno</th><th>Pavilhão</th><th>Telefone</th><th>Tarefas em aberto</th><th></th></tr></thead>
      <tbody>${list.map((p) => { const l = load(p); return `<tr class="${p.active === false ? 'inactive' : ''}"><td><b>${esc(p.name)}</b>${p.active === false ? ' <span class="badge t-gray">Inativo</span>' : ''}${busyDed(p) ? ' <span class="badge t-teal">Dedicado hoje</span>' : ''}${p.notes ? `<div class="muted small">${esc(p.notes)}</div>` : ''}</td><td>${esc(p.role)}</td><td>${esc(p.shift)}</td><td>${esc(p.pavilionId ? pavOf(p).name : 'Todos')}</td><td class="nowrap">${p.phone ? `<a href="tel:${esc(p.phone.replace(/\s/g, ''))}">${esc(p.phone)}</a>` : '—'}</td>
        <td>${l.length ? CAT_KEYS.map((c) => { const k = l.filter((s) => s.cat === c).length; return k ? `${catTag(c)} ${k}` : ''; }).join(' ') : '<span class="muted small">—</span>'}</td>
        <td class="r nowrap"><button class="icon-btn" data-act="edit-staff" data-id="${p.id}" title="Editar">✎</button></td></tr>`; }).join('') || noRows(7)}</tbody></table></div></div>`;
  };

  /* ---------- Relatórios ---------- */
  views.relatorios = function () {
    const st = S(), days = eventDays();
    const rows = st.pavilions.map((p) => {
      const ids = new Set(st.areas.filter((a) => a.pavilionId === p.id).map((a) => a.id));
      const sv = st.services.filter((s) => ids.has(s.areaId));
      const ab = sv.filter((s) => s.cat === 'abertura' && s.status !== 'cancelada');
      const nt = sv.filter((s) => s.cat === 'noturna');
      const ntExec = nt.reduce((a, s) => a + Object.keys(s.days || {}).length, 0);
      const ntDone = nt.reduce((a, s) => a + Object.values(s.days || {}).filter((v) => DONE.includes(v)).length, 0);
      const ntFail = nt.reduce((a, s) => a + Object.values(s.days || {}).filter((v) => v === 'nao_realizada').length, 0);
      const dd = sv.filter((s) => s.cat === 'dedicada' && s.status !== 'cancelado');
      const ddH = dd.reduce((a, s) => a + dedTotalHours(s), 0);
      const ddV = dd.reduce((a, s) => a + dedTotalHours(s) * dedRate(s), 0);
      const cm = sv.filter((s) => s.cat === 'comum');
      const cmR = cm.reduce((a, s) => a + (s.rounds || []).length, 0);
      const oq = sv.filter((s) => s.cat === 'orcamento');
      const oqV = oq.filter((s) => ['aprovado', 'em_execucao', 'concluido'].includes(s.status)).reduce((a, s) => a + Number(s.amount || 0), 0);
      return { p, ab: ab.length, abD: ab.filter((s) => DONE.includes(s.status)).length, ntExec, ntDone, ntFail, dd: dd.length, ddH, ddV, cm: cm.length, cmR, oq: oq.length, oqV };
    });
    const tot = rows.reduce((t, r) => { for (const k of Object.keys(r)) if (k !== 'p') t[k] = (t[k] || 0) + r[k]; return t; }, {});
    const tr = (r, name) => `<tr><td><b>${name}</b></td><td class="r">${r.abD}/${r.ab}</td><td class="r">${r.ntDone}/${r.ntExec}${r.ntFail ? ` <span class="badge t-red">${r.ntFail} falhas</span>` : ''}</td><td class="r">${r.dd}</td><td class="r">${num(r.ddH, 1)}</td><td class="r">${eur(r.ddV)}</td><td class="r">${r.cm}</td><td class="r">${r.cmR}</td><td class="r">${r.oq}</td><td class="r">${eur(r.oqV)}</td></tr>`;
    return `<div class="page-head"><div><h1>Relatórios e dados</h1><div class="muted">Resumo consolidado, exportações, relatório diário e cópias de segurança.</div></div></div>
      <div class="card"><div class="card-head"><h2>Resumo por pavilhão (todo o evento)</h2><button class="btn" data-act="print-summary">Imprimir</button></div>
      <div class="table-wrap"><table class="tbl" id="summary-tbl"><thead><tr><th>Pavilhão</th><th class="r">Abertura</th><th class="r">Noturna (execuções)</th><th class="r">Apoio dedicado</th><th class="r">Horas</th><th class="r">Valor dedicado</th><th class="r">Áreas comuns</th><th class="r">Rondas</th><th class="r">Orçamentos</th><th class="r">Aprovado</th></tr></thead>
      <tbody>${rows.map((r) => tr(r, esc(r.p.name))).join('')}</tbody><tfoot>${tr(tot, 'Total')}</tfoot></table></div>
      <p class="muted small">Valores sem IVA. Total estimado faturável (apoio dedicado + orçamentos aprovados): <b>${eur(tot.ddV + tot.oqV)}</b> · c/ IVA ${eur(withVat(tot.ddV + tot.oqV))}</p></div>
      <div class="two-col">
        <section class="card"><div class="card-head"><h2>Relatório diário</h2></div><p class="muted small">Folha de fecho do dia: noturnas, rondas, apoio dedicado, falhas e ocorrências — pronta a imprimir ou guardar em PDF.</p>
          <div class="chips">${days.map((d) => `<button class="chip" data-act="daily-report" data-day="${d}">${fmtDay(d)}</button>`).join('')}<button class="chip" data-act="daily-report" data-day="${st.settings.openingDate}">Abertura · ${fmtDay(st.settings.openingDate)}</button></div></section>
        <section class="card"><div class="card-head"><h2>Exportar CSV (Excel)</h2></div>
          <div class="btn-grid">${CAT_KEYS.map((c) => `<button class="btn" data-act="export-csv" data-cat="${c}">${CATS[c].label}</button>`).join('')}<button class="btn" data-act="export-areas">Stands e áreas</button><button class="btn" data-act="export-staff">Equipa</button><button class="btn" data-act="export-log">Registo de atividade</button></div></section>
      </div>
      <div class="two-col">
        <section class="card"><div class="card-head"><h2>Cópia de segurança</h2></div><p class="muted small">Exporte toda a base de dados num ficheiro JSON e restaure-a noutro computador ou mais tarde. ${Store.mode === 'server' ? 'O servidor também cria cópias automáticas a cada 10 minutos em <code>data/backups</code>.' : ''}</p>
          <div class="btn-row"><button class="btn primary" data-act="backup">Descarregar cópia (JSON)</button><button class="btn" data-act="restore">Restaurar cópia…</button></div></section>
        <section class="card"><div class="card-head"><h2>Importar expositores</h2></div><p class="muted small">Carregue a lista oficial de expositores (CSV separado por ; ou ,). Os stands existentes com o mesmo código são atualizados. Pode criar automaticamente os serviços contratados.</p>
          <div class="btn-row"><button class="btn primary" data-act="import-areas">Importar CSV…</button><button class="btn" data-act="csv-template">Descarregar modelo</button></div></section>
      </div>`;
  };

  /* ---------- Registo ---------- */
  views.registo = function () {
    const f = filt('registo'), q = f.q.toLowerCase();
    let list = S().log.slice().reverse();
    if (q) list = list.filter((l) => (l.text + ' ' + l.by).toLowerCase().includes(q));
    const total = list.length;
    list = list.slice(0, 500);
    return `<div class="page-head"><div><h1>Registo de atividade</h1><div class="muted">Auditoria de todas as alterações (quem, quando, o quê).</div></div><div class="actions"><button class="btn" data-act="export-log">Exportar CSV</button></div></div>
      <div class="card"><div class="toolbar"><input type="search" placeholder="Pesquisar no registo…" value="${esc(f.q)}" data-filter="registo.q"><span class="muted small">${total} entradas${total > 500 ? ' (a mostrar as 500 mais recentes)' : ''}</span></div>
      <ul class="activity big">${list.map((l) => `<li><span class="muted small">${fmtTs(l.ts)} · <b>${esc(l.by)}</b></span><div>${esc(l.text)}</div></li>`).join('') || '<li class="muted">Sem registos</li>'}</ul></div>`;
  };

  /* ---------- Definições ---------- */
  views.definicoes = function () {
    const s = S().settings;
    const fld = (k, label, type = 'text', extra = '') => `<label class="fld"><span>${label}</span><input name="${k}" type="${type}" value="${esc(s[k] ?? '')}" ${extra}></label>`;
    return `<div class="page-head"><div><h1>Definições</h1><div class="muted">Evento, datas, horários, tarifas e pavilhões.</div></div></div>
      <form class="card form" id="settings-form">
        <div class="card-head"><h2>Evento</h2></div>
        <div class="grid3">${fld('eventName', 'Nome do evento')}${fld('venue', 'Local')}${fld('contractor', 'Empresa de limpeza')}
          ${fld('openingDate', 'Dia da limpeza de abertura', 'date')}${fld('eventStart', 'Primeiro dia do evento', 'date')}${fld('eventEnd', 'Último dia do evento', 'date')}
          ${fld('dayStart', 'Abertura de portas', 'time')}${fld('dayEnd', 'Fecho de portas', 'time')}${fld('nightStart', 'Início da limpeza noturna', 'time')}
          ${fld('hourlyRate', 'Tarifa/hora apoio dedicado (€)', 'number', 'step="0.01" min="0"')}${fld('vat', 'IVA (%)', 'number', 'step="1" min="0"')}</div>
        <div class="card-head"><h2>Pavilhões</h2></div>
        <div class="pav-settings">${S().pavilions.map((p) => `<div class="grid3"><label class="fld"><span>Nome · ${p.num}</span><input name="pav_name_${p.id}" value="${esc(p.name)}"></label><label class="fld"><span>Descrição / zona</span><input name="pav_desc_${p.id}" value="${esc(p.desc || '')}"></label><label class="fld"><span>Cor</span><input type="color" name="pav_color_${p.id}" value="${esc(p.color)}"></label></div>`).join('')}</div>
        <div class="btn-row"><button class="btn primary" type="submit">Guardar definições</button></div>
      </form>
      <div class="card danger-zone"><div class="card-head"><h2>Zona de risco</h2></div>
        <p class="muted small">Recomenda-se descarregar uma cópia de segurança antes de qualquer destas ações.</p>
        <div class="btn-row"><button class="btn" data-act="clear-ops">Limpar pedidos e rondas (mantém stands e equipa)</button><button class="btn" data-act="clear-all">Começar do zero (apaga tudo exceto pavilhões)</button><button class="btn danger" data-act="reset-demo">Repor dados de demonstração</button></div>
        <p class="muted small">Modo de armazenamento: <b>${Store.mode === 'server' ? 'Servidor partilhado (multi-utilizador)' : 'Local neste navegador'}</b></p></div>`;
  };

  /* ---------- Pesquisa global ---------- */
  views.pesquisa = function () {
    const q = ui.q.toLowerCase().trim();
    const areas = q ? S().areas.filter((a) => [a.code, a.name, a.contact, a.email, a.phone, a.location].join(' ').toLowerCase().includes(q)).sort(sortCode).slice(0, 100) : [];
    const svcs = q ? S().services.filter((s) => [s.title, s.notes, s.ref, s.scope, s.requester].join(' ').toLowerCase().includes(q)).slice(0, 100) : [];
    const staff = q ? S().staff.filter((p) => [p.name, p.phone].join(' ').toLowerCase().includes(q)) : [];
    return `<div class="page-head"><div><h1>Pesquisa: “${esc(ui.q)}”</h1><div class="muted">${areas.length} áreas · ${svcs.length} pedidos · ${staff.length} pessoas</div></div></div>
      <div class="card"><div class="card-head"><h2>Stands e áreas</h2></div><div class="table-wrap"><table class="tbl"><tbody>${areas.map((a) => `<tr class="clickable" data-act="area" data-id="${a.id}"><td class="mono">${esc(a.code)}</td><td><b>${esc(a.name)}</b></td><td>${esc(pavOf(a).name)}</td><td>${esc(a.contact || '')}</td></tr>`).join('') || `<tr><td>${empty('Sem resultados')}</td></tr>`}</tbody></table></div></div>
      ${svcs.length ? `<div class="card"><div class="card-head"><h2>Pedidos</h2></div><div class="table-wrap"><table class="tbl"><tbody>${svcs.map((s) => `<tr class="clickable" data-act="edit-svc" data-id="${s.id}"><td>${catTag(s.cat)}</td><td>${esc(areaOf(s).code)} ${esc(areaOf(s).name)}</td><td>${svcSummary(s)}</td><td>${badge(overall(s))}</td></tr>`).join('')}</tbody></table></div></div>` : ''}
      ${staff.length ? `<div class="card"><div class="card-head"><h2>Equipa</h2></div><div class="table-wrap"><table class="tbl"><tbody>${staff.map((p) => `<tr class="clickable" data-act="edit-staff" data-id="${p.id}"><td><b>${esc(p.name)}</b></td><td>${esc(p.role)}</td><td>${esc(p.phone || '')}</td></tr>`).join('')}</tbody></table></div></div>` : ''}`;
  };

  /* ================= Gaveta de detalhe de área ================= */
  function renderDrawer() {
    const el = $('#drawer'), bg = $('#drawer-bg');
    const a = ui.drawer && byId('areas', ui.drawer);
    if (!a) { el.classList.add('hidden'); bg.classList.add('hidden'); return; }
    const p = pavOf(a);
    const sv = S().services.filter((s) => s.areaId === a.id);
    const info = [['Pavilhão', p.name], ['Tipologia', a.type === 'comum' ? 'Área comum' : a.tier], ['Área', a.sqm ? num(a.sqm) + ' m²' : ''], ['Pavimento', a.floor], ['Localização', a.location], ['Contacto', a.contact], ['Telefone', a.phone], ['Email', a.email]]
      .filter((x) => x[1]).map(([k, v]) => `<div><span class="muted small">${k}</span><div>${k === 'Telefone' ? `<a href="tel:${esc(String(v).replace(/\s/g, ''))}">${esc(v)}</a>` : k === 'Email' ? `<a href="mailto:${esc(v)}">${esc(v)}</a>` : esc(v)}</div></div>`).join('');
    const sections = CAT_KEYS.map((c) => {
      const l = sv.filter((s) => s.cat === c);
      return `<section class="dsec"><div class="dsec-head">${catTag(c)}<b>${CATS[c].label}</b><button class="btn xs" data-act="new-svc" data-cat="${c}" data-area="${a.id}">+ Adicionar</button></div>
        ${l.map((s) => `<div class="svc-card"><div class="svc-top">${badge(overall(s))}${prioBadge(s.priority)}<span class="grow small">${svcSummary(s, ui.day)}</span><button class="icon-btn" data-act="edit-svc" data-id="${s.id}" title="Editar">✎</button></div>
          ${isDaily(s) ? `<div class="svc-days">${eventDays().filter((d) => s.days && d in s.days).map((d) => `<div class="svc-day"><span class="small">${fmtDay(d)}</span>${dayButtons(s, d)}${s.cat === 'comum' ? `<span class="muted small">${roundsOn(s, d).length} ronda(s)</span>` : ''}</div>`).join('')}</div>` : `<div class="svc-status">${statusSelect(s)}</div>`}
          ${s.cat === 'comum' ? `<button class="btn xs" data-act="round" data-id="${s.id}" data-day="${ui.day}">+ Registar ronda (${fmtDay(ui.day)})</button>` : ''}
          <div class="muted small">Equipa: ${esc(staffNames(s.staffIds).join(', ') || 'por atribuir')}${s.cat === 'dedicada' ? ` (${(s.staffIds || []).length}/${s.people})` : ''}</div>
          ${s.notes ? `<div class="small">📝 ${esc(s.notes)}</div>` : ''}</div>`).join('') || '<div class="muted small">Sem pedidos.</div>'}</section>`;
    }).join('');
    el.innerHTML = `<div class="drawer-head"><div><div class="mono muted">${esc(a.code)}</div><h2>${esc(a.name)}</h2></div><button class="icon-btn" data-act="close-drawer" aria-label="Fechar">✕</button></div>
      <div class="drawer-body"><div class="info-grid">${info}</div>${a.notes ? `<div class="note">📝 ${esc(a.notes)}</div>` : ''}
      <div class="btn-row"><button class="btn" data-act="edit-area" data-id="${a.id}">Editar dados</button><button class="btn" data-act="print-area" data-id="${a.id}">Imprimir ficha</button></div>
      ${dayChips()}${sections}</div>`;
    el.classList.remove('hidden'); bg.classList.remove('hidden');
  }

  /* ================= Modal ================= */
  let modalSubmit = null;
  function openModal(title, body, onSubmit, opts = {}) {
    modalSubmit = onSubmit;
    $('#modal-box').innerHTML = `<form id="modal-form" novalidate><div class="modal-head"><h2>${title}</h2><button type="button" class="icon-btn" data-act="close-modal" aria-label="Fechar">✕</button></div>
      <div class="modal-body">${body}</div>
      <div class="modal-foot">${opts.left || ''}<span class="grow"></span><button type="button" class="btn" data-act="close-modal">Cancelar</button>${onSubmit ? `<button class="btn primary" type="submit">${opts.submit || 'Guardar'}</button>` : ''}</div></form>`;
    $('#modal').classList.remove('hidden');
    const first = $('#modal-box').querySelector('input:not([type=hidden]):not([type=checkbox]),select,textarea');
    if (first && !opts.noFocus) setTimeout(() => first.focus(), 30);
  }
  function closeModal() { $('#modal').classList.add('hidden'); $('#modal-box').innerHTML = ''; modalSubmit = null; }
  function confirmBox(title, text, onYes, label = 'Confirmar') { openModal(title, `<p>${text}</p>`, () => { onYes(); return true; }, { submit: label, noFocus: true }); }

  const opt = (v, l, sel) => `<option value="${esc(v)}" ${String(v) === String(sel) ? 'selected' : ''}>${esc(l)}</option>`;
  function staffPicker(sel, pavId) {
    const list = S().staff.filter((p) => p.active !== false || (sel || []).includes(p.id))
      .sort((a, b) => (b.pavilionId === pavId) - (a.pavilionId === pavId) || a.name.localeCompare(b.name));
    return `<div class="picker">${list.map((p) => `<label class="check"><input type="checkbox" name="staff" value="${p.id}" ${(sel || []).includes(p.id) ? 'checked' : ''}> ${esc(p.name)} <span class="muted small">${esc(p.role)} · ${esc(p.shift)}${p.pavilionId ? ' · P' + pavOf(p).num : ''}</span></label>`).join('')}</div>`;
  }
  function daysPicker(name, sel, statusMap) {
    return `<div class="chips">${eventDays().map((d) => `<label class="chip check"><input type="checkbox" name="${name}" value="${d}" ${(statusMap ? d in (sel || {}) : (sel || []).includes(d)) ? 'checked' : ''}> ${fmtDay(d)}</label>`).join('')}</div>`;
  }

  /* ---------- Formulário de pedido ---------- */
  function svcForm(s, isNew) {
    const st = S(), c = s.cat, a = byId('areas', s.areaId);
    const areaOpts = st.pavilions.map((p) => `<optgroup label="${esc(p.name)}">${st.areas.filter((x) => x.pavilionId === p.id).sort(sortCode).map((x) => opt(x.id, `${x.code} · ${x.name}`, s.areaId)).join('')}</optgroup>`).join('');
    let specific = '';
    if (c === 'abertura') specific = `<div class="grid3"><label class="fld"><span>Data</span><input type="date" name="date" value="${esc(s.date || st.settings.openingDate)}"></label><label class="fld"><span>Hora prevista</span><input type="time" name="time" value="${esc(s.time || '20:00')}"></label><label class="fld"><span>Estado</span><select name="status">${CATS[c].statuses.map((k) => opt(k, STATUS[k][0], s.status)).join('')}</select></label></div>`;
    if (c === 'noturna') specific = `<label class="fld"><span>Noites contratadas</span>${daysPicker('days', s.days || Object.fromEntries(eventDays().map((d) => [d, 'pendente'])), true)}</label><div class="grid3"><label class="fld"><span>Início</span><input type="time" name="time" value="${esc(s.time || st.settings.nightStart)}"></label></div>`;
    if (c === 'comum') specific = `<label class="fld"><span>Dias de manutenção</span>${daysPicker('days', s.days || Object.fromEntries(eventDays().map((d) => [d, 'pendente'])), true)}</label>
      <div class="grid3"><label class="fld"><span>Intervalo entre rondas (min)</span><input type="number" min="10" step="5" name="intervalMin" value="${esc(s.intervalMin || (a && a.intervalHint) || 120)}"></label><label class="fld"><span>Início</span><input type="time" name="start" value="${esc(s.start || st.settings.dayStart)}"></label><label class="fld"><span>Fim</span><input type="time" name="end" value="${esc(s.end || st.settings.dayEnd)}"></label></div>`;
    if (c === 'dedicada') specific = `<div class="grid4"><label class="fld"><span>Nº de pessoas</span><input type="number" min="1" name="people" value="${esc(s.people || 1)}"></label><label class="fld"><span>Início</span><input type="time" name="start" value="${esc(s.start || '09:30')}"></label><label class="fld"><span>Fim</span><input type="time" name="end" value="${esc(s.end || '18:30')}"></label><label class="fld"><span>Tarifa €/h (vazio = ${eur(st.settings.hourlyRate)})</span><input type="number" step="0.01" min="0" name="rate" value="${esc(s.rate || '')}"></label></div>
      <label class="fld"><span>Dias</span>${daysPicker('days', s.days || eventDays(), false)}</label>
      <label class="fld"><span>Estado</span><select name="status">${CATS[c].statuses.map((k) => opt(k, STATUS[k][0], s.status)).join('')}</select></label>`;
    if (c === 'orcamento') specific = `<div class="grid3"><label class="fld"><span>Trabalho</span><input name="title" required value="${esc(s.title || '')}" placeholder="Ex.: Limpeza de alcatifa por injeção-extração"></label><label class="fld"><span>Ref. orçamento</span><input name="ref" value="${esc(s.ref || nextRef())}"></label><label class="fld"><span>Estado</span><select name="status">${CATS[c].statuses.map((k) => opt(k, STATUS[k][0], s.status)).join('')}</select></label></div>
      <label class="fld"><span>Âmbito / descrição técnica</span><textarea name="scope" rows="3">${esc(s.scope || '')}</textarea></label>
      <div class="grid3"><label class="fld"><span>Valor s/ IVA (€)</span><input type="number" step="0.01" min="0" name="amount" value="${esc(s.amount ?? '')}"></label><label class="fld"><span>Data pretendida</span><input type="date" name="date" value="${esc(s.date || '')}"></label><label class="fld"><span>Validade do orçamento</span><input type="date" name="validUntil" value="${esc(s.validUntil || '')}"></label></div>`;

    const hist = (s.history || []).slice().reverse().map((h) => `<li><span class="muted small">${fmtTs(h.ts)} · ${esc(h.by)}</span> ${esc(h.text)}</li>`).join('');
    return `
      ${isNew ? `<label class="fld"><span>Tipo de limpeza</span><div class="seg big">${CAT_KEYS.map((k) => `<button type="button" class="${k === c ? 'on' : ''}" style="--c:${CATS[k].color}" data-act="form-cat" data-cat="${k}">${CATS[k].short}</button>`).join('')}</div></label>` : `<div class="muted">${catTag(c)} ${CATS[c].desc}</div>`}
      <div class="grid2"><label class="fld"><span>Stand / área</span><select name="areaId" required><option value="">— escolher —</option>${areaOpts}</select></label>
      <label class="fld"><span>Prioridade</span><select name="priority">${Object.entries(PRIORITY).map(([k, v]) => opt(k, v[0], s.priority || 'normal')).join('')}</select></label></div>
      ${specific}
      <div class="grid2"><label class="fld"><span>Requerente (nome / contacto)</span><input name="requester" value="${esc(s.requester || (a && a.contact) || '')}"></label><label class="fld"><span>Observações</span><input name="notes" value="${esc(s.notes || '')}" placeholder="Acessos, materiais, cuidados especiais…"></label></div>
      <details class="fld" ${c === 'dedicada' || isNew ? 'open' : ''}><summary>Equipa atribuída (${(s.staffIds || []).length})</summary>${staffPicker(s.staffIds, a && a.pavilionId)}</details>
      ${hist ? `<details class="fld"><summary>Histórico (${(s.history || []).length})</summary><ul class="activity">${hist}</ul></details>` : ''}`;
  }
  function nextRef() {
    const y = (S().settings.eventStart || '2026').slice(0, 4);
    const n = S().services.filter((s) => s.cat === 'orcamento').reduce((m, s) => Math.max(m, Number(String(s.ref || '').split('-').pop()) || 100), 100);
    return `ORC-${y}-${n + 1}`;
  }

  function openSvc(s, isNew) {
    const title = isNew ? 'Novo pedido de limpeza' : `Editar · ${CATS[s.cat].label}`;
    openModal(title, svcForm(s, isNew), (fd) => {
      const o = isNew ? s : clone(byId('services', s.id) || s);
      const prev = clone(o);
      o.areaId = fd.get('areaId');
      if (!o.areaId) { toast('Escolha o stand ou área.', 'err'); return false; }
      o.priority = fd.get('priority');
      o.requester = fd.get('requester').trim();
      o.notes = fd.get('notes').trim();
      o.staffIds = fd.getAll('staff');
      const c = o.cat;
      if (c === 'abertura') { o.date = fd.get('date'); o.time = fd.get('time'); o.status = fd.get('status'); }
      if (c === 'noturna' || c === 'comum') {
        const sel = fd.getAll('days'); const d = {};
        sel.forEach((x) => (d[x] = (o.days && o.days[x]) || 'pendente'));
        o.days = d;
        if (!sel.length) { toast('Escolha pelo menos um dia.', 'err'); return false; }
      }
      if (c === 'noturna') o.time = fd.get('time');
      if (c === 'comum') { o.intervalMin = Number(fd.get('intervalMin')) || 120; o.start = fd.get('start'); o.end = fd.get('end'); o.rounds = o.rounds || []; }
      if (c === 'dedicada') {
        o.people = Math.max(1, Number(fd.get('people')) || 1); o.start = fd.get('start'); o.end = fd.get('end');
        o.rate = fd.get('rate') === '' ? null : Number(fd.get('rate')); o.days = fd.getAll('days'); o.status = fd.get('status');
        if (!o.days.length) { toast('Escolha pelo menos um dia.', 'err'); return false; }
      }
      if (c === 'orcamento') {
        o.title = fd.get('title').trim(); o.ref = fd.get('ref').trim(); o.scope = fd.get('scope').trim();
        o.amount = fd.get('amount') === '' ? null : Number(fd.get('amount')); o.date = fd.get('date'); o.validUntil = fd.get('validUntil');
        o.status = fd.get('status');
        if (!o.title) { toast('Indique o trabalho a orçamentar.', 'err'); return false; }
        if (o.status === 'enviado' && !o.sentAt) o.sentAt = Date.now();
      }
      let msg;
      if (isNew) { o.createdAt = Date.now(); msg = 'Pedido criado'; }
      else {
        const ch = [];
        if (prev.status !== o.status && o.status) ch.push(`estado → ${STATUS[o.status][0]}`);
        if (prev.amount !== o.amount && c === 'orcamento') ch.push(`valor → ${eur(o.amount)}`);
        if (JSON.stringify(prev.staffIds) !== JSON.stringify(o.staffIds)) ch.push(`equipa → ${staffNames(o.staffIds).join(', ') || 'nenhuma'}`);
        if (prev.priority !== o.priority) ch.push(`prioridade → ${PRIORITY[o.priority][0]}`);
        msg = ch.length ? 'Atualizado: ' + ch.join('; ') : 'Dados atualizados';
      }
      saveSvc(o, msg);
      toast(isNew ? 'Pedido criado' : 'Pedido atualizado');
      return true;
    }, { left: isNew ? '' : `<button type="button" class="btn danger ghost" data-act="del-svc" data-id="${s.id}">Eliminar</button>` });
  }

  function newSvc(cat = 'abertura', areaId = '') {
    const st = S().settings;
    const base = { id: uid('v'), cat, areaId, priority: 'normal', staffIds: [], history: [], notes: '', requester: '' };
    if (cat === 'abertura') Object.assign(base, { status: 'pendente', date: st.openingDate, time: '20:00' });
    if (cat === 'dedicada') Object.assign(base, { status: 'pedido', people: 1, start: '09:30', end: '18:30' });
    if (cat === 'orcamento') Object.assign(base, { status: 'pedido', amount: null });
    if (cat === 'comum') Object.assign(base, { rounds: [] });
    return base;
  }

  /* ---------- Formulário de área ---------- */
  function openArea(a, isNew) {
    const body = `<div class="grid3"><label class="fld"><span>Pavilhão</span><select name="pavilionId">${S().pavilions.map((p) => opt(p.id, p.name, a.pavilionId)).join('')}</select></label>
      <label class="fld"><span>Código do stand / área</span><input name="code" required value="${esc(a.code || '')}" placeholder="P1-A01"></label>
      <label class="fld"><span>Tipo</span><select name="type">${opt('stand', 'Stand / expositor', a.type)}${opt('comum', 'Área comum', a.type)}</select></label></div>
      <div class="grid3"><label class="fld"><span>Expositor / nome da área</span><input name="name" required value="${esc(a.name || '')}"></label>
      <label class="fld"><span>Tipologia</span><select name="tier">${TIERS.map((t) => opt(t, t, a.tier)).join('')}</select></label>
      <label class="fld"><span>Área (m²)</span><input type="number" min="0" name="sqm" value="${esc(a.sqm || '')}"></label></div>
      <div class="grid3"><label class="fld"><span>Pavimento</span><select name="floor">${FLOORS.map((t) => opt(t, t, a.floor)).join('')}</select></label>
      <label class="fld"><span>Localização</span><input name="location" value="${esc(a.location || '')}" placeholder="Ex.: Fila C, junto à entrada norte"></label>
      <label class="fld"><span>Pessoa de contacto</span><input name="contact" value="${esc(a.contact || '')}"></label></div>
      <div class="grid2"><label class="fld"><span>Telefone</span><input name="phone" type="tel" value="${esc(a.phone || '')}"></label><label class="fld"><span>Email</span><input name="email" type="email" value="${esc(a.email || '')}"></label></div>
      <label class="fld"><span>Notas (acessos, materiais sensíveis, horários)</span><textarea name="notes" rows="2">${esc(a.notes || '')}</textarea></label>`;
    openModal(isNew ? 'Novo stand / área' : 'Editar stand / área', body, (fd) => {
      const o = clone(a);
      for (const k of ['pavilionId', 'code', 'type', 'name', 'tier', 'floor', 'location', 'contact', 'phone', 'email', 'notes']) o[k] = String(fd.get(k) || '').trim();
      o.sqm = Number(fd.get('sqm')) || 0;
      if (!o.code || !o.name) { toast('Código e nome são obrigatórios.', 'err'); return false; }
      if (S().areas.some((x) => x.code.toLowerCase() === o.code.toLowerCase() && x.id !== o.id)) { toast('Já existe uma área com esse código.', 'err'); return false; }
      Store.apply([{ t: 'upsert', c: 'areas', item: o }, logOp(`${isNew ? 'Área criada' : 'Área atualizada'}: ${o.code} ${o.name}`)]).then(refresh);
      toast(isNew ? 'Área criada' : 'Área atualizada');
      if (isNew) { ui.pav = o.pavilionId; }
      return true;
    }, { left: isNew ? '' : `<button type="button" class="btn danger ghost" data-act="del-area" data-id="${a.id}">Eliminar</button>` });
  }

  /* ---------- Formulário de pessoa ---------- */
  function openStaff(p, isNew) {
    const body = `<div class="grid2"><label class="fld"><span>Nome</span><input name="name" required value="${esc(p.name || '')}"></label><label class="fld"><span>Telefone</span><input name="phone" type="tel" value="${esc(p.phone || '')}"></label></div>
      <div class="grid3"><label class="fld"><span>Função</span><select name="role">${ROLES.map((r) => opt(r, r, p.role)).join('')}</select></label>
      <label class="fld"><span>Turno</span><select name="shift">${SHIFTS.map((r) => opt(r, r, p.shift)).join('')}</select></label>
      <label class="fld"><span>Pavilhão</span><select name="pavilionId">${pavOptions(p.pavilionId, 'Todos / volante')}</select></label></div>
      <label class="fld"><span>Notas (certificações, equipamentos, línguas)</span><input name="notes" value="${esc(p.notes || '')}"></label>
      <label class="check"><input type="checkbox" name="active" ${p.active !== false ? 'checked' : ''}> Ativo</label>`;
    openModal(isNew ? 'Nova pessoa' : 'Editar pessoa', body, (fd) => {
      const o = clone(p);
      for (const k of ['name', 'phone', 'role', 'shift', 'pavilionId', 'notes']) o[k] = String(fd.get(k) || '').trim();
      o.active = !!fd.get('active');
      if (!o.name) { toast('Indique o nome.', 'err'); return false; }
      Store.apply([{ t: 'upsert', c: 'staff', item: o }, logOp(`${isNew ? 'Pessoa adicionada' : 'Pessoa atualizada'}: ${o.name}`)]).then(refresh);
      return true;
    }, { left: isNew ? '' : `<button type="button" class="btn danger ghost" data-act="del-staff" data-id="${p.id}">Eliminar</button>` });
  }

  /* ================= CSV ================= */
  function toCSV(rows) {
    return '﻿' + rows.map((r) => r.map((v) => { const s = String(v ?? ''); return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(';')).join('\r\n');
  }
  function download(name, content, type = 'text/csv;charset=utf-8') {
    const b = new Blob([content], { type }); const u = URL.createObjectURL(b);
    const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 2000);
  }
  function parseCSV(text) {
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const sep = (firstLine.match(/;/g) || []).length >= (firstLine.match(/,/g) || []).length ? ';' : ',';
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (q) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
      else if (ch === '"') q = true;
      else if (ch === sep) { row.push(cur); cur = ''; }
      else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cur); rows.push(row); row = []; cur = ''; }
      else cur += ch;
    }
    if (cur || row.length) { row.push(cur); rows.push(row); }
    return rows.filter((r) => r.some((c) => c.trim()));
  }
  const stamp = () => new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');

  function exportCat(cat) {
    const days = eventDays();
    const head = ['Categoria', 'Pavilhão', 'Código', 'Stand/área', 'Prioridade', 'Estado geral'];
    const extra = {
      abertura: ['Data', 'Hora'], noturna: ['Início'].concat(days.map(fmtDate)), comum: ['Intervalo (min)', 'Início', 'Fim', 'Total rondas'].concat(days.map((d) => 'Estado ' + fmtDate(d)), days.map((d) => 'Rondas ' + fmtDate(d))),
      dedicada: ['Pessoas', 'Início', 'Fim', 'Dias', 'Horas totais', 'Tarifa €/h', 'Valor s/ IVA', 'Pessoal alocado'], orcamento: ['Ref.', 'Trabalho', 'Âmbito', 'Data pretendida', 'Valor s/ IVA', 'Valor c/ IVA', 'Validade', 'Enviado em'],
    }[cat];
    const rows = [head.concat(extra, ['Equipa', 'Requerente', 'Observações', 'Atualizado'])];
    for (const s of S().services.filter((x) => x.cat === cat).sort((x, y) => sortCode(areaOf(x), areaOf(y)))) {
      const a = areaOf(s);
      const base = [CATS[cat].label, pavOf(a).name, a.code, a.name, PRIORITY[s.priority || 'normal'][0], STATUS[overall(s)][0]];
      let e = [];
      if (cat === 'abertura') e = [fmtDate(s.date), s.time];
      if (cat === 'noturna') e = [s.time].concat(days.map((d) => (s.days && s.days[d] ? STATUS[s.days[d]][0] : '')));
      if (cat === 'comum') e = [s.intervalMin, s.start, s.end, (s.rounds || []).length].concat(days.map((d) => (s.days && s.days[d] ? STATUS[s.days[d]][0] : '')), days.map((d) => roundsOn(s, d).length));
      if (cat === 'dedicada') e = [s.people, s.start, s.end, (s.days || []).map(fmtDate).join(', '), num(dedTotalHours(s), 1), dedRate(s), (dedTotalHours(s) * dedRate(s)).toFixed(2), `${(s.staffIds || []).length}/${s.people}`];
      if (cat === 'orcamento') e = [s.ref, s.title, s.scope, fmtDate(s.date), s.amount ?? '', s.amount != null ? withVat(s.amount).toFixed(2) : '', fmtDate(s.validUntil), s.sentAt ? fmtTs(s.sentAt) : ''];
      rows.push(base.concat(e, [staffNames(s.staffIds).join(', '), s.requester, s.notes, fmtTs(s.updatedAt)]));
    }
    download(`limpeza-${cat}-${stamp()}.csv`, toCSV(rows));
  }
  function exportAreas() {
    const rows = [['pavilhao', 'codigo', 'nome', 'tipo', 'tipologia', 'area_m2', 'pavimento', 'localizacao', 'contacto', 'telefone', 'email', 'notas']];
    S().areas.slice().sort(sortCode).forEach((a) => rows.push([pavOf(a).num, a.code, a.name, a.type, a.tier, a.sqm, a.floor, a.location, a.contact, a.phone, a.email, a.notes]));
    download(`stands-areas-${stamp()}.csv`, toCSV(rows));
  }
  function exportStaff() {
    const rows = [['Nome', 'Função', 'Turno', 'Pavilhão', 'Telefone', 'Ativo', 'Notas']];
    S().staff.forEach((p) => rows.push([p.name, p.role, p.shift, p.pavilionId ? pavOf(p).name : 'Todos', p.phone, p.active !== false ? 'Sim' : 'Não', p.notes]));
    download(`equipa-${stamp()}.csv`, toCSV(rows));
  }
  function exportLog() {
    const rows = [['Data/hora', 'Utilizador', 'Ação']];
    S().log.slice().reverse().forEach((l) => rows.push([new Date(l.ts).toLocaleString('pt-PT'), l.by, l.text]));
    download(`registo-${stamp()}.csv`, toCSV(rows));
  }

  function importAreas(text) {
    const rows = parseCSV(text);
    if (rows.length < 2) return toast('Ficheiro vazio ou inválido.', 'err');
    const norm = (h) => h.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const H = rows[0].map(norm);
    const col = (...names) => H.findIndex((h) => names.includes(h));
    const ix = { pav: col('pavilhao', 'pav', 'hall'), code: col('codigo', 'stand', 'code', 'ref'), name: col('nome', 'expositor', 'empresa', 'name'), type: col('tipo', 'type'), tier: col('tipologia', 'categoria', 'tier'), sqm: col('aream2', 'm2', 'area', 'sqm'), floor: col('pavimento', 'piso', 'floor'), loc: col('localizacao', 'local', 'location'), contact: col('contacto', 'contact', 'responsavel'), phone: col('telefone', 'phone', 'telemovel'), email: col('email'), notes: col('notas', 'notes', 'observacoes'), ab: col('abertura'), nt: col('noturna'), dd: col('dedicadapessoas', 'dedicada') };
    if (ix.code < 0 || ix.name < 0 || ix.pav < 0) return toast('O CSV precisa das colunas: pavilhao, codigo, nome.', 'err');
    const st = S(), ops = [];
    let created = 0, updated = 0, svcs = 0, skipped = 0;
    const yes = (v) => /^(s|sim|y|yes|1|x|true)$/i.test(String(v || '').trim());
    const findPav = (v) => { v = String(v || '').trim(); return st.pavilions.find((p) => String(p.num) === v.replace(/\D/g, '') || p.name.toLowerCase() === v.toLowerCase() || p.id === v); };
    const byCode = new Map(st.areas.map((a) => [a.code.toLowerCase(), a]));
    const g = (r, i) => (i >= 0 ? String(r[i] || '').trim() : '');
    for (const r of rows.slice(1)) {
      const p = findPav(g(r, ix.pav)), code = g(r, ix.code), name = g(r, ix.name);
      if (!p || !code || !name) { skipped++; continue; }
      const ex = byCode.get(code.toLowerCase());
      const a = ex ? clone(ex) : { id: uid('a'), floor: 'Alcatifa', tier: 'Startup', type: 'stand' };
      Object.assign(a, { pavilionId: p.id, code, name });
      const tp = g(r, ix.type).toLowerCase(); if (tp) a.type = tp.startsWith('com') || tp.startsWith('area') ? 'comum' : 'stand';
      const tier = g(r, ix.tier); if (tier) a.tier = TIERS.find((t) => t.toLowerCase() === tier.toLowerCase()) || tier;
      if (g(r, ix.sqm)) a.sqm = Number(g(r, ix.sqm).replace(',', '.')) || 0;
      for (const [k, i] of [['floor', ix.floor], ['location', ix.loc], ['contact', ix.contact], ['phone', ix.phone], ['email', ix.email], ['notes', ix.notes]]) if (g(r, i)) a[k] = g(r, i);
      ops.push({ t: 'upsert', c: 'areas', item: a }); byCode.set(code.toLowerCase(), a);
      ex ? updated++ : created++;
      const has = (c) => st.services.some((s) => s.cat === c && s.areaId === a.id) || ops.some((o) => o.c === 'services' && o.item.cat === c && o.item.areaId === a.id);
      const mkS = (c, extra) => { const s = Object.assign(newSvc(c, a.id), extra, { createdAt: Date.now(), updatedAt: Date.now(), requester: a.contact || '' }); s.history.push({ ts: Date.now(), by: who(), text: 'Criado por importação CSV' }); ops.push({ t: 'upsert', c: 'services', item: s }); svcs++; };
      if (ix.ab >= 0 && yes(r[ix.ab]) && !has('abertura')) mkS('abertura', {});
      if (ix.nt >= 0 && yes(r[ix.nt]) && !has('noturna')) mkS('noturna', { days: Object.fromEntries(eventDays().map((d) => [d, 'pendente'])), time: st.settings.nightStart });
      if (ix.dd >= 0 && Number(g(r, ix.dd)) > 0 && !has('dedicada')) mkS('dedicada', { people: Number(g(r, ix.dd)), days: eventDays() });
    }
    ops.push(logOp(`Importação CSV: ${created} áreas criadas, ${updated} atualizadas, ${svcs} serviços criados`));
    Store.apply(ops).then(refresh);
    toast(`Importação concluída: ${created} novas, ${updated} atualizadas, ${svcs} serviços${skipped ? `, ${skipped} linhas ignoradas` : ''}.`);
  }

  /* ================= Impressão ================= */
  function printHTML(title, html) {
    const st = S().settings;
    $('#print-area').innerHTML = `<div class="print-head"><div><b>${esc(st.eventName)}</b> · ${esc(st.venue)}</div><div>${esc(title)}</div><div class="muted small">Impresso em ${new Date().toLocaleString('pt-PT')} por ${esc(who())}</div></div>${html}`;
    setTimeout(() => window.print(), 50);
  }
  function printSheet(cat) {
    const list = catList(cat), day = ui.day, daily = CATS[cat].mode === 'daily';
    const groups = S().pavilions.map((p) => [p, list.filter((s) => areaOf(s).pavilionId === p.id)]).filter(([, l]) => l.length);
    const html = groups.map(([p, l]) => `<h2>${esc(p.name)} <small>(${l.length})</small></h2><table class="ptbl"><thead><tr><th style="width:24px">✓</th><th>Código</th><th>Stand / área</th><th>Detalhe</th><th>Equipa</th><th>Estado</th><th style="width:120px">Hora / rubrica</th></tr></thead><tbody>
      ${l.map((s) => `<tr><td><span class="box"></span></td><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}${areaOf(s).location ? `<br><small>${esc(areaOf(s).location)}</small>` : ''}</td><td>${svcSummary(s, day)}${s.notes ? `<br><small>${esc(s.notes)}</small>` : ''}</td><td>${esc(staffNames(s.staffIds).join(', '))}</td><td>${STATUS[daily ? s.days[day] : s.status][0]}</td><td></td></tr>`).join('')}</tbody></table>`).join('');
    printHTML(`Folha de trabalho · ${CATS[cat].label}${daily || cat === 'dedicada' ? ' · ' + fmtDay(day) : ''}`, html || '<p>Sem registos.</p>');
  }
  function printDaily(day) {
    const sv = S().services;
    const nt = sv.filter((s) => s.cat === 'noturna' && s.days && day in s.days);
    const cm = sv.filter((s) => s.cat === 'comum' && s.days && day in s.days);
    const dd = sv.filter((s) => s.cat === 'dedicada' && s.status !== 'cancelado' && (s.days || []).includes(day));
    const ab = sv.filter((s) => s.cat === 'abertura' && s.date === day);
    const oq = sv.filter((s) => s.cat === 'orcamento' && s.date === day);
    const cnt = (l, k) => l.filter((s) => s.days[day] === k).length;
    const fails = nt.concat(cm).filter((s) => s.days[day] === 'nao_realizada');
    const tbl = (rows, head) => `<table class="ptbl"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${head.length}">—</td></tr>`}</tbody></table>`;
    const html = `
      <div class="pkpis"><div><b>${nt.length}</b> noturnas · ${cnt(nt, 'concluida') + cnt(nt, 'verificada')} feitas · ${cnt(nt, 'nao_realizada')} falhas</div><div><b>${cm.length}</b> áreas comuns · ${cm.reduce((a, s) => a + roundsOn(s, day).length, 0)} rondas</div><div><b>${dd.reduce((a, s) => a + Number(s.people || 0), 0)}</b> pessoas em apoio dedicado (${dd.length} stands)</div><div><b>${ab.length}</b> limpezas de abertura · <b>${oq.length}</b> trabalhos orçamentados</div></div>
      ${fails.length ? `<h2>Não realizadas</h2>${tbl(fails.map((s) => `<tr><td>${CATS[s.cat].short}</td><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}</td><td>${esc(s.notes || '')}</td></tr>`), ['Tipo', 'Código', 'Área', 'Motivo / notas'])}` : ''}
      ${ab.length ? `<h2>Limpeza de abertura</h2>${tbl(ab.map((s) => `<tr><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}</td><td>${esc(s.time || '')}</td><td>${STATUS[s.status][0]}</td></tr>`), ['Código', 'Stand', 'Hora', 'Estado'])}` : ''}
      <h2>Áreas comuns — rondas</h2>${tbl(cm.map((s) => `<tr><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}</td><td>${roundsOn(s, day).length}</td><td>${roundsOn(s, day).map((r) => fmtTime(r.ts)).join(', ')}</td><td>${STATUS[s.days[day]][0]}</td></tr>`), ['Código', 'Área', 'Nº', 'Horas', 'Estado'])}
      <h2>Apoio dedicado</h2>${tbl(dd.map((s) => `<tr><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}</td><td>${s.people}</td><td>${esc(s.start)}–${esc(s.end)}</td><td>${esc(staffNames(s.staffIds).join(', '))}</td></tr>`), ['Código', 'Stand', 'Pessoas', 'Horário', 'Pessoal'])}
      <h2>Limpeza noturna</h2>${tbl(nt.map((s) => `<tr><td>${esc(areaOf(s).code)}</td><td>${esc(areaOf(s).name)}</td><td>${esc(staffNames(s.staffIds).join(', '))}</td><td>${STATUS[s.days[day]][0]}</td></tr>`), ['Código', 'Stand / área', 'Equipa', 'Estado'])}
      ${oq.length ? `<h2>Trabalhos orçamentados</h2>${tbl(oq.map((s) => `<tr><td>${esc(s.ref || '')}</td><td>${esc(areaOf(s).name)}</td><td>${esc(s.title || '')}</td><td>${eur(s.amount)}</td><td>${STATUS[s.status][0]}</td></tr>`), ['Ref.', 'Stand', 'Trabalho', 'Valor', 'Estado'])}` : ''}
      <div class="sign"><div>Supervisor: ____________________</div><div>Coordenação: ____________________</div></div>`;
    printHTML(`Relatório diário · ${fmtDay(day)}`, html);
  }
  function printArea(id) {
    const a = byId('areas', id), sv = S().services.filter((s) => s.areaId === id);
    printHTML(`Ficha de limpeza · ${a.code} ${a.name}`, `<p>${esc(pavOf(a).name)} · ${esc(a.tier || '')} · ${num(a.sqm)} m² · ${esc(a.floor || '')} ${a.location ? '· ' + esc(a.location) : ''}<br>Contacto: ${esc(a.contact || '—')} ${esc(a.phone || '')} ${esc(a.email || '')}</p>
      <table class="ptbl"><thead><tr><th>Serviço</th><th>Detalhe</th><th>Estado</th><th>Equipa</th></tr></thead><tbody>${sv.map((s) => `<tr><td>${CATS[s.cat].label}</td><td>${svcSummary(s)}${isDaily(s) ? '<br><small>' + Object.entries(s.days || {}).map(([d, v]) => `${fmtDay(d)}: ${STATUS[v][0]}`).join(' · ') + '</small>' : ''}</td><td>${STATUS[overall(s)][0]}</td><td>${esc(staffNames(s.staffIds).join(', '))}</td></tr>`).join('') || '<tr><td colspan="4">Sem serviços</td></tr>'}</tbody></table>`);
  }
  function printSummary() { printHTML('Resumo por pavilhão', $('#summary-tbl').outerHTML.replace('class="tbl"', 'class="ptbl"')); }

  /* ================= Ações ================= */
  const actions = {
    menu() { $('#sidebar').classList.toggle('open'); },
    day(d) { ui.day = d.day; refresh(); },
    'goto-pav'(d) { ui.pav = d.pav; location.hash = '#pavilhoes'; },
    'pav-tab'(d) { ui.pav = d.pav; render(); },
    area(d) { ui.drawer = d.id; renderDrawer(); },
    'close-drawer'() { ui.drawer = null; renderDrawer(); },
    'close-modal'() { closeModal(); },
    'new-svc'(d) {
      let cat = d.cat || (CATS[ui.route] ? ui.route : 'abertura');
      openSvc(newSvc(cat, d.area || ''), true);
    },
    'form-cat'(d) {
      const fd = new FormData($('#modal-form'));
      const s = newSvc(d.cat, fd.get('areaId') || '');
      s.priority = fd.get('priority'); s.requester = fd.get('requester'); s.notes = fd.get('notes'); s.staffIds = fd.getAll('staff');
      openSvc(s, true);
    },
    'edit-svc'(d) { const s = byId('services', d.id); if (s) openSvc(clone(s), false); },
    'del-svc'(d) {
      const s = byId('services', d.id); if (!s) return;
      const a = areaOf(s);
      confirmBox('Eliminar pedido', `Eliminar <b>${CATS[s.cat].label}</b> de <b>${esc(a.code)} ${esc(a.name)}</b>? Esta ação fica registada.`, () => {
        Store.apply([{ t: 'remove', c: 'services', id: s.id }, logOp(`${CATS[s.cat].short} · ${a.code} ${a.name}: pedido eliminado`)]).then(refresh);
        toast('Pedido eliminado');
      }, 'Eliminar');
    },
    'set-day'(d) {
      const s = clone(byId('services', d.id));
      if (!s.days || s.days[d.day] === d.st) return;
      s.days[d.day] = d.st;
      const go = (note) => { if (note) s.notes = (s.notes ? s.notes + ' | ' : '') + `${fmtDay(d.day)}: ${note}`; saveSvc(s, `${fmtDay(d.day)} → ${STATUS[d.st][0]}${note ? ' (' + note + ')' : ''}`); };
      if (d.st === 'nao_realizada') {
        openModal('Motivo da não realização', `<label class="fld"><span>Motivo</span><input name="why" placeholder="Ex.: stand fechado, sem acesso, material do expositor no chão…"></label>`, (fd) => { go(String(fd.get('why') || '').trim()); return true; }, { submit: 'Registar' });
      } else go();
    },
    round(d) {
      const s = clone(byId('services', d.id));
      const day = d.day || todayISO();
      if (!s.days || !(day in s.days)) return toast('Esta área não está agendada para esse dia.', 'err');
      const ts = day === todayISO() ? Date.now() : new Date(day + 'T' + nowHM() + ':00').getTime();
      (s.rounds = s.rounds || []).push({ id: uid('r'), ts, day, by: who() });
      saveSvc(s, `Ronda registada (${fmtDay(day)} ${fmtTime(ts)})`);
      toast(`Ronda registada às ${fmtTime(ts)}`);
    },
    'new-area'(d) { openArea({ id: uid('a'), pavilionId: d.pav || ui.pav, type: 'stand', tier: 'Startup', floor: 'Alcatifa' }, true); },
    'edit-area'(d) { openArea(clone(byId('areas', d.id)), false); },
    'del-area'(d) {
      const a = byId('areas', d.id); const n = S().services.filter((s) => s.areaId === a.id).length;
      confirmBox('Eliminar área', `Eliminar <b>${esc(a.code)} ${esc(a.name)}</b> e os seus <b>${n}</b> pedidos de limpeza?`, () => {
        const ops = S().services.filter((s) => s.areaId === a.id).map((s) => ({ t: 'remove', c: 'services', id: s.id }));
        ops.push({ t: 'remove', c: 'areas', id: a.id }, logOp(`Área eliminada: ${a.code} ${a.name} (${n} pedidos)`));
        ui.drawer = null; Store.apply(ops).then(refresh); renderDrawer();
      }, 'Eliminar');
    },
    'print-area'(d) { printArea(d.id); },
    'new-staff'() { openStaff({ id: uid('s'), role: 'Operador de limpeza', shift: 'Dia', pavilionId: '', active: true }, true); },
    'edit-staff'(d) { openStaff(clone(byId('staff', d.id)), false); },
    'del-staff'(d) {
      const p = byId('staff', d.id);
      confirmBox('Eliminar pessoa', `Eliminar <b>${esc(p.name)}</b>? Será removida(o) de todas as atribuições. Em alternativa, marque como inativa(o).`, () => {
        const ops = S().services.filter((s) => (s.staffIds || []).includes(p.id)).map((s) => { const c = clone(s); c.staffIds = c.staffIds.filter((x) => x !== p.id); return { t: 'upsert', c: 'services', item: c }; });
        ops.push({ t: 'remove', c: 'staff', id: p.id }, logOp(`Pessoa eliminada: ${p.name}`));
        Store.apply(ops).then(refresh);
      }, 'Eliminar');
    },
    sel(d, el) { el.checked ? ui.selected.add(d.id) : ui.selected.delete(d.id); render(); },
    'sel-all'(d, el) { catList(d.cat).forEach((s) => (el.checked ? ui.selected.add(s.id) : ui.selected.delete(s.id))); render(); },
    'sel-clear'() { ui.selected.clear(); render(); },
    'bulk-status'(d) {
      const list = catList(d.cat).filter((s) => ui.selected.has(s.id));
      const ops = [];
      for (const s0 of list) {
        const s = clone(s0);
        if (isDaily(s)) { if (!s.days || !(ui.day in s.days)) continue; s.days[ui.day] = d.st; ops.push(...svcOps(s, `${fmtDay(ui.day)} → ${STATUS[d.st][0]} (em massa)`)); }
        else { s.status = d.st; ops.push(...svcOps(s, `estado → ${STATUS[d.st][0]} (em massa)`)); }
      }
      ui.selected.clear();
      Store.apply(ops).then(refresh);
      toast(`${list.length} registo(s) atualizados`);
    },
    'bulk-assign'(d) {
      const list = catList(d.cat).filter((s) => ui.selected.has(s.id));
      openModal(`Atribuir equipa a ${list.length} registo(s)`, `<label class="check"><input type="checkbox" name="replace" checked> Substituir equipa atual (desmarque para acrescentar)</label>${staffPicker([], ui.f[d.cat] && ui.f[d.cat].pav)}`, (fd) => {
        const ids = fd.getAll('staff'), rep = !!fd.get('replace'); const ops = [];
        for (const s0 of list) { const s = clone(s0); s.staffIds = rep ? ids.slice() : [...new Set((s.staffIds || []).concat(ids))]; ops.push(...svcOps(s, `equipa → ${staffNames(s.staffIds).join(', ') || 'nenhuma'} (em massa)`)); }
        ui.selected.clear(); Store.apply(ops).then(refresh); toast('Equipa atribuída'); return true;
      });
    },
    'bulk-abertura'() {
      const st = S();
      const missing = st.areas.filter((a) => !st.services.some((s) => s.cat === 'abertura' && s.areaId === a.id));
      if (!missing.length) return toast('Todas as áreas já têm limpeza de abertura.');
      confirmBox('Gerar limpezas de abertura', `Criar <b>${missing.length}</b> pedidos de limpeza de abertura (${fmtDay(st.settings.openingDate)}) para os stands/áreas que ainda não têm?`, () => {
        const ops = missing.map((a) => { const s = Object.assign(newSvc('abertura', a.id), { createdAt: Date.now(), updatedAt: Date.now() }); s.history.push({ ts: Date.now(), by: who(), text: 'Criado em massa' }); return { t: 'upsert', c: 'services', item: s }; });
        ops.push(logOp(`Geradas ${missing.length} limpezas de abertura`));
        Store.apply(ops).then(refresh);
      }, 'Gerar');
    },
    'bulk-noturna'() {
      const st = S();
      const body = `<p class="muted small">Cria limpeza noturna para todos os stands/áreas escolhidos que ainda não a têm.</p>
        <div class="grid2"><label class="fld"><span>Pavilhão</span><select name="pav">${pavOptions('')}</select></label>
        <label class="fld"><span>Âmbito</span><select name="scope"><option value="all">Stands e áreas comuns</option><option value="stand">Só stands</option><option value="comum">Só áreas comuns</option></select></label></div>
        <label class="fld"><span>Tipologias (stands)</span><div class="chips">${TIERS.map((t) => `<label class="chip check"><input type="checkbox" name="tier" value="${t}" checked> ${t}</label>`).join('')}</div></label>
        <label class="fld"><span>Noites</span>${daysPicker('days', Object.fromEntries(eventDays().map((d) => [d, 1])), true)}</label>`;
      openModal('Gerar limpeza noturna em massa', body, (fd) => {
        const pav = fd.get('pav'), scope = fd.get('scope'), tiers = fd.getAll('tier'), days = fd.getAll('days');
        if (!days.length) { toast('Escolha as noites.', 'err'); return false; }
        const targets = st.areas.filter((a) => (!pav || a.pavilionId === pav) && (scope === 'all' || a.type === scope) && (a.type === 'comum' || tiers.includes(a.tier)) && !st.services.some((s) => s.cat === 'noturna' && s.areaId === a.id));
        const ops = targets.map((a) => { const s = Object.assign(newSvc('noturna', a.id), { days: Object.fromEntries(days.map((d) => [d, 'pendente'])), time: st.settings.nightStart, createdAt: Date.now(), updatedAt: Date.now() }); s.history.push({ ts: Date.now(), by: who(), text: 'Criado em massa' }); return { t: 'upsert', c: 'services', item: s }; });
        ops.push(logOp(`Geradas ${targets.length} limpezas noturnas`));
        Store.apply(ops).then(refresh); toast(`${targets.length} limpezas noturnas criadas`); return true;
      }, { submit: 'Gerar' });
    },
    'bulk-comum'() {
      const st = S();
      const targets = st.areas.filter((a) => a.type === 'comum' && !st.services.some((s) => s.cat === 'comum' && s.areaId === a.id));
      if (!targets.length) return toast('Todas as áreas comuns já têm plano de manutenção.');
      confirmBox('Gerar manutenção de áreas comuns', `Criar plano de rondas para <b>${targets.length}</b> áreas comuns em todos os dias do evento?`, () => {
        const ops = targets.map((a) => { const s = Object.assign(newSvc('comum', a.id), { days: Object.fromEntries(eventDays().map((d) => [d, 'pendente'])), intervalMin: a.intervalHint || 120, start: st.settings.dayStart, end: st.settings.dayEnd, createdAt: Date.now(), updatedAt: Date.now() }); return { t: 'upsert', c: 'services', item: s }; });
        ops.push(logOp(`Gerados ${targets.length} planos de áreas comuns`));
        Store.apply(ops).then(refresh);
      }, 'Gerar');
    },
    pipe(d) { const f = filt('orcamento'); f.status = f.status === d.st ? '' : d.st; render(); },
    'ded-onlyday'(d, el) { filt('dedicada').onlyDay = el.checked; render(); },
    'export-csv'(d) { exportCat(d.cat); },
    'export-areas'() { exportAreas(); },
    'export-staff'() { exportStaff(); },
    'export-log'() { exportLog(); },
    print(d) { printSheet(d.cat); },
    'print-summary'() { printSummary(); },
    'daily-report'(d) { printDaily(d.day); },
    backup() { download(`backup-limpeza-${stamp()}.json`, JSON.stringify(S(), null, 1), 'application/json'); toast('Cópia de segurança descarregada'); },
    restore() {
      pickFile('.json,application/json', (text) => {
        let data; try { data = JSON.parse(text); } catch (e) { return toast('Ficheiro JSON inválido.', 'err'); }
        if (!data || !Array.isArray(data.areas) || !Array.isArray(data.services)) return toast('Não parece uma cópia deste sistema.', 'err');
        confirmBox('Restaurar cópia', `Substituir TODOS os dados atuais pela cópia (${data.areas.length} áreas, ${data.services.length} pedidos)?`, () => {
          data.log = (data.log || []).concat([{ id: uid('l'), ts: Date.now(), by: who(), text: 'Base de dados restaurada a partir de cópia de segurança', ref: '' }]);
          Store.replace(data).then(() => { toast('Cópia restaurada'); refresh(); });
        }, 'Restaurar');
      });
    },
    'import-areas'() { pickFile('.csv,text/csv', importAreas); },
    'csv-template'() {
      download('modelo-expositores.csv', toCSV([['pavilhao', 'codigo', 'nome', 'tipo', 'tipologia', 'area_m2', 'pavimento', 'localizacao', 'contacto', 'telefone', 'email', 'notas', 'abertura', 'noturna', 'dedicada_pessoas'],
        ['1', 'P1-A01', 'Empresa Exemplo', 'stand', 'Startup', '4', 'Alcatifa', 'Fila A', 'Nome Apelido', '+351 910 000 000', 'ops@exemplo.com', '', 'sim', 'sim', '0'],
        ['3', 'P3-B02', 'Parceiro Exemplo', 'stand', 'Patrocinador', '120', 'Madeira', 'Fila B', 'Nome Apelido', '+351 920 000 000', 'eventos@exemplo.com', 'Ecrãs LED sensíveis', 'sim', 'sim', '2']]));
    },
    'clear-ops'() {
      confirmBox('Limpar pedidos', 'Apagar todos os pedidos de limpeza, rondas e histórico? Stands, áreas e equipa mantêm-se.', () => {
        const d = clone(S()); d.services = []; d.log = [{ id: uid('l'), ts: Date.now(), by: who(), text: 'Pedidos de limpeza apagados', ref: '' }];
        Store.replace(d).then(refresh);
      }, 'Apagar');
    },
    'clear-all'() {
      confirmBox('Começar do zero', 'Apagar stands, áreas, equipa e pedidos? Mantêm-se apenas os 5 pavilhões e as definições.', () => {
        const d = clone(S()); d.services = []; d.areas = []; d.staff = []; d.log = [{ id: uid('l'), ts: Date.now(), by: who(), text: 'Base de dados limpa', ref: '' }];
        Store.replace(d).then(refresh);
      }, 'Apagar tudo');
    },
    'reset-demo'() { confirmBox('Repor demonstração', 'Substituir todos os dados pelos dados de demonstração?', () => Store.replace(Seed.build()).then(refresh), 'Repor'); },
    user() {
      openModal('Operador atual', `<p class="muted small">O nome fica associado a todas as alterações no registo de atividade.</p><label class="fld"><span>O seu nome</span><input name="u" value="${esc(user())}" placeholder="Ex.: Supervisor P1 – Ana"></label>`, (fd) => {
        try { localStorage.setItem('wsc.user', String(fd.get('u') || '').trim()); } catch (e) { /* ignora */ }
        paintUser(); return true;
      });
    },
  };

  function pickFile(accept, cb) {
    const inp = $('#file-in'); inp.value = ''; inp.accept = accept;
    inp.onchange = () => { const f = inp.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => cb(String(r.result)); r.readAsText(f, 'utf-8'); };
    inp.click();
  }

  /* ================= Eventos ================= */
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) {
      if (e.target.id === 'modal') closeModal();
      return;
    }
    const a = el.dataset.act;
    if (!actions[a]) return;
    if (el.tagName === 'A') e.preventDefault();
    if (el.type === 'checkbox') { actions[a](el.dataset, el); return; }
    e.preventDefault();
    actions[a](el.dataset, el);
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.change === 'status') {
      const s = clone(byId('services', el.dataset.id)); const st = el.value;
      if (s.status === st) return;
      s.status = st; if (st === 'enviado' && !s.sentAt) s.sentAt = Date.now();
      saveSvc(s, `estado → ${STATUS[st][0]}`); toast(`Estado: ${STATUS[st][0]}`);
    } else if (el.dataset.filter && el.tagName === 'SELECT') {
      const [k, f] = el.dataset.filter.split('.'); filt(k)[f] = el.value; render();
    } else if (el.dataset.actChange === 'area-type') { ui.areaType = el.value; render(); }
  });
  let tmr;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (el.dataset.filter && el.tagName === 'INPUT') {
      const [k, f] = el.dataset.filter.split('.'); filt(k)[f] = el.value;
      clearTimeout(tmr); tmr = setTimeout(() => { const pos = el.selectionStart; render(); const n = $(`[data-filter="${k}.${f}"]`); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (er) { /* ignora */ } } }, 200);
    }
  });
  document.addEventListener('submit', (e) => {
    e.preventDefault();
    if (e.target.id === 'modal-form' && modalSubmit) { if (modalSubmit(new FormData(e.target)) !== false) closeModal(); }
    if (e.target.id === 'settings-form') saveSettings(new FormData(e.target));
    if (e.target.id === 'search-form') { ui.q = $('#search').value.trim(); if (ui.q) { if (location.hash === '#pesquisa') render(); else location.hash = '#pesquisa'; } }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('#modal').classList.contains('hidden')) closeModal(); else if (ui.drawer) actions['close-drawer'](); }
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); $('#search').focus(); }
  });

  function saveSettings(fd) {
    const patch = {};
    for (const k of ['eventName', 'venue', 'contractor', 'openingDate', 'eventStart', 'eventEnd', 'dayStart', 'dayEnd', 'nightStart']) patch[k] = String(fd.get(k) || '').trim();
    patch.hourlyRate = Number(fd.get('hourlyRate')) || 0; patch.vat = Number(fd.get('vat')) || 0;
    if (!patch.eventStart || !patch.eventEnd || patch.eventEnd < patch.eventStart) return toast('Datas do evento inválidas.', 'err');
    const ops = [{ t: 'settings', patch }];
    for (const p of S().pavilions) {
      const n = clone(p); n.name = String(fd.get('pav_name_' + p.id) || p.name).trim(); n.desc = String(fd.get('pav_desc_' + p.id) || '').trim(); n.color = fd.get('pav_color_' + p.id) || p.color;
      ops.push({ t: 'upsert', c: 'pavilions', item: n });
    }
    ops.push(logOp('Definições atualizadas'));
    Store.apply(ops).then(() => { if (!eventDays().includes(ui.day)) ui.day = defaultDay(); refresh(); });
    toast('Definições guardadas');
  }

  /* ================= Render ================= */
  function toast(msg, kind = 'ok') {
    const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = msg;
    $('#toasts').appendChild(t); setTimeout(() => t.classList.add('out'), 2600); setTimeout(() => t.remove(), 3000);
  }
  function paintUser() { const u = user(); $('#user-chip').innerHTML = `<span class="avatar">${esc((u || '?').slice(0, 1).toUpperCase())}</span><span class="uname">${esc(u || 'Identificar-me')}</span>`; }
  function paintSync() {
    const el = $('#sync');
    if (Store.mode === 'local') el.innerHTML = `<span class="sdot gray"></span>Modo local (este navegador)`;
    else el.innerHTML = Store.sync === 'ok' ? `<span class="sdot green"></span>Sincronizado ${Store.lastSync ? fmtTime(Store.lastSync) : ''}` : `<span class="sdot red"></span>Offline — alterações em fila`;
  }
  function render() {
    const v = views[ui.route] || views.painel;
    const scroll = window.scrollY;
    $('#view').innerHTML = v();
    window.scrollTo(0, scroll);
    $$('#nav a').forEach((a) => a.classList.toggle('on', a.dataset.route === ui.route || (ui.route === 'pavilhoes' && a.dataset.route === 'pavilhoes')));
    $('#brand-sub').textContent = S().settings.eventName + ' · Lisboa';
    document.title = `${({ painel: 'Painel', pavilhoes: 'Pavilhões', equipa: 'Equipa', relatorios: 'Relatórios', registo: 'Registo', definicoes: 'Definições', pesquisa: 'Pesquisa' })[ui.route] || CATS[ui.route]?.short || ''} · Gestão de Limpeza`;
  }
  function refresh() { render(); renderDrawer(); paintSync(); }

  function route() {
    const h = location.hash.replace('#', '') || 'painel';
    ui.route = views[h] ? h : 'painel';
    if (ui.route !== 'pesquisa') { $('#search').value = ''; }
    $('#sidebar').classList.remove('open');
    ui.selected.clear();
    render();
    window.scrollTo(0, 0);
  }

  Store.on((what) => {
    if (what === 'sync') return paintSync();
    const ae = document.activeElement;
    if (ae && $('#view').contains(ae) && /INPUT|TEXTAREA/.test(ae.tagName)) { paintSync(); return; }
    if (!eventDays().includes(ui.day)) ui.day = defaultDay();
    refresh();
  });

  window.addEventListener('hashchange', route);
  Store.init(Seed.build).then(() => {
    ui.day = defaultDay();
    paintUser(); paintSync(); route();
    setInterval(() => { if (['painel', 'comum'].includes(ui.route)) render(); }, 60000);
    if (!user()) setTimeout(() => actions.user(), 400);
  });
})();
