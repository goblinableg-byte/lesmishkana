const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let filePath = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(filePath);
  const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const lobbies = {};

function generateCode() { return Math.random().toString(36).substring(2,6).toUpperCase(); }

// ════════════════════════════════════════
//  ФИКСИРОВАННАЯ КАРТА 32x32
// ════════════════════════════════════════
const FIXED_MAP = [
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0,0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
  [1,0,0,0,0,0,0,0,1,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,1,1,0,1,0,1,1,1,0,1,0,1,1,0,1,1,1,1,1,1,1,1,1,1,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,0,1,0,1,1,1,1,1,0,1,1,1,1,0,1,1,1,1,1,1,1,1,1,1,0,0,1,0,1],
  [1,0,1,0,1,0,0,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,1,0,1,1,0,1],
  [1,0,1,0,1,1,1,1,0,0,1,1,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1,0,0,0,0,1],
  [1,0,0,0,0,0,0,1,0,1,0,0,0,0,1,0,1,0,0,0,0,0,0,0,1,0,1,1,1,1,0,1],
  [1,1,1,0,1,1,0,1,0,1,0,1,1,0,1,0,1,0,1,1,1,1,1,0,1,0,0,0,0,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,1,0,0,0,0,1,0,1,0,0,0,1,0,0,0,1,1,0,1,0,1],
  [1,0,1,1,0,1,1,1,1,1,0,1,0,1,1,0,1,0,1,0,1,0,1,1,1,0,0,1,0,1,0,1],
  [1,0,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,0,1,0,1,0,0,0,1,1,0,1,0,0,0,1],
  [1,1,0,1,0,1,1,1,1,1,0,1,0,1,0,1,1,0,1,0,1,1,0,0,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0,0,0,0,1,0,1,0,1,0,0,0,1,0,1],
  [1,0,1,1,0,1,0,1,0,1,1,1,0,1,1,0,1,1,1,1,0,1,0,1,0,0,0,1,0,1,0,1],
  [1,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0,0,0,0,1,0,0,0,1,1,1,0,1,0,0,0,1],
  [1,1,0,1,1,1,0,1,1,1,0,1,1,0,1,0,1,0,0,1,1,1,0,0,0,1,0,1,1,1,0,1],
  [1,0,0,0,0,1,0,0,0,1,0,0,1,0,0,0,1,0,1,0,0,1,0,1,0,1,0,0,0,1,0,1],
  [1,0,1,1,0,1,1,1,0,1,1,0,1,1,1,0,1,0,1,0,0,1,0,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,0,1,0,0,1,0,0,0,1,0,0,0,1,0,1,1,0,0,0,0,0,1,0,0,0,1],
  [1,0,1,0,1,1,0,1,1,0,1,1,1,0,1,1,1,0,1,0,0,1,1,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,0,1,0,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,1,0,1,1,1,0,1,0,1],
  [1,0,1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,1,1,1,1,1,0,1,1,1,0,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0,1,0,0,0,1,0,1],
  [1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,0,1,1,1],
  [1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1],
  [1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1],
  [1,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0,0,1,0,0,0,1,0,0,0,0,0,0,0,1,0,1],
  [1,0,1,0,1,1,1,1,1,1,1,0,1,1,1,1,0,1,1,1,0,1,1,1,1,1,1,1,0,1,0,1],
  [1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1,1],
];

const SPAWN_POINTS = [{x:15.5,z:15.5},{x:16.5,z:15.5},{x:15.5,z:16.5},{x:16.5,z:16.5}];
const MISHKAN_SPAWN = {x:29.5, z:21.5};
const EXIT_POS = {x:15.5, z:0.7};

