const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg',
    '.m4a': 'audio/mp4',
  };
  const contentType = mimeTypes[ext] || 'text/plain';
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404);
      res.end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });

// Lobbies: { [code]: { players: [], gameState: {} } }
const lobbies = {};

function generateCode() {
  return Math.random().toString(36).substring(2, 6).toUpperCase();
}

function broadcastToLobby(code, message, excludeId = null) {
  const lobby = lobbies[code];
  if (!lobby) return;
  lobby.players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN && p.id !== excludeId) {
      p.ws.send(JSON.stringify(message));
    }
  });
}

function sendToPlayer(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(message));
  }
}

// Map layout: 40x40 grid, 0=open, 1=tree
function generateMap() {
  const size = 40;
  const map = [];
  for (let y = 0; y < size; y++) {
    map.push([]);
    for (let x = 0; x < size; x++) {
      // Border trees
      if (x === 0 || y === 0 || x === size - 1 || y === size - 1) {
        map[y].push(1);
      } else {
        map[y].push(Math.random() < 0.15 ? 1 : 0);
      }
    }
  }
  // Clear spawn area
  for (let y = 2; y < 6; y++)
    for (let x = 2; x < 8; x++)
      map[y][x] = 0;
  // Exit at north
  map[1][20] = 0; map[1][21] = 0;
  return map;
}

function placeItems(map) {
  const items = [];
  const energos = [];
  const size = 40;
  // 10 дневников по всей карте
  const pagePositions = [
    [8, 6],[32, 8],[12, 14],[26, 12],
    [6, 22],[34, 20],[18, 28],[10, 34],
    [30, 32],[22, 18]
  ];
  pagePositions.forEach((pos, i) => {
    map[pos[1]][pos[0]] = 0;
    items.push({ id: `page_${i}`, type: 'page', x: pos[0] + 0.5, z: pos[1] + 0.5, collected: false });
  });
  // 10 энергосов
  for (let i = 0; i < 10; i++) {
    let x, z;
    do {
      x = Math.floor(Math.random() * (size - 4)) + 2;
      z = Math.floor(Math.random() * (size - 4)) + 2;
    } while (map[z][x] === 1);
    energos.push({ id: `energo_${i}`, type: 'energo', x: x + 0.5, z: z + 0.5, collected: false });
  }
  return [...items, ...energos];
}

function createMishkan() {
  return {
    x: 8, z: 8,
    angle: 0,
    speed: 0.055,  // чуть быстрее
    state: 'patrol',
    patrolTarget: { x: 15, z: 15 },
    lastUpdate: Date.now()
  };
}

function updateMishkan(gameState) {
  const mishkan = gameState.mishkan;
  const map = gameState.map;
  const now = Date.now();
  const dt = Math.min((now - mishkan.lastUpdate) / 1000, 0.1);
  mishkan.lastUpdate = now;

  // Find closest player
  let closestPlayer = null;
  let closestDist = Infinity;
  gameState.players.forEach(p => {
    if (p.caught) return;
    const dx = p.x - mishkan.x;
    const dz = p.z - mishkan.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < closestDist) {
      closestDist = dist;
      closestPlayer = p;
    }
  });

  // Chase if within range
  if (closestPlayer && closestDist < 18) {
    mishkan.state = 'chase';
    const dx = closestPlayer.x - mishkan.x;
    const dz = closestPlayer.z - mishkan.z;
    const len = Math.sqrt(dx * dx + dz * dz);
    const speed = mishkan.speed * 60 * dt * 1.8;
    const nx = mishkan.x + (dx / len) * speed;
    const nz = mishkan.z + (dz / len) * speed;
    if (map[Math.floor(nz)][Math.floor(nx)] !== 1) {
      mishkan.x = nx;
      mishkan.z = nz;
    }
    mishkan.angle = Math.atan2(dx, dz);

    // Catch player
    if (closestDist < 1.0 && !closestPlayer.caught) {
      closestPlayer.caught = true;
      closestPlayer.caughtTime = Date.now();
      return { event: 'caught', playerId: closestPlayer.id };
    }
  } else {
    mishkan.state = 'patrol';
    // Random patrol
    const dx = mishkan.patrolTarget.x - mishkan.x;
    const dz = mishkan.patrolTarget.z - mishkan.z;
    const dist = Math.sqrt(dx * dx + dz * dz);
    if (dist < 0.5) {
      let nx, nz;
      do {
        nx = Math.floor(Math.random() * 36) + 2;
        nz = Math.floor(Math.random() * 36) + 2;
      } while (map[nz][nx] === 1);
      mishkan.patrolTarget = { x: nx, z: nz };
    } else {
      const speed = mishkan.speed * 60 * dt;
      const mx = mishkan.x + (dx / dist) * speed;
      const mz = mishkan.z + (dz / dist) * speed;
      if (map[Math.floor(mz)][Math.floor(mx)] !== 1) {
        mishkan.x = mx;
        mishkan.z = mz;
      }
      mishkan.angle = Math.atan2(dx, dz);
    }
  }
  return null;
}

