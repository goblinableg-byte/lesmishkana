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

// ✅ ФИКСИРОВАННАЯ карта 32x32 — точно такая же как в клиенте
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

function placeItems() {
  const pages = [
    {id:'page_0',type:'page',x:2.5,z:1.5,collected:false},
    {id:'page_1',type:'page',x:26.5,z:1.5,collected:false},
    {id:'page_2',type:'page',x:4.5,z:4.5,collected:false},
    {id:'page_3',type:'page',x:7.5,z:8.5,collected:false},
    {id:'page_4',type:'page',x:29.5,z:8.5,collected:false},
    {id:'page_5',type:'page',x:5.5,z:13.5,collected:false},
    {id:'page_6',type:'page',x:1.5,z:18.5,collected:false},
    {id:'page_7',type:'page',x:13.5,z:22.5,collected:false},
    {id:'page_8',type:'page',x:4.5,z:25.5,collected:false},
    {id:'page_9',type:'page',x:30.5,z:29.5,collected:false},
  ];
  const energos = [
    {id:'energo_0',type:'energo',x:21.5,z:1.5,collected:false},
    {id:'energo_1',type:'energo',x:3.5,z:5.5,collected:false},
    {id:'energo_2',type:'energo',x:27.5,z:9.5,collected:false},
    {id:'energo_3',type:'energo',x:2.5,z:23.5,collected:false},
    {id:'energo_4',type:'energo',x:20.5,z:26.5,collected:false},
  ];
  return [...pages, ...energos];
}

// ✅ Спавн-точки совпадают с клиентом (центр карты)
const SPAWN_POINTS = [{x:15.5,z:15.5},{x:16.5,z:15.5},{x:15.5,z:16.5},{x:16.5,z:16.5}];
// ✅ Мишкан — северо-восточный угол, далеко от игроков
const MISHKAN_SPAWN = {x:29.5, z:21.5};

function createMishkan() {
  return {
    x: MISHKAN_SPAWN.x, z: MISHKAN_SPAWN.z,
    angle: 0,
    speed: 0.055,
    state: 'patrol',
    patrolTarget: { x:25, z:18 },
    lastUpdate: Date.now(),
    gracePeriod: 8000  // 8 секунд
  };
}

function updateMishkan(gs) {
  const m = gs.mishkan;
  const map = FIXED_MAP; // ✅ всегда используем фиксированную карту
  const now = Date.now();
  const dt = Math.min((now - m.lastUpdate)/1000, 0.1);
  m.lastUpdate = now;

  // ✅ Grace period — первые 8 сек не атакует
  if (m.gracePeriod > 0) {
    m.gracePeriod -= dt * 1000;
    // Просто патрулирует
    const dx = m.patrolTarget.x - m.x, dz = m.patrolTarget.z - m.z;
    const dist = Math.sqrt(dx*dx + dz*dz);
    if (dist < 0.5) {
      m.patrolTarget = { x: 20 + (Math.random()-0.5)*10, z: 20 + (Math.random()-0.5)*10 };
    } else {
      const spd = m.speed * 60 * dt * 0.7;
      const nx = m.x+(dx/dist)*spd, nz = m.z+(dz/dist)*spd;
      if (map[Math.floor(nz)] && map[Math.floor(nz)][Math.floor(nx)] !== 1) { m.x=nx; m.z=nz; }
      m.angle = Math.atan2(dx, dz);
    }
    return null;
  }

  // ✅ Ищем ближайшего живого игрока
  let closest = null, closestDist = Infinity;
  gs.players.forEach(p => {
    if (p.caught) return;
    const d = Math.sqrt((p.x-m.x)**2 + (p.z-m.z)**2);
    if (d < closestDist) { closestDist = d; closest = p; }
  });

  if (closest && closestDist < 18) {
    // ✅ ПОГОНЯ
    m.state = 'chase';
    const dx = closest.x-m.x, dz = closest.z-m.z;
    const len = Math.sqrt(dx*dx+dz*dz);
    const spd = m.speed * 60 * dt * 1.4;
    const nx = m.x+(dx/len)*spd, nz = m.z+(dz/len)*spd;
    if (map[Math.floor(nz)] && map[Math.floor(nz)][Math.floor(nx)] !== 1) {
      m.x=nx; m.z=nz;
    } else {
      // Стена — пробуем обойти
      if (map[Math.floor(m.z)] && map[Math.floor(m.z)][Math.floor(nx)] !== 1) m.x=nx;
      else if (map[Math.floor(nz)] && map[Math.floor(nz)][Math.floor(m.x)] !== 1) m.z=nz;
    }
    m.angle = Math.atan2(dx, dz);
    if (closestDist < 1.0 && !closest.caught) {
      closest.caught = true; closest.caughtTime = Date.now();
      return { event:'caught', playerId:closest.id };
    }
  } else {
    // ✅ ПАТРУЛЬ
    m.state = 'patrol';
    const dx = m.patrolTarget.x-m.x, dz = m.patrolTarget.z-m.z;
    const dist = Math.sqrt(dx*dx+dz*dz);
    if (dist < 0.8) {
      let nx, nz, att=0;
      do {
        nx = 2 + Math.floor(Math.random()*28);
        nz = 2 + Math.floor(Math.random()*28);
        att++;
      } while (FIXED_MAP[nz] && FIXED_MAP[nz][nx]===1 && att<60);
      m.patrolTarget = {x:nx+0.5, z:nz+0.5};
    } else {
      const spd = m.speed * 60 * dt;
      const nx = m.x+(dx/dist)*spd, nz = m.z+(dz/dist)*spd;
      if (FIXED_MAP[Math.floor(nz)] && FIXED_MAP[Math.floor(nz)][Math.floor(nx)] !== 1) {
        m.x=nx; m.z=nz;
      } else {
        // Обход стены при патруле
        if (FIXED_MAP[Math.floor(m.z)] && FIXED_MAP[Math.floor(m.z)][Math.floor(nx)] !== 1) m.x=nx;
        else if (FIXED_MAP[Math.floor(nz)] && FIXED_MAP[Math.floor(nz)][Math.floor(m.x)] !== 1) m.z=nz;
        else m.patrolTarget = {x:15+Math.random()*5, z:15+Math.random()*5}; // сброс цели
      }
      m.angle = Math.atan2(dx, dz);
    }
  }
  return null;
}