// Предметы — фиксированные позиции (совпадают с клиентом)
const PAGE_DEFS = [
  {x:2.5,z:1.5},{x:26.5,z:1.5},{x:4.5,z:4.5},{x:7.5,z:8.5},
  {x:29.5,z:8.5},{x:5.5,z:13.5},{x:1.5,z:18.5},{x:13.5,z:22.5},
  {x:4.5,z:25.5},{x:30.5,z:29.5},
];
const ENERGO_DEFS = [
  {x:21.5,z:1.5},{x:3.5,z:5.5},{x:27.5,z:9.5},{x:2.5,z:23.5},{x:20.5,z:26.5},
];
// Позиции крестов — случайные из пула свободных клеток
const CROSS_POOL = [
  {x:10.5,z:3.5},{x:20.5,z:3.5},{x:8.5,z:7.5},{x:25.5,z:7.5},
  {x:3.5,z:11.5},{x:28.5,z:11.5},{x:7.5,z:16.5},{x:23.5,z:16.5},
  {x:10.5,z:20.5},{x:20.5,z:20.5},{x:5.5,z:24.5},{x:27.5,z:24.5},
  {x:12.5,z:28.5},{x:18.5,z:28.5},
];

function placeItems() {
  const items = [];
  PAGE_DEFS.forEach((p,i) => items.push({id:`page_${i}`,type:'page',x:p.x,z:p.z,collected:false}));
  ENERGO_DEFS.forEach((e,i) => items.push({id:`energo_${i}`,type:'energo',x:e.x,z:e.z,collected:false}));
  // Кресты — 5-7 штук случайно из пула
  const count = 5 + Math.floor(Math.random()*3); // 5,6 или 7
  const pool = [...CROSS_POOL].sort(()=>Math.random()-0.5).slice(0,count);
  pool.forEach((c,i) => items.push({id:`cross_${i}`,type:'cross',x:c.x,z:c.z,collected:false}));
  return items;
}

function createMishkan() {
  return {
    x: MISHKAN_SPAWN.x, z: MISHKAN_SPAWN.z,
    angle: 0,
    speed: 0.06,
    state: 'patrol',
    patrolTarget: { x:25, z:18 },
    lastUpdate: Date.now(),
    gracePeriod: 8000,
    stuckTimer: 0,
    stuckX: MISHKAN_SPAWN.x, stuckZ: MISHKAN_SPAWN.z,
  };
}

// ════ УМНОЕ ДВИЖЕНИЕ МИШКАНА ════
function moveTowards(m, tx, tz, spd) {
  const dx = tx - m.x, dz = tz - m.z;
  const len = Math.sqrt(dx*dx + dz*dz);
  if (len < 0.1) return false;
  const nx = m.x + (dx/len)*spd;
  const nz = m.z + (dz/len)*spd;
  const mx = Math.floor(nx), mz = Math.floor(nz);
  if (FIXED_MAP[mz] && FIXED_MAP[mz][mx] !== 1) {
    m.x = nx; m.z = nz; m.angle = Math.atan2(dx, dz);
    return true;
  }
  // Стена — пробуем скользить по X или Z
  if (FIXED_MAP[Math.floor(m.z)] && FIXED_MAP[Math.floor(m.z)][mx] !== 1) {
    m.x = nx; m.angle = Math.atan2(dx, dz);
    return true;
  }
  if (FIXED_MAP[mz] && FIXED_MAP[mz][Math.floor(m.x)] !== 1) {
    m.z = nz; m.angle = Math.atan2(dx, dz);
    return true;
  }
  return false;
}