function startGameLoop(code) {
  const lobby = lobbies[code];
  if (!lobby || lobby.interval) return;

  lobby.interval = setInterval(() => {
    if (!lobbies[code]) {
      clearInterval(lobby.interval);
      return;
    }
    const gs = lobby.gameState;
    if (!gs || gs.phase !== 'playing') return;

    const event = updateMishkan(gs);
    if (event && event.event === 'caught') {
      broadcastToLobby(code, {
        type: 'player_caught',
        playerId: event.playerId
      });
    }

    // Broadcast game state
    broadcastToLobby(code, {
      type: 'game_state',
      mishkan: { x: gs.mishkan.x, z: gs.mishkan.z, angle: gs.mishkan.angle },
      players: gs.players.map(p => ({
        id: p.id, name: p.name, x: p.x, z: p.z,
        angle: p.angle, caught: p.caught, hp: p.hp,
        color: p.color
      })),
      items: gs.items
    });

    // Check win/lose
    const pages = gs.items.filter(i => i.type === 'page');
    const allCollected = pages.every(p => p.collected);
    const alivePlayers = gs.players.filter(p => !p.caught);
    if (allCollected && gs.phase === 'playing') {
      alivePlayers.forEach(p => {
        const dx = p.x - 20.5;
        const dz = p.z - 1.5;
        if (Math.sqrt(dx * dx + dz * dz) < 3) {
          gs.phase = 'won';
          broadcastToLobby(code, { type: 'game_won' });
        }
      });
    }
    if (alivePlayers.length === 0 && gs.phase === 'playing') {
      gs.phase = 'lost';
      broadcastToLobby(code, { type: 'game_lost' });
    }
  }, 50); // 20fps server tick
}