function bcast(code, obj) {
  const lobby=lobbies[code]; if(!lobby) return;
  const s=JSON.stringify(obj);
  lobby.players.forEach(p=>{ if(p.ws.readyState===WebSocket.OPEN) p.ws.send(s); });
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

    bcast(code, {
      type:'game_state',
      mishkan:{x:gs.mishkan.x, z:gs.mishkan.z, angle:gs.mishkan.angle},
      // ✅ НЕ отправляем x/z игроков — клиент сам управляет своей позицией
      // Отправляем только состояние (caught, hp) и позиции ДРУГИХ игроков
      players: gs.players.map(p=>({
        id:p.id, name:p.name, x:p.x, z:p.z,
        angle:p.angle, caught:p.caught, hp:p.hp, color:p.color
      })),
      items:gs.items
    });

    // Проверка победы
    const allPages = gs.items.filter(i=>i.type==='page').every(p=>p.collected);
    const alive = gs.players.filter(p=>!p.caught);
    if(allPages && gs.phase==='playing'){
      alive.forEach(p=>{
        const dx=p.x-15.5, dz=p.z-0.7;
        if(Math.sqrt(dx*dx+dz*dz)<2.5){
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
      lobbies[code]={
        players:[],
        gameState:{ phase:'lobby', map:FIXED_MAP, items:placeItems(), mishkan:createMishkan(), players:[] }
      };
      playerCode=code; playerId='p1';
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      const sp=SPAWN_POINTS[0];
      lobbies[code].players.push({ws,id:'p1',name:msg.name||'Игрок 1',isHost:true,color:colors[0]});
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[0],stamina:100,adrenaline:false});
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
      lobbies[code].gameState.players.push({id:playerId,name:msg.name||`Игрок ${idx+1}`,x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[idx],stamina:100,adrenaline:false});
      sendTo(ws,{type:'joined_lobby',code,playerId,isHost:false,players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
      bcast(code,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }

    else if(msg.type==='start_game'){
      if(!playerCode||!lobbies[playerCode]) return;
      const lobby=lobbies[playerCode];
      const host=lobby.players.find(p=>p.id===playerId);
      if(!host||!host.isHost) return;
      lobby.gameState.phase='playing';
      bcast(playerCode,{
        type:'game_start',
        items:lobby.gameState.items,
        players:lobby.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color}))
      });
      startGameLoop(playerCode);
    }

    else if(msg.type==='player_move'){
      if(!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const player=gs.players.find(p=>p.id===playerId);
      if(!player||player.caught) return;
      // ✅ Обновляем позицию на сервере для других игроков
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
    if(lobbies[playerCode].players.length===0){
      clearInterval(lobbies[playerCode].interval);
      delete lobbies[playerCode];
    } else {
      bcast(playerCode,{type:'lobby_update',players:lobbies[playerCode].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`🌲 Лес Мишкана запущен на порту ${PORT}`));
