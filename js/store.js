/* Persistência: modo servidor (multi-utilizador, com fila offline) ou modo local (localStorage) */
(function () {
  'use strict';
  const KEY = 'wsc.state.v1';
  const QKEY = 'wsc.queue.v1';
  const subs = [];
  const Store = { state: null, mode: 'local', rev: 0, sync: 'ok', lastSync: null };
  let queue = [];
  let chain = Promise.resolve();

  const ls = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  };

  Store.on = (fn) => subs.push(fn);
  const emit = (remote) => subs.forEach((f) => { try { f(remote); } catch (e) { console.error(e); } });
  const setSync = (s) => { Store.sync = s; if (s === 'ok') Store.lastSync = Date.now(); emit('sync'); };

  function normalize(st) {
    for (const k of ['pavilions', 'areas', 'staff', 'services', 'log']) if (!Array.isArray(st[k])) st[k] = [];
    st.settings = st.settings || {};
    return st;
  }

  function applyLocal(ops) {
    const st = Store.state;
    for (const op of ops) {
      if (op.t === 'upsert') {
        const arr = st[op.c];
        const i = arr.findIndex((x) => x.id === op.item.id);
        if (i >= 0) arr[i] = op.item; else arr.push(op.item);
      } else if (op.t === 'remove') {
        st[op.c] = st[op.c].filter((x) => x.id !== op.id);
      } else if (op.t === 'settings') {
        Object.assign(st.settings, op.patch);
      }
    }
    if (st.log.length > 3000) st.log = st.log.slice(-3000);
  }

  function saveLocal() {
    if (!ls.set(KEY, Store.state)) console.warn('Não foi possível gravar no armazenamento local');
  }

  async function http(method, url, body) {
    const r = await fetch(url, {
      method, cache: 'no-store',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function pull() {
    const j = await http('GET', 'api/state');
    Store.state = normalize(j.state);
    Store.rev = j.rev;
    saveLocal();
  }

  async function send(ops) {
    const j = await http('POST', 'api/ops', { ops });
    if (j.rev !== Store.rev + 1) { await pull(); emit(true); } else Store.rev = j.rev;
  }

  async function flush() {
    if (!queue.length) return;
    const ops = queue.slice();
    await send(ops);
    queue = queue.slice(ops.length);
    ls.set(QKEY, queue);
  }

  Store.apply = function (ops) {
    ops = JSON.parse(JSON.stringify(ops));
    applyLocal(ops);
    saveLocal();
    if (Store.mode === 'local') return Promise.resolve();
    queue.push(...ops);
    ls.set(QKEY, queue);
    chain = chain.then(flush).then(() => setSync('ok')).catch(() => setSync('offline'));
    return chain;
  };
  Store.upsert = (c, item) => Store.apply([{ t: 'upsert', c, item }]);
  Store.remove = (c, id) => Store.apply([{ t: 'remove', c, id }]);
  Store.settings = (patch) => Store.apply([{ t: 'settings', patch }]);

  Store.replace = async function (state) {
    Store.state = normalize(JSON.parse(JSON.stringify(state)));
    saveLocal();
    if (Store.mode === 'server') {
      queue = []; ls.set(QKEY, queue);
      const j = await http('PUT', 'api/state', { state: Store.state });
      Store.rev = j.rev;
    }
    emit(true);
  };

  async function poll() {
    if (Store.mode !== 'server') return;
    chain = chain.then(async () => {
      await flush();
      const j = await http('GET', 'api/rev');
      if (j.rev !== Store.rev) { await pull(); emit(true); }
      setSync('ok');
    }).catch(() => setSync('offline'));
  }

  Store.init = async function (seedFn) {
    queue = ls.get(QKEY) || [];
    try {
      const j = await http('GET', 'api/state');
      Store.mode = 'server';
      if (j.state) {
        Store.state = normalize(j.state); Store.rev = j.rev;
        if (queue.length) { applyLocal(queue); await flush().catch(() => {}); }
        saveLocal();
      } else {
        await Store.replace(seedFn());
      }
      ls.set('wsc.mode', 'server');
      setInterval(poll, 5000);
      window.addEventListener('online', poll);
      setSync('ok');
    } catch (e) {
      const cached = ls.get(KEY);
      if (ls.get('wsc.mode') === 'server' && cached) {
        // Servidor indisponível: continuar a trabalhar offline com a cópia local e sincronizar depois
        Store.mode = 'server';
        Store.state = normalize(cached);
        Store.rev = -1;
        setInterval(poll, 5000);
        window.addEventListener('online', poll);
        Store.sync = 'offline';
        return;
      }
      Store.mode = 'local';
      queue = []; ls.set(QKEY, queue);
      Store.state = normalize(cached || seedFn());
      saveLocal();
    }
  };

  window.Store = Store;
})();
