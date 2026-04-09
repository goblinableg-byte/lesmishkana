const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mimeTypes = {
    '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
    '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4',
  };
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const lobbies = {};

function generateCode() { return Math.random().toString(36).substring(2, 6).toUpperCase(); }

function generateMap() {
  const size = 40;
  const map = [];
  for (let y = 0; y < size; y++) {
    map.push([]);
    for (let x = 0; x < size; x++) {
      if (x === 0 || y === 0 || x === size-1 || y === size-1) map[y].push(1);
      else map[y].push(Math.random() < 0.13 ? 1 : 0);
    }
  }
  // Большая очищенная зона спавна
  for (let y = 1; y < 11; y++) for (let x = 1; x < 11; x++) map[y][x] = 0;
  // Очищаем зоны вокруг страниц
  [[10,8],[30,10],[15,30],[28,28]].forEach(([px,pz]) => {
    for (let dz = -2; dz <= 2; dz++)
      for (let dx = -2; dx <= 2; dx++)
        if (map[pz+dz] && map[pz+dz][px+dx] !== undefined) map[pz+dz][px+dx] = 0;
  });
  // Широкий выход
  for (let x = 18; x <= 23; x++) map[1][x] = 0;
  return map;
}

function placeItems(map) {
  const items = [];
  [[10,8],[30,10],[15,30],[28,28]].forEach((pos, i) => {
    map[pos[1]][pos[0]] = 0;
    items.push({ id:`page_${i}`, type:'page', x:pos[0]+0.5, z:pos[1]+0.5, collected:false });
  });
  for (let i = 0; i < 8; i++) {
    let x, z, att = 0;
    do { x = Math.floor(Math.random()*32)+4; z = Math.floor(Math.random()*32)+4; att++; }
    while (map[z][x] === 1 && att < 100);
    items.push({ id:`energo_${i}`, type:'energo', x:x+0.5, z:z+0.5, collected:false });
  }
  return items;
}

function createMishkan() {
  return { x:20, z:20, angle:0, speed:0.038, state:'patrol', patrolTarget:{x:20,z:20}, lastUpdate:Date.now() };
}

function updateMishkan(gs) {
  const m = gs.mishkan, map = gs.map;
  const now = Date.now();
  const dt = Math.min((now - m.lastUpdate)/1000, 0.1);
  m.lastUpdate = now;

  let closest = null, closestDist = Infinity;
  gs.players.forEach(p => {
    if (p.caught) return;
    const d = Math.sqrt((p.x-m.x)**2 + (p.z-m.z)**2);
    if (d < closestDist) { closestDist = d; closest = p; }
  });

  if (closest && closestDist < 14) {
    m.state = 'chase';
    const dx = closest.x-m.x, dz = closest.z-m.z;
    const len = Math.sqrt(dx*dx+dz*dz);
    const spd = m.speed*60*dt*1.2;
    const nx = m.x+(dx/len)*spd, nz = m.z+(dz/len)*spd;
    if (map[Math.floor(nz)] && map[Math.floor(nz)][Math.floor(nx)] !== 1) { m.x=nx; m.z=nz; }
    m.angle = Math.atan2(dx, dz);
    if (closestDist < 1.0 && !closest.caught) {
      closest.caught = true; closest.caughtTime = Date.now();
      return { event:'caught', playerId:closest.id };
    }
  } else {
    m.state = 'patrol';
    const dx = m.patrolTarget.x-m.x, dz = m.patrolTarget.z-m.z;
    const dist = Math.sqrt(dx*dx+dz*dz);
    if (dist < 0.5) {
      let nx, nz, att=0;
      do { nx=Math.floor(Math.random()*36)+2; nz=Math.floor(Math.random()*36)+2; att++; }
      while (map[nz][nx]===1 && att<50);
      m.patrolTarget = {x:nx,z:nz};
    } else {
      const spd = m.speed*60*dt;
      const mx = m.x+(dx/dist)*spd, mz = m.z+(dz/dist)*spd;
      if (map[Math.floor(mz)] && map[Math.floor(mz)][Math.floor(mx)] !== 1) { m.x=mx; m.z=mz; }
      m.angle = Math.atan2(dx, dz);
    }
  }
  return null;
}

function bcast(code, obj) {
  const lobby = lobbies[code]; if (!lobby) return;
  const s = JSON.stringify(obj);
  lobby.players.forEach(p => { if (p.ws.readyState === WebSocket.OPEN) p.ws.send(s); });
}
function send(ws, obj) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function startGameLoop(code) {
  const lobby = lobbies[code];
  if (!lobby || lobby.interval) return;
  lobby.interval = setInterval(() => {
    if (!lobbies[code]) { clearInterval(lobby.interval); return; }
    const gs = lobby.gameState;
    if (!gs || gs.phase !== 'playing') return;

    const ev = updateMishkan(gs);
    if (ev && ev.event === 'caught') bcast(code, { type:'player_caught', playerId:ev.playerId });

    bcast(code, {
      type: 'game_state',
      mishkan: { x:gs.mishkan.x, z:gs.mishkan.z, angle:gs.mishkan.angle },
      players: gs.players.map(p => ({ id:p.id, name:p.name, x:p.x, z:p.z, angle:p.angle, caught:p.caught, hp:p.hp, color:p.color })),
      items: gs.items
    });

    const allPages = gs.items.filter(i=>i.type==='page').every(p=>p.collected);
    const alive = gs.players.filter(p=>!p.caught);
    if (allPages && gs.phase==='playing') {
      alive.forEach(p => {
        if (Math.sqrt((p.x-20.5)**2+(p.z-1.5)**2) < 2.5) {
          gs.phase='won'; bcast(code, {type:'game_won'});
        }
      });
    }
    if (alive.length===0 && gs.players.length>0 && gs.phase==='playing') {
      gs.phase='lost'; bcast(code, {type:'game_lost'});
    }
  }, 50);
}