wss.on('connection', (ws) => {
  let playerCode = null;
  let playerId = null;

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'create_lobby') {
      const code = generateCode();
      const map = generateMap();
      const items = placeItems(map);
      lobbies[code] = {
        players: [],
        gameState: {
          phase: 'lobby',
          map,
          items,
          mishkan: createMishkan(),
          players: []
        }
      };
      playerCode = code;
      playerId = 'p1';
      const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf'];
      lobbies[code].players.push({ ws, id: playerId, name: msg.name || 'Игрок 1', isHost: true, color: colors[0] });
      lobbies[code].gameState.players.push({
        id: playerId, name: msg.name || 'Игрок 1',
        x: 4, z: 4, angle: 0, caught: false, hp: 100,
        color: colors[0], stamina: 100, adrenaline: false
      });
      sendToPlayer(ws, { type: 'lobby_created', code, playerId, isHost: true });
      sendToPlayer(ws, { type: 'lobby_update', players: lobbies[code].players.map(p => ({ id: p.id, name: p.name, color: p.color })) });
    }

    else if (msg.type === 'join_lobby') {
      const code = msg.code.toUpperCase();
      if (!lobbies[code]) {
        sendToPlayer(ws, { type: 'error', message: 'Лобби не найдено!' });
        return;
      }
      if (lobbies[code].players.length >= 4) {
        sendToPlayer(ws, { type: 'error', message: 'Лобби заполнено!' });
        return;
      }
      playerCode = code;
      const idx = lobbies[code].players.length;
      playerId = `p${idx + 1}`;
      const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a8e6cf'];
      const spawnPoints = [[4,4],[6,4],[4,6],[6,6]];
      lobbies[code].players.push({ ws, id: playerId, name: msg.name || `Игрок ${idx+1}`, isHost: false, color: colors[idx] });
      lobbies[code].gameState.players.push({
        id: playerId, name: msg.name || `Игрок ${idx+1}`,
        x: spawnPoints[idx][0], z: spawnPoints[idx][1],
        angle: 0, caught: false, hp: 100,
        color: colors[idx], stamina: 100, adrenaline: false
      });
      const currentPlayers = lobbies[code].players.map(p => ({ id: p.id, name: p.name, color: p.color }));
      sendToPlayer(ws, { type: 'joined_lobby', code, playerId, isHost: false, players: currentPlayers });
      broadcastToLobby(code, { type: 'lobby_update', players: currentPlayers });
    }

    else if (msg.type === 'start_game') {
      if (!playerCode || !lobbies[playerCode]) return;
      const lobby = lobbies[playerCode];
      const host = lobby.players.find(p => p.id === playerId);
      if (!host || !host.isHost) return;
      lobby.gameState.phase = 'playing';

      // ✅ ФИКС: отправляем game_start ОДИН РАЗ всем игрокам включая хоста
      const startPayload = {
        type: 'game_start',
        map: lobby.gameState.map,
        items: lobby.gameState.items,
        players: lobby.gameState.players.map(p => ({
          id: p.id, name: p.name, x: p.x, z: p.z, color: p.color
        }))
      };
      lobby.players.forEach(p => {
        if (p.ws.readyState === WebSocket.OPEN) {
          p.ws.send(JSON.stringify(startPayload));
        }
      });

      startGameLoop(playerCode);
    }

    else if (msg.type === 'player_move') {
      if (!playerCode || !lobbies[playerCode]) return;
      const gs = lobbies[playerCode].gameState;
      const player = gs.players.find(p => p.id === playerId);
      if (!player || player.caught) return;
      const map = gs.map;

      const speed = msg.sprint && player.stamina > 0 ? 0.12 : 0.06;
      if (player.adrenaline) {
        // noop, handled client side speed boost signal
      }
      const newX = msg.x;
      const newZ = msg.z;
      // Collision
      if (map[Math.floor(newZ)] && map[Math.floor(newZ)][Math.floor(newX)] !== 1) {
        player.x = newX;
        player.z = newZ;
      }
      player.angle = msg.angle;

      // Stamina
      if (msg.sprint && player.stamina > 0) {
        player.stamina = Math.max(0, player.stamina - 0.5);
      } else if (!msg.sprint) {
        player.stamina = Math.min(100, player.stamina + 0.2);
      }

      // Item pickup check
      gs.items.forEach(item => {
        if (item.collected) return;
        const dx = player.x - item.x;
        const dz = player.z - item.z;
        if (Math.sqrt(dx * dx + dz * dz) < 1.0) {
          if (msg.interact) {
            item.collected = true;
            if (item.type === 'energo') {
              player.adrenaline = true;
              setTimeout(() => { if (player) player.adrenaline = false; }, 8000);
            }
            broadcastToLobby(playerCode, {
              type: 'item_collected',
              itemId: item.id,
              itemType: item.type,
              playerId: playerId
            });
          }
        }
      });
    }

    else if (msg.type === 'heal_player') {
      if (!playerCode || !lobbies[playerCode]) return;
      const gs = lobbies[playerCode].gameState;
      const healer = gs.players.find(p => p.id === playerId);
      const target = gs.players.find(p => p.id === msg.targetId);
      if (!healer || !target || !target.caught) return;
      const dx = healer.x - target.x;
      const dz = healer.z - target.z;
      if (Math.sqrt(dx * dx + dz * dz) < 2.0) {
        target.caught = false;
        target.hp = 100;
        broadcastToLobby(playerCode, {
          type: 'player_healed',
          playerId: target.id
        });
      }
    }
  });

  ws.on('close', () => {
    if (!playerCode || !lobbies[playerCode]) return;
    lobbies[playerCode].players = lobbies[playerCode].players.filter(p => p.id !== playerId);
    if (lobbies[playerCode].gameState) {
      lobbies[playerCode].gameState.players = lobbies[playerCode].gameState.players.filter(p => p.id !== playerId);
    }
    if (lobbies[playerCode].players.length === 0) {
      clearInterval(lobbies[playerCode].interval);
      delete lobbies[playerCode];
    } else {
      broadcastToLobby(playerCode, {
        type: 'lobby_update',
        players: lobbies[playerCode].players.map(p => ({ id: p.id, name: p.name, color: p.color }))
      });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🌲 Лес Мишкана запущен на порту ${PORT}`);
});
