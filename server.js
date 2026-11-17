const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT || 8080);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA_DIR = path.join(ROOT, 'data');
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json');
fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(ACCOUNTS_FILE)) fs.writeFileSync(ACCOUNTS_FILE, '{}');

function readAccounts() {
  try { return JSON.parse(fs.readFileSync(ACCOUNTS_FILE, 'utf8')); }
  catch { return {}; }
}
function writeAccounts(data) {
  const temp = ACCOUNTS_FILE + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(data, null, 2));
  fs.renameSync(temp, ACCOUNTS_FILE);
}
function sendJson(res, status, data) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', chunk => {
      raw += chunk;
      if (raw.length > 1_000_000) reject(new Error('Petición demasiado grande'));
    });
    req.on('end', () => {
      try { resolve(raw ? JSON.parse(raw) : {}); }
      catch { reject(new Error('JSON no válido')); }
    });
    req.on('error', reject);
  });
}
function cleanUsername(value) {
  return String(value || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 20);
}
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
function passwordMatches(password, saved) {
  const candidate = Buffer.from(hashPassword(password, saved.salt).hash, 'hex');
  const expected = Buffer.from(saved.hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}
const sessions = new Map();

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return sendJson(res, 204, {});
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  if (req.method === 'GET' && url.pathname === '/health') {
    return sendJson(res, 200, { ok: true, service: 'WOT Mini Online' });
  }

  if (req.method === 'POST' && url.pathname === '/api/account/auth') {
    try {
      const body = await readBody(req);
      const username = cleanUsername(body.username);
      const password = String(body.password || '');
      if (username.length < 3) return sendJson(res, 400, { error: 'El usuario debe tener al menos 3 caracteres.' });
      if (password.length < 4 || password.length > 100) return sendJson(res, 400, { error: 'La contraseña debe tener entre 4 y 100 caracteres.' });

      const accounts = readAccounts();
      let account = accounts[username];
      let created = false;
      if (!account) {
        const credentials = hashPassword(password);
        account = { ...credentials, data: {
          username, xp: 0, credits: 100, euros: 0, playSeconds: 0,
          unlockedTanks: ['medium'], tankUpgrades: {},
          selectedTankClass: 'medium'
        }};
        accounts[username] = account;
        created = true;
      } else if (!passwordMatches(password, account)) {
        return sendJson(res, 401, { error: 'Contraseña incorrecta para ese usuario.' });
      }

      writeAccounts(accounts);
      const token = crypto.randomBytes(32).toString('hex');
      sessions.set(token, username);
      return sendJson(res, 200, { token, created, data: account.data || {} });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'No se pudo procesar la cuenta.' });
    }
  }

  if (req.method === 'POST' && url.pathname === '/api/account/save') {
    try {
      const token = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '');
      const username = sessions.get(token);
      if (!username) return sendJson(res, 401, { error: 'La sesión ha caducado. Vuelve a entrar en tu cuenta.' });
      const body = await readBody(req);
      const data = body.data || {};
      const accounts = readAccounts();
      if (!accounts[username]) return sendJson(res, 404, { error: 'No se encuentra la cuenta.' });
      const safeData = {
        username,
        xp: Math.max(0, Number(data.xp) || 0),
        credits: Math.max(0, Number(data.credits) || 0),
        euros: Math.max(0, Number(data.euros) || 0),
        playSeconds: Math.max(0, Number(data.playSeconds) || 0),
        unlockedTanks: Array.isArray(data.unlockedTanks) ? data.unlockedTanks.slice(0, 30) : ['medium'],
        tankUpgrades: data.tankUpgrades && typeof data.tankUpgrades === 'object' ? data.tankUpgrades : {},
        selectedTankClass: String(data.selectedTankClass || 'medium').slice(0, 40),
        updatedAt: Date.now()
      };
      accounts[username].data = safeData;
      writeAccounts(accounts);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      return sendJson(res, 400, { error: err.message || 'No se pudo guardar el progreso.' });
    }
  }

  // Servir el juego desde el mismo dominio que la API y el multijugador.
  let requested = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const filePath = path.resolve(PUBLIC, '.' + requested);
  if (!filePath.startsWith(PUBLIC + path.sep) && filePath !== path.join(PUBLIC, 'index.html')) {
    res.writeHead(403); return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    const ext = path.extname(filePath).toLowerCase();
    const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(content);
  });
});

// WebSocket multijugador: salas de hasta 3 jugadores.
const wss = new WebSocketServer({ server, maxPayload: 16 * 1024 });
const rooms = new Map();
function send(ws, data) {
  if (ws.readyState === 1) ws.send(JSON.stringify(data));
}
function broadcast(room, data, except = null) {
  for (const peer of room.players.values()) if (peer !== except) send(peer, data);
}
function roster(room) {
  broadcast(room, { type: 'roster', players: room.players.size });
}
function leaveRoom(ws) {
  if (!ws.roomCode) return;
  const room = rooms.get(ws.roomCode);
  if (room) {
    room.players.delete(ws.playerId);
    broadcast(room, { type: 'left', id: ws.playerId, players: room.players.size });
    if (room.players.size === 0) rooms.delete(ws.roomCode);
    else roster(room);
  }
  ws.roomCode = null;
}
function makeCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = Array.from({ length: 5 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
  } while (rooms.has(code));
  return code;
}
wss.on('connection', ws => {
  ws.playerId = crypto.randomBytes(8).toString('hex');
  ws.on('message', raw => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (!msg || typeof msg.type !== 'string') return;

    if (msg.type === 'create') {
      leaveRoom(ws);
      const code = makeCode();
      const room = { players: new Map() };
      room.players.set(ws.playerId, ws);
      rooms.set(code, room);
      ws.roomCode = code;
      send(ws, { type: 'room', code, id: ws.playerId, players: 1 });
      return;
    }
    if (msg.type === 'join') {
      leaveRoom(ws);
      const code = String(msg.code || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 5);
      const room = rooms.get(code);
      if (!room) return send(ws, { type: 'error', message: 'No existe esa sala. Comprueba el código.' });
      if (room.players.size >= 3) return send(ws, { type: 'error', message: 'La sala está llena (máximo 3 jugadores).' });
      room.players.set(ws.playerId, ws);
      ws.roomCode = code;
      send(ws, { type: 'joined', code, id: ws.playerId, players: room.players.size });
      broadcast(room, { type: 'roster', players: room.players.size });
      return;
    }
    const room = ws.roomCode && rooms.get(ws.roomCode);
    if (!room) return;
    if (msg.type === 'state') {
      const state = {
        type: 'state', id: ws.playerId,
        x: Number(msg.x) || 0, y: Number(msg.y) || 0, z: Number(msg.z) || 0,
        rotation: Number(msg.rotation) || 0, turret: Number(msg.turret) || 0,
        tankClass: String(msg.tankClass || 'medium').slice(0, 30),
        color: Number(msg.color) || 0x38bdf8
      };
      broadcast(room, state, ws);
    } else if (msg.type === 'shot' && msg.pos) {
      const shot = {
        type: 'shot', id: ws.playerId,
        pos: { x: Number(msg.pos.x) || 0, y: Number(msg.pos.y) || 0, z: Number(msg.pos.z) || 0 },
        vx: Number(msg.vx) || 0, vy: Number(msg.vy) || 0, vz: Number(msg.vz) || 0
      };
      broadcast(room, shot, ws);
    }
  });
  ws.on('close', () => leaveRoom(ws));
  ws.on('error', () => leaveRoom(ws));
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`WOT Mini Online listo en http://localhost:${PORT}`);
});