wss.on('connection', ws => {
  let playerCode=null, playerId=null;

  ws.on('message', raw => {
    let msg; try { msg=JSON.parse(raw); } catch { return; }

    if (msg.type==='create_lobby') {
      const code=generateCode(), map=generateMap(), items=placeItems(map);
      lobbies[code] = { players:[], gameState:{ phase:'lobby', map, items, mishkan:createMishkan(), players:[] } };
      playerCode=code; playerId='p1';
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      lobbies[code].players.push({ ws, id:'p1', name:msg.name||'Игрок 1', isHost:true, color:colors[0] });
      lobbies[code].gameState.players.push({ id:'p1', name:msg.name||'Игрок 1', x:3, z:3, angle:0, caught:false, hp:100, color:colors[0], stamina:100, adrenaline:false });
      send(ws, { type:'lobby_created', code, playerId:'p1', isHost:true });
      send(ws, { type:'lobby_update', players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color})) });
    }

    else if (msg.type==='join_lobby') {
      const code=msg.code.toUpperCase();
      if (!lobbies[code]) { send(ws,{type:'error',message:'Лобби не найдено!'}); return; }
      if (lobbies[code].players.length>=4) { send(ws,{type:'error',message:'Лобби заполнено!'}); return; }
      if (lobbies[code].gameState.phase!=='lobby') { send(ws,{type:'error',message:'Игра уже идёт!'}); return; }
      playerCode=code;
      const idx=lobbies[code].players.length;
      playerId=`p${idx+1}`;
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      const spawns=[[3,3],[8,3],[3,8],[8,8]];
      lobbies[code].players.push({ ws, id:playerId, name:msg.name||`Игрок ${idx+1}`, isHost:false, color:colors[idx] });
      lobbies[code].gameState.players.push({ id:playerId, name:msg.name||`Игрок ${idx+1}`, x:spawns[idx][0], z:spawns[idx][1], angle:0, caught:false, hp:100, color:colors[idx], stamina:100, adrenaline:false });
      send(ws, { type:'joined_lobby', code, playerId, isHost:false });
      bcast(code, { type:'lobby_update', players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color})) });
    }

    else if (msg.type==='start_game') {
      if (!playerCode||!lobbies[playerCode]) return;
      const lobby=lobbies[playerCode];
      const host=lobby.players.find(p=>p.id===playerId);
      if (!host||!host.isHost) return;
      lobby.gameState.phase='playing';
      bcast(playerCode, {
        type:'game_start',
        map:lobby.gameState.map,
        items:lobby.gameState.items,
        players:lobby.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color}))
      });
      startGameLoop(playerCode);
    }

    else if (msg.type==='player_move') {
      if (!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const player=gs.players.find(p=>p.id===playerId);
      if (!player||player.caught) return;
      const nx=msg.x, nz=msg.z;
      if (gs.map[Math.floor(nz)]&&gs.map[Math.floor(nz)][Math.floor(nx)]!==1) { player.x=nx; player.z=nz; }
      player.angle=msg.angle;
      if (msg.sprint&&player.stamina>0) player.stamina=Math.max(0,player.stamina-0.5);
      else if (!msg.sprint) player.stamina=Math.min(100,player.stamina+0.2);
      if (msg.interact) {
        gs.items.forEach(item => {
          if (item.collected) return;
          if (Math.sqrt((player.x-item.x)**2+(player.z-item.z)**2) < 1.2) {
            item.collected=true;
            if (item.type==='energo') { player.adrenaline=true; setTimeout(()=>{ if(player) player.adrenaline=false; },8000); }
            bcast(playerCode, { type:'item_collected', itemId:item.id, itemType:item.type, playerId });
          }
        });
      }
    }

    else if (msg.type==='heal_player') {
      if (!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const healer=gs.players.find(p=>p.id===playerId);
      const target=gs.players.find(p=>p.id===msg.targetId);
      if (!healer||!target||!target.caught) return;
      if (Math.sqrt((healer.x-target.x)**2+(healer.z-target.z)**2) < 2.5) {
        target.caught=false; target.hp=100;
        bcast(playerCode, { type:'player_healed', playerId:target.id });
      }
    }
  });

  ws.on('close', () => {
    if (!playerCode||!lobbies[playerCode]) return;
    lobbies[playerCode].players=lobbies[playerCode].players.filter(p=>p.id!==playerId);
    lobbies[playerCode].gameState.players=lobbies[playerCode].gameState.players.filter(p=>p.id!==playerId);
    if (lobbies[playerCode].players.length===0) {
      clearInterval(lobbies[playerCode].interval);
      delete lobbies[playerCode];
    } else {
      bcast(playerCode, { type:'lobby_update', players:lobbies[playerCode].players.map(p=>({id:p.id,name:p.name,color:p.color})) });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => console.log(`🌲 Лес Мишкана запущен на порту ${PORT}`));
