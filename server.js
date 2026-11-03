#!/usr/bin/env node
/*
 * Servidor do Sistema de Gestão de Limpeza (sem dependências externas).
 * - Serve a aplicação web e uma API JSON partilhada por toda a equipa.
 * - Grava em data/db.json (escrita atómica) e cria cópias de segurança periódicas em data/backups.
 * Variáveis de ambiente: PORT (8080), HOST (0.0.0.0), DATA_DIR, AUTH_USER + AUTH_PASS (autenticação básica opcional).
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0';
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || path.join(ROOT, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const BACKUP_EVERY_MS = 10 * 60 * 1000;
const BACKUP_KEEP = 150;
const AUTH = process.env.AUTH_USER && process.env.AUTH_PASS
  ? 'Basic ' + Buffer.from(process.env.AUTH_USER + ':' + process.env.AUTH_PASS).toString('base64') : null;

fs.mkdirSync(BACKUP_DIR, { recursive: true });

let db = { rev: 0, state: null };
try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* base de dados nova */ }
let dirty = false;
let lastBackupRev = db.rev;

function persist() {
  const tmp = DB_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(db));
  fs.renameSync(tmp, DB_FILE);
  dirty = true;
}

function backup() {
  if (!dirty || db.rev === lastBackupRev || !db.state) return;
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  fs.copyFileSync(DB_FILE, path.join(BACKUP_DIR, `db-${stamp}.json`));
  lastBackupRev = db.rev; dirty = false;
  const files = fs.readdirSync(BACKUP_DIR).filter((f) => f.startsWith('db-')).sort();
  while (files.length > BACKUP_KEEP) fs.unlinkSync(path.join(BACKUP_DIR, files.shift()));
}
setInterval(() => { try { backup(); } catch (e) { console.error('Backup falhou:', e.message); } }, BACKUP_EVERY_MS);

const COLLS = new Set(['pavilions', 'areas', 'staff', 'services', 'log']);
function applyOps(ops) {
  const st = db.state;
  if (!st) throw new Error('Sem estado inicial');
  for (const op of ops) {
    const ok = op && ((op.t === 'settings' && op.patch && typeof op.patch === 'object')
      || (COLLS.has(op.c) && ((op.t === 'upsert' && op.item && typeof op.item.id === 'string') || (op.t === 'remove' && typeof op.id === 'string'))));
    if (!ok) throw new Error('Operação inválida');
  }
  for (const op of ops) {
    if (op.t === 'settings' && op.patch && typeof op.patch === 'object') { Object.assign(st.settings, op.patch); continue; }
    if (!COLLS.has(op.c)) throw new Error('Coleção inválida');
    if (!Array.isArray(st[op.c])) st[op.c] = [];
    if (op.t === 'upsert' && op.item && typeof op.item.id === 'string') {
      const arr = st[op.c];
      const i = arr.findIndex((x) => x.id === op.item.id);
      if (i >= 0) arr[i] = op.item; else arr.push(op.item);
    } else if (op.t === 'remove' && typeof op.id === 'string') {
      st[op.c] = st[op.c].filter((x) => x.id !== op.id);
    } else throw new Error('Operação inválida');
  }
  if (st.log && st.log.length > 3000) st.log = st.log.slice(-3000);
}

function readBody(req, limit = 25 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('Pedido demasiado grande')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}

function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.csv': 'text/csv; charset=utf-8' };
const PUBLIC = [/^\/index\.html$/, /^\/css\/[\w.-]+$/, /^\/js\/[\w.-]+$/, /^\/assets\/[\w.-]+$/];

function safeEqual(a, b) {
  const x = Buffer.from(a || ''); const y = Buffer.from(b || '');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const server = http.createServer(async (req, res) => {
  if (AUTH && !safeEqual(req.headers.authorization, AUTH)) {
    res.writeHead(401, { 'WWW-Authenticate': 'Basic realm="Gestao de Limpeza", charset="UTF-8"' });
    return res.end('Autenticação necessária');
  }
  const url = new URL(req.url, 'http://x');
  let p = decodeURIComponent(url.pathname);
  try {
    if (p === '/api/rev' && req.method === 'GET') return json(res, 200, { rev: db.rev });
    if (p === '/api/state' && req.method === 'GET') return json(res, 200, db);
    if (p === '/api/state' && req.method === 'PUT') {
      const body = await readBody(req);
      if (!body.state || typeof body.state !== 'object') return json(res, 400, { error: 'Estado inválido' });
      if (db.state) { try { backup(); } catch (e) { /* ignora */ } }
      db = { rev: db.rev + 1, state: body.state };
      persist();
      return json(res, 200, { rev: db.rev });
    }
    if (p === '/api/ops' && req.method === 'POST') {
      const body = await readBody(req);
      if (!Array.isArray(body.ops)) return json(res, 400, { error: 'ops em falta' });
      applyOps(body.ops);
      db.rev += 1;
      persist();
      return json(res, 200, { rev: db.rev });
    }
    if (p.startsWith('/api/')) return json(res, 404, { error: 'Não encontrado' });

    if (p === '/') p = '/index.html';
    if (!PUBLIC.some((re) => re.test(p))) { res.writeHead(404); return res.end('Não encontrado'); }
    const file = path.join(ROOT, p);
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Não encontrado'); }
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  } catch (e) {
    json(res, 400, { error: e.message });
  }
});

function shutdown() { try { backup(); } catch (e) { /* ignora */ } process.exit(0); }
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.listen(PORT, HOST, () => {
  console.log(`Gestão de Limpeza a correr em http://localhost:${PORT}  (dados: ${DB_FILE})${AUTH ? '  [autenticação ativa]' : ''}`);
});
