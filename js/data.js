/* Constantes do domínio e gerador de dados de demonstração */
(function () {
  'use strict';

  const CATS = {
    abertura: {
      key: 'abertura', label: 'Limpeza de abertura', short: 'Abertura', color: '#2563eb', mode: 'single',
      desc: 'Limpeza final pós-montagem de stands e áreas, antes da abertura de portas.',
      statuses: ['pendente', 'em_curso', 'concluida', 'verificada', 'cancelada'],
    },
    noturna: {
      key: 'noturna', label: 'Limpeza noturna', short: 'Noturna', color: '#7c3aed', mode: 'daily',
      desc: 'Limpeza após o fecho de portas, em cada noite dos dias de evento.',
      statuses: ['pendente', 'concluida', 'verificada', 'nao_realizada'],
    },
    dedicada: {
      key: 'dedicada', label: 'Apoio dedicado ao stand', short: 'Dedicada', color: '#0891b2', mode: 'single',
      desc: 'Pessoas de limpeza alocadas em exclusivo a um stand durante o horário do evento.',
      statuses: ['pedido', 'confirmado', 'em_curso', 'concluido', 'cancelado'],
    },
    comum: {
      key: 'comum', label: 'Áreas comuns', short: 'Comuns', color: '#059669', mode: 'daily',
      desc: 'Manutenção contínua de WC, corredores, restauração, palcos e acessos, com registo de rondas.',
      statuses: ['pendente', 'concluida', 'verificada', 'nao_realizada'],
    },
    orcamento: {
      key: 'orcamento', label: 'Limpezas com orçamento', short: 'Orçamentos', color: '#d97706', mode: 'single',
      desc: 'Pedidos especiais que exigem orçamento e aprovação antes da execução.',
      statuses: ['pedido', 'em_orcamentacao', 'enviado', 'aprovado', 'recusado', 'em_execucao', 'concluido'],
    },
  };

  // [rótulo, tom de cor]
  const STATUS = {
    pendente: ['Pendente', 'gray'],
    em_curso: ['Em curso', 'blue'],
    concluida: ['Concluída', 'green'],
    verificada: ['Verificada', 'teal'],
    cancelada: ['Cancelada', 'red'],
    nao_realizada: ['Não realizada', 'red'],
    pedido: ['Pedido', 'gray'],
    confirmado: ['Confirmado', 'blue'],
    concluido: ['Concluído', 'green'],
    cancelado: ['Cancelado', 'red'],
    em_orcamentacao: ['Em orçamentação', 'amber'],
    enviado: ['Orçamento enviado', 'purple'],
    aprovado: ['Aprovado', 'blue'],
    recusado: ['Recusado', 'red'],
    em_execucao: ['Em execução', 'amber'],
  };
  const DONE = ['concluida', 'verificada', 'concluido'];
  const CLOSED = ['concluida', 'verificada', 'concluido', 'cancelada', 'cancelado', 'recusado'];

  const PRIORITY = { normal: ['Normal', 'gray'], alta: ['Alta', 'amber'], urgente: ['Urgente', 'red'] };
  const TIERS = ['Startup', 'Parceiro', 'Patrocinador', 'Media', 'Organização'];
  const FLOORS = ['Alcatifa', 'Vinil', 'Madeira', 'Betão', 'Outro'];
  const ROLES = ['Coordenador geral', 'Supervisor', 'Chefe de equipa', 'Operador de limpeza', 'Operador de máquina'];
  const SHIFTS = ['Dia', 'Noite', 'Abertura', 'Misto'];

  /* ---------- Dados de demonstração (fictícios) ---------- */
  function rng(seed) {
    return function () {
      seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function addDays(iso, n) {
    const d = new Date(iso + 'T12:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }
  function daysBetween(a, b) {
    const out = [];
    for (let d = a; d <= b; d = addDays(d, 1)) { out.push(d); if (out.length > 60) break; }
    return out;
  }

  function build() {
    const r = rng(2026);
    const pick = (arr) => arr[Math.floor(r() * arr.length)];
    const between = (a, b) => Math.round(a + r() * (b - a));
    let n = 0;
    const id = (p) => p + '_' + (++n).toString(36) + Math.floor(r() * 1e6).toString(36);
    const now = Date.now();

    const settings = {
      eventName: 'Web Summit 2026',
      venue: 'Altice Arena & FIL · Parque das Nações, Lisboa',
      openingDate: '2026-11-09',
      eventStart: '2026-11-10',
      eventEnd: '2026-11-13',
      hourlyRate: 15.5,
      vat: 23,
      dayStart: '08:00',
      dayEnd: '20:00',
      nightStart: '20:30',
      contractor: 'Empresa de limpeza (a definir)',
    };
    const days = daysBetween(settings.eventStart, settings.eventEnd);

    const pavilions = [
      { id: 'p1', num: 1, name: 'Pavilhão 1', desc: 'Startups ALPHA · Fintech & SaaS', color: '#2563eb' },
      { id: 'p2', num: 2, name: 'Pavilhão 2', desc: 'Startups BETA & GROWTH · Mobilidade e Energia', color: '#7c3aed' },
      { id: 'p3', num: 3, name: 'Pavilhão 3', desc: 'Parceiros e Patrocinadores', color: '#0891b2' },
      { id: 'p4', num: 4, name: 'Pavilhão 4', desc: 'Investidores, Media e Food Summit', color: '#059669' },
      { id: 'p5', num: 5, name: 'Pavilhão 5', desc: 'Arena · Centre Stage e zonas VIP', color: '#d97706' },
    ];

    const pre = ['Nova', 'Blue', 'Quantum', 'Lusa', 'Atlântico', 'Pixel', 'Data', 'Cloud', 'Green', 'Smart', 'Neo', 'Vertex', 'Orbit', 'Tejo', 'Alfa', 'Brisa', 'Farol', 'Onda', 'Kappa', 'Delta'];
    const suf = ['Labs', 'AI', 'Tech', 'Systems', 'Health', 'Pay', 'Mobility', 'Energy', 'Robotics', 'Analytics', 'Ventures', 'Security', 'Cloud', 'Foods', 'Studio'];
    const first = ['Ana', 'João', 'Maria', 'Pedro', 'Rita', 'Tiago', 'Sofia', 'Miguel', 'Inês', 'Rui', 'Carla', 'Bruno', 'Marta', 'Nuno', 'Joana', 'Paulo', 'Sandra', 'Hugo', 'Cláudia', 'Diogo', 'Fátima', 'Luís', 'Patrícia', 'André'];
    const last = ['Silva', 'Santos', 'Ferreira', 'Pereira', 'Oliveira', 'Costa', 'Rodrigues', 'Martins', 'Sousa', 'Fernandes', 'Gonçalves', 'Gomes', 'Lopes', 'Marques', 'Almeida', 'Ribeiro', 'Pinto', 'Carvalho', 'Teixeira', 'Moreira'];
    const person = () => pick(first) + ' ' + pick(last);
    const usedNames = new Set();
    const company = () => {
      let c; do { c = pick(pre) + pick(suf); } while (usedNames.has(c)); usedNames.add(c); return c;
    };

    const tierByPav = {
      p1: ['Startup', 'Startup', 'Startup', 'Startup', 'Parceiro'],
      p2: ['Startup', 'Startup', 'Startup', 'Parceiro'],
      p3: ['Parceiro', 'Parceiro', 'Patrocinador', 'Patrocinador'],
      p4: ['Parceiro', 'Media', 'Media', 'Startup', 'Organização'],
      p5: ['Patrocinador', 'Parceiro', 'Media'],
    };
    const sizeByTier = { Startup: [4, 6], Parceiro: [18, 60], Patrocinador: [80, 220], Media: [9, 24], 'Organização': [20, 80] };
    const rows = 'ABCDEFGH';

    const areas = [];
    for (const p of pavilions) {
      const count = p.id === 'p5' ? 12 : p.id === 'p3' ? 18 : 24;
      for (let i = 0; i < count; i++) {
        const tier = pick(tierByPav[p.id]);
        const [a, b] = sizeByTier[tier];
        const name = company();
        areas.push({
          id: id('a'), pavilionId: p.id, type: 'stand',
          code: `P${p.num}-${rows[Math.floor(i / 6)]}${String((i % 6) + 1).padStart(2, '0')}`,
          name, tier, sqm: between(a, b), floor: pick(['Alcatifa', 'Alcatifa', 'Vinil', 'Madeira']),
          location: `Fila ${rows[Math.floor(i / 6)]}`,
          contact: person(), phone: '+351 9' + between(10000000, 69999999), email: 'ops@' + name.toLowerCase() + '.com',
          notes: '',
        });
      }
      const commons = [
        ['WC', 'Instalações sanitárias (M/F/Acessível)', 'Betão', 90, 60],
        ['CIR', 'Corredores e circulação', 'Betão', 2400, 180],
        ['ENT', 'Entradas, acessos e controlo', 'Betão', 600, 120],
        ['FOOD', 'Zona de restauração', 'Vinil', 800, 60],
        ['STG', 'Palco / auditório', 'Alcatifa', 500, 180],
        ['LNG', 'Lounge e zona de descanso', 'Alcatifa', 300, 120],
      ];
      if (p.id === 'p5') {
        commons.push(['PRS', 'Sala de imprensa', 'Alcatifa', 250, 120]);
        commons.push(['BKS', 'Backstage e camarins', 'Vinil', 300, 120]);
      }
      for (const [code, name, floor, sqm, interval] of commons) {
        areas.push({
          id: id('a'), pavilionId: p.id, type: 'comum', code: `P${p.num}-${code}`, name, tier: 'Organização',
          sqm, floor, location: '', contact: '', phone: '', email: '', notes: '', intervalHint: interval,
        });
      }
    }

    const staff = [];
    staff.push({ id: id('s'), name: person(), role: 'Coordenador geral', shift: 'Misto', pavilionId: '', phone: '+351 912 000 001', active: true, notes: '' });
    for (const p of pavilions) {
      staff.push({ id: id('s'), name: person(), role: 'Supervisor', shift: 'Dia', pavilionId: p.id, phone: '+351 91' + between(1000000, 9999999), active: true, notes: '' });
      staff.push({ id: id('s'), name: person(), role: 'Chefe de equipa', shift: 'Noite', pavilionId: p.id, phone: '+351 93' + between(1000000, 9999999), active: true, notes: '' });
      for (let i = 0; i < 6; i++) {
        staff.push({ id: id('s'), name: person(), role: 'Operador de limpeza', shift: i < 3 ? 'Dia' : 'Noite', pavilionId: p.id, phone: '+351 96' + between(1000000, 9999999), active: true, notes: '' });
      }
    }
    for (let i = 0; i < 3; i++) staff.push({ id: id('s'), name: person(), role: 'Operador de máquina', shift: 'Noite', pavilionId: '', phone: '+351 92' + between(1000000, 9999999), active: true, notes: 'Lavadora/secadora e injeção-extração' });
    const staffOf = (pid, shift) => staff.filter((s) => s.pavilionId === pid && s.shift === shift && s.role === 'Operador de limpeza');

    const services = [];
    let dedIdx = 0;
    const mk = (o) => {
      const s = Object.assign({
        id: id('v'), priority: 'normal', staffIds: [], requester: '', notes: '', history: [],
        createdAt: now - between(2, 20) * 86400000, updatedAt: now - between(0, 2) * 86400000,
      }, o);
      s.history.push({ ts: s.createdAt, by: 'Sistema', text: 'Pedido criado (dados de demonstração)' });
      services.push(s);
      return s;
    };

    for (const a of areas) {
      const isStand = a.type === 'stand';
      // Abertura: todos
      mk({
        cat: 'abertura', areaId: a.id, status: pick(['pendente', 'pendente', 'pendente', 'em_curso', 'concluida', 'verificada']),
        date: settings.openingDate, time: pick(['18:00', '20:00', '22:00', '06:00']),
        priority: a.tier === 'Patrocinador' ? 'alta' : 'normal', staffIds: [pick(staffOf(a.pavilionId, 'Noite')).id],
      });
      if (isStand && r() < 0.6) {
        const d = {};
        days.forEach((day, i) => { d[day] = i === 0 ? pick(['pendente', 'concluida', 'verificada']) : 'pendente'; });
        mk({ cat: 'noturna', areaId: a.id, days: d, time: settings.nightStart, staffIds: [pick(staffOf(a.pavilionId, 'Noite')).id], requester: a.contact });
      }
      if (!isStand) {
        const d = {}; days.forEach((day) => (d[day] = 'pendente'));
        mk({ cat: 'noturna', areaId: a.id, days: d, time: settings.nightStart, staffIds: staffOf(a.pavilionId, 'Noite').slice(0, 2).map((s) => s.id) });
        const d2 = {}; days.forEach((day, i) => (d2[day] = i === 0 ? pick(['pendente', 'concluida']) : 'pendente'));
        mk({
          cat: 'comum', areaId: a.id, days: d2, intervalMin: a.intervalHint || 120, start: settings.dayStart, end: settings.dayEnd,
          staffIds: staffOf(a.pavilionId, 'Dia').slice(0, a.code.endsWith('WC') ? 2 : 1).map((s) => s.id), rounds: [],
          priority: a.code.endsWith('WC') ? 'alta' : 'normal',
        });
      }
      if (isStand && (a.tier === 'Patrocinador' || (a.tier === 'Parceiro' && r() < 0.25))) {
        const people = a.tier === 'Patrocinador' ? between(1, 2) : 1;
        const status = pick(['pedido', 'confirmado', 'confirmado', 'confirmado']);
        const pool = staffOf(a.pavilionId, 'Dia');
        const staffIds = status === 'confirmado' && r() < 0.8 ? pool.slice(dedIdx % pool.length).concat(pool).slice(0, people).map((s) => s.id) : [];
        dedIdx++;
        mk({
          cat: 'dedicada', areaId: a.id, status, people,
          start: '09:30', end: '18:30', days: days.slice(), staffIds, requester: a.contact,
          priority: a.tier === 'Patrocinador' ? 'alta' : 'normal',
        });
      }
    }

    const quoteJobs = [
      ['Limpeza de alcatifa por injeção-extração', 380, 1400],
      ['Limpeza de vidros e estruturas em altura (plataforma)', 450, 1800],
      ['Remoção de resíduos volumosos de montagem', 220, 900],
      ['Limpeza e higienização pós-catering / evento privado', 300, 1200],
      ['Polimento de pavimento em madeira', 260, 950],
      ['Limpeza de LED wall e ecrãs de grande formato', 180, 600],
      ['Limpeza de stand de dois pisos (mezzanine)', 520, 2100],
      ['Desinfeção de zona de demonstração alimentar', 150, 480],
    ];
    const qStatuses = ['pedido', 'pedido', 'em_orcamentacao', 'em_orcamentacao', 'enviado', 'enviado', 'enviado', 'aprovado', 'aprovado', 'recusado', 'em_execucao', 'concluido'];
    const qAreas = areas.filter((a) => a.type === 'stand' && a.tier !== 'Startup');
    for (let i = 0; i < 12; i++) {
      const [title, lo, hi] = pick(quoteJobs);
      const st = qStatuses[i];
      const a = pick(qAreas);
      mk({
        cat: 'orcamento', areaId: a.id, status: st, title, scope: title + '. Executar fora do horário de abertura ao público.',
        amount: st === 'pedido' ? null : between(lo, hi), ref: 'ORC-2026-' + String(101 + i),
        date: pick([settings.openingDate].concat(days)), validUntil: settings.eventStart, requester: a.contact,
        priority: pick(['normal', 'normal', 'alta']),
        sentAt: ['enviado', 'aprovado', 'recusado', 'em_execucao', 'concluido'].includes(st) ? now - between(1, 5) * 86400000 : null,
      });
    }

    const log = [{ id: id('l'), ts: now, by: 'Sistema', text: 'Base de dados inicializada com dados de demonstração', ref: '' }];
    return { version: 1, settings, pavilions, areas, staff, services, log };
  }

  window.WSC = { CATS, STATUS, DONE, CLOSED, PRIORITY, TIERS, FLOORS, ROLES, SHIFTS, Seed: { build }, util: { addDays, daysBetween } };
})();