function updateMishkan(gs) {
  const m = gs.mishkan;
  const now = Date.now();
  const dt = Math.min((now - m.lastUpdate)/1000, 0.05);
  m.lastUpdate = now;

  // Grace period
  if (m.gracePeriod > 0) {
    m.gracePeriod -= dt * 1000;
    moveTowards(m, m.patrolTarget.x, m.patrolTarget.z, m.speed*55*dt*0.6);
    const dx = m.patrolTarget.x-m.x, dz = m.patrolTarget.z-m.z;
    if (Math.sqrt(dx*dx+dz*dz) < 1.0) {
      m.patrolTarget = {x:22+Math.random()*6, z:18+Math.random()*6};
    }
    return null;
  }

  // Ищем ближайшего живого игрока
  let closest = null, closestDist = Infinity;
  gs.players.forEach(p => {
    if (p.caught) return;
    const d = Math.sqrt((p.x-m.x)**2 + (p.z-m.z)**2);
    if (d < closestDist) { closestDist = d; closest = p; }
  });

  if (closest) {
    if (closestDist < 0.9 && !closest.caught) {
      // Поймал!
      closest.caught = true;
      closest.caughtTime = Date.now();
      return { event:'caught', playerId:closest.id };
    }

    m.state = 'chase';
    const spd = m.speed * 55 * dt * (closestDist < 8 ? 1.5 : 1.2);
    const moved = moveTowards(m, closest.x, closest.z, spd);

    // Антизастревание — если не двигается 1.5 сек, телепортируем чуть ближе к цели
    const distMoved = Math.sqrt((m.x-m.stuckX)**2+(m.z-m.stuckZ)**2);
    m.stuckTimer += dt;
    if (m.stuckTimer > 1.5) {
      m.stuckTimer = 0;
      if (distMoved < 0.2) {
        // Застрял — ищем свободную клетку между мишканом и игроком
        const midX = m.x + (closest.x-m.x)*0.3;
        const midZ = m.z + (closest.z-m.z)*0.3;
        const cx = Math.floor(midX), cz = Math.floor(midZ);
        if (FIXED_MAP[cz] && FIXED_MAP[cz][cx] !== 1) {
          m.x = midX; m.z = midZ;
        }
      }
      m.stuckX = m.x; m.stuckZ = m.z;
    }
  } else {
    // Нет живых — патруль
    m.state = 'patrol';
    moveTowards(m, m.patrolTarget.x, m.patrolTarget.z, m.speed*55*dt*0.8);
    const dx = m.patrolTarget.x-m.x, dz = m.patrolTarget.z-m.z;
    if (Math.sqrt(dx*dx+dz*dz) < 1.0) {
      let nx, nz, att=0;
      do { nx=2+Math.floor(Math.random()*28); nz=2+Math.floor(Math.random()*28); att++; }
      while (FIXED_MAP[nz] && FIXED_MAP[nz][nx]===1 && att<80);
      m.patrolTarget = {x:nx+0.5, z:nz+0.5};
    }
  }
  return null;
}

function bcast(code, obj) {
  const lobby=lobbies[code]; if(!lobby) return;
  const s=JSON.stringify(obj);
  lobby.players.forEach(p=>{if(p.ws.readyState===WebSocket.OPEN) p.ws.send(s);});
}
function sendTo(ws, obj) { if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function startGameLoop(code) {
  const lobby=lobbies[code];
  if(!lobby||lobby.interval) return;
  lobby.interval = setInterval(()=>{
    if(!lobbies[code]){clearInterval(lobby.interval);return;}
    const gs=lobby.gameState;
    if(!gs||gs.phase!=='playing') return;
    const ev=updateMishkan(gs);
    if(ev&&ev.event==='caught') bcast(code,{type:'player_caught',playerId:ev.playerId});
    bcast(code,{
      type:'game_state',
      mishkan:{x:gs.mishkan.x, z:gs.mishkan.z, angle:gs.mishkan.angle, state:gs.mishkan.state},
      players:gs.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,angle:p.angle,caught:p.caught,hp:p.hp,color:p.color})),
      items:gs.items
    });
    // Победа
    const allPages=gs.items.filter(i=>i.type==='page').every(p=>p.collected);
    const alive=gs.players.filter(p=>!p.caught);
    if(allPages && gs.phase==='playing'){
      alive.forEach(p=>{
        if(Math.sqrt((p.x-EXIT_POS.x)**2+(p.z-EXIT_POS.z)**2)<2.5){
          gs.phase='won'; bcast(code,{type:'game_won'});
        }
      });
    }
    if(alive.length===0 && gs.players.length>0 && gs.phase==='playing'){
      gs.phase='lost'; bcast(code,{type:'game_lost'});
    }
  }, 50);
}

wss.on('connection', ws=>{
  let playerCode=null, playerId=null;
  ws.on('message', raw=>{
    let msg; try{msg=JSON.parse(raw);}catch{return;}

    if(msg.type==='create_lobby'){
      const code=generateCode();
      lobbies[code]={players:[],gameState:{phase:'lobby',map:FIXED_MAP,items:placeItems(),mishkan:createMishkan(),players:[]}};
      playerCode=code; playerId='p1';
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      lobbies[code].players.push({ws,id:'p1',name:msg.name||'Игрок 1',isHost:true,color:colors[0]});
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:SPAWN_POINTS[0].x,z:SPAWN_POINTS[0].z,angle:0,caught:false,hp:100,color:colors[0],stamina:100});
      sendTo(ws,{type:'lobby_created',code,playerId:'p1',isHost:true});
      sendTo(ws,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='join_lobby'){
      const code=msg.code.toUpperCase();
      if(!lobbies[code]){sendTo(ws,{type:'error',message:'Лобби не найдено!'});return;}
      if(lobbies[code].players.length>=4){sendTo(ws,{type:'error',message:'Лобби заполнено!'});return;}
      if(lobbies[code].gameState.phase!=='lobby'){sendTo(ws,{type:'error',message:'Игра уже идёт!'});return;}
      playerCode=code;
      const idx=lobbies[code].players.length;
      playerId=`p${idx+1}`;
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      const sp=SPAWN_POINTS[idx];
      lobbies[code].players.push({ws,id:playerId,name:msg.name||`Игрок ${idx+1}`,isHost:false,color:colors[idx]});
      lobbies[code].gameState.players.push({id:playerId,name:msg.name||`Игрок ${idx+1}`,x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[idx],stamina:100});
      sendTo(ws,{type:'joined_lobby',code,playerId,isHost:false,players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
      bcast(code,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='start_game'){
      if(!playerCode||!lobbies[playerCode]) return;
      const lobby=lobbies[playerCode];
      const host=lobby.players.find(p=>p.id===playerId);
      if(!host||!host.isHost) return;
      lobby.gameState.phase='playing';
      bcast(playerCode,{type:'game_start',items:lobby.gameState.items,players:lobby.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color}))});
      startGameLoop(playerCode);
    }
    else if(msg.type==='player_move'){
      if(!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const player=gs.players.find(p=>p.id===playerId);
      if(!player||player.caught) return;
      player.x=msg.x; player.z=msg.z; player.angle=msg.angle;
      if(msg.sprint&&player.stamina>0) player.stamina=Math.max(0,player.stamina-0.5);
      else if(!msg.sprint) player.stamina=Math.min(100,player.stamina+0.2);
      if(msg.interact){
        gs.items.forEach(item=>{
          if(item.collected) return;
          if(Math.sqrt((player.x-item.x)**2+(player.z-item.z)**2)<1.2){
            item.collected=true;
            if(item.type==='energo'){player.adrenaline=true;setTimeout(()=>{if(player)player.adrenaline=false;},8000);}
            bcast(playerCode,{type:'item_collected',itemId:item.id,itemType:item.type,playerId});
          }
        });
      }
    }
    else if(msg.type==='heal_player'){
      if(!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const healer=gs.players.find(p=>p.id===playerId);
      const target=gs.players.find(p=>p.id===msg.targetId);
      if(!healer||!target||!target.caught) return;
      if(Math.sqrt((healer.x-target.x)**2+(healer.z-target.z)**2)<2.5){
        target.caught=false; target.hp=100;
        bcast(playerCode,{type:'player_healed',playerId:target.id});
      }
    }
  });
  ws.on('close',()=>{
    if(!playerCode||!lobbies[playerCode]) return;
    lobbies[playerCode].players=lobbies[playerCode].players.filter(p=>p.id!==playerId);
    lobbies[playerCode].gameState.players=lobbies[playerCode].gameState.players.filter(p=>p.id!==playerId);
    if(lobbies[playerCode].players.length===0){clearInterval(lobbies[playerCode].interval);delete lobbies[playerCode];}
    else bcast(playerCode,{type:'lobby_update',players:lobbies[playerCode].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`🌲 Лес Мишкана запущен на порту ${PORT}`));
