const http = require('http');
const WebSocket = require('ws');
const fs = require('fs');
const path = require('path');

const server = http.createServer((req, res) => {
  let fp = path.join(__dirname, 'public', req.url === '/' ? 'index.html' : req.url);
  const ext = path.extname(fp);
  const mime = {'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
  fs.readFile(fp, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': mime[ext] || 'text/plain' });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const lobbies = {};
function generateCode() { return Math.random().toString(36).substring(2,6).toUpperCase(); }

// ════════════════════════════════════════
//  КАРТА «СЕТКА СТРАХА» 36x36
//  Генерируется алгоритмически
// ════════════════════════════════════════
function generateGridMap() {
  const S = 36;
  const map = [];
  for (let z = 0; z < S; z++) map.push(new Array(S).fill(0));

  // Внешние стены
  for (let i = 0; i < S; i++) {
    map[0][i]=1; map[S-1][i]=1; map[i][0]=1; map[i][S-1]=1;
  }

  // Блоки деревьев 4x4 через каждые 2 клетки
  const STEP=6, BS=4;
  for (let z = 2; z < S-2; z += STEP) {
    for (let x = 2; x < S-2; x += STEP) {
      // Пропускаем зону спавна игроков (центр ~15-21)
      if (z >= 12 && z <= 20 && x >= 12 && x <= 20) continue;
      // Пропускаем зону мишкана (юго-восток ~24-32)
      if (z >= 24 && x >= 24) continue;
      for (let bz = 0; bz < BS; bz++)
        for (let bx = 0; bx < BS; bx++)
          if (z+bz < S-1 && x+bx < S-1) map[z+bz][x+bx] = 1;
    }
  }

  // Открываем выход на севере (центр)
  for (let x = 15; x <= 20; x++) map[0][x] = 0;
  // Проход к выходу — свободная просека z=1 по центру
  for (let x = 14; x <= 21; x++) map[1][x] = 0;

  // Зона сбора (точка побега) z=30, x=16-20 — свободна
  for (let z2 = 28; z2 <= S-2; z2++)
    for (let x2 = 13; x2 <= 22; x2++)
      map[z2][x2] = 0;

  return map;
}

// Позиции предметов на карте 36x36
function placeItems() {
  const items = [];
  // 10 страниц
  const pages = [
    {x:2.5,z:1.5},{x:33.5,z:1.5},
    {x:1.5,z:8.5},{x:8.5,z:8.5},
    {x:26.5,z:8.5},{x:33.5,z:8.5},
    {x:1.5,z:20.5},{x:8.5,z:20.5},
    {x:8.5,z:26.5},{x:14.5,z:28.5},
  ];
  pages.forEach((p,i) => items.push({id:`page_${i}`,type:'page',x:p.x,z:p.z,collected:false}));

  // 5 энергосов
  const energos = [
    {x:11.5,z:3.5},{x:23.5,z:3.5},
    {x:5.5,z:14.5},{x:29.5,z:14.5},{x:17.5,z:20.5},
  ];
  energos.forEach((e,i) => items.push({id:`energo_${i}`,type:'energo',x:e.x,z:e.z,collected:false}));

  // Кресты 5-7 штук
  const crossPool = [
    {x:4.5,z:4.5},{x:16.5,z:4.5},{x:28.5,z:4.5},
    {x:4.5,z:10.5},{x:28.5,z:10.5},
    {x:10.5,z:16.5},{x:24.5,z:16.5},
    {x:4.5,z:22.5},{x:28.5,z:22.5},
    {x:10.5,z:28.5},{x:24.5,z:28.5},
  ];
  const crossCount = 5 + Math.floor(Math.random()*3);
  crossPool.sort(()=>Math.random()-0.5).slice(0,crossCount).forEach((c,i) =>
    items.push({id:`cross_${i}`,type:'cross',x:c.x,z:c.z,collected:false})
  );
  return items;
}

const SPAWN_PTS = [{x:17,z:17},{x:18,z:17},{x:17,z:18},{x:18,z:18}];
const MISHKAN_SPAWN = {x:30.5,z:30.5};
const EXIT_POS = {x:17.5,z:0.7};
const GATHER_POS = {x:17.5,z:30};

function createMishkan() {
  return {
    x:MISHKAN_SPAWN.x, z:MISHKAN_SPAWN.z,
    angle:0, speed:0.062, state:'patrol',
    patrolTarget:{x:28,z:26},
    lastUpdate:Date.now(),
    gracePeriod:8000,
    stuckTimer:0, stuckX:MISHKAN_SPAWN.x, stuckZ:MISHKAN_SPAWN.z,
    banished:false, banishTimer:0,
  };
}

function tryMove(m, nx, nz, map) {
  const mx=Math.floor(nx), mz=Math.floor(nz);
  if (map[mz] && map[mz][mx] !== 1) { m.x=nx; m.z=nz; return true; }
  // скольжение
  if (map[Math.floor(m.z)] && map[Math.floor(m.z)][mx] !== 1) { m.x=nx; return true; }
  if (map[mz] && map[mz][Math.floor(m.x)] !== 1) { m.z=nz; return true; }
  return false;
}

function updateMishkan(gs) {
  const m = gs.mishkan;
  const map = gs.map;
  const now = Date.now();
  const dt = Math.min((now - m.lastUpdate)/1000, 0.05);
  m.lastUpdate = now;

  // Изгнание крестом
  if (m.banished) {
    m.banishTimer -= dt;
    if (m.banishTimer <= 0) {
      m.banished = false;
      m.x = MISHKAN_SPAWN.x; m.z = MISHKAN_SPAWN.z;
      m.gracePeriod = 5000;
    }
    return null;
  }

  // Grace period
  if (m.gracePeriod > 0) {
    m.gracePeriod -= dt*1000;
    const dx=m.patrolTarget.x-m.x, dz=m.patrolTarget.z-m.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if (dist<1) m.patrolTarget={x:26+Math.random()*6,z:24+Math.random()*6};
    else {
      const spd=m.speed*55*dt*0.5;
      tryMove(m, m.x+(dx/dist)*spd, m.z+(dz/dist)*spd, map);
      m.angle=Math.atan2(dx,dz);
    }
    return null;
  }

  // Финальная фаза — ускорение
  const escapeMult = gs.escapeActive ? 1.8 : 1.0;

  let closest=null, closestDist=Infinity;
  gs.players.forEach(p => {
    if (p.caught) return;
    const d=Math.sqrt((p.x-m.x)**2+(p.z-m.z)**2);
    if (d<closestDist) { closestDist=d; closest=p; }
  });

  if (closest) {
    if (closestDist < 0.85 && !closest.caught) {
      closest.caught=true; closest.caughtTime=Date.now();
      return {event:'caught', playerId:closest.id};
    }
    m.state='chase';
    const dx=closest.x-m.x, dz=closest.z-m.z;
    const len=Math.sqrt(dx*dx+dz*dz);
    const spd=m.speed*55*dt*(closestDist<8?1.6:1.2)*escapeMult;
    const moved=tryMove(m, m.x+(dx/len)*spd, m.z+(dz/len)*spd, map);
    m.angle=Math.atan2(dx,dz);

    // Антизастревание
    m.stuckTimer+=dt;
    if (m.stuckTimer>1.5) {
      const moved2=Math.sqrt((m.x-m.stuckX)**2+(m.z-m.stuckZ)**2);
      m.stuckTimer=0; m.stuckX=m.x; m.stuckZ=m.z;
      if (moved2<0.15) {
        const tx=m.x+(closest.x-m.x)*0.25, tz=m.z+(closest.z-m.z)*0.25;
        const cx=Math.floor(tx), cz=Math.floor(tz);
        if (map[cz]&&map[cz][cx]!==1) { m.x=tx; m.z=tz; }
      }
    }
  } else {
    m.state='patrol';
    const dx=m.patrolTarget.x-m.x, dz=m.patrolTarget.z-m.z;
    const dist=Math.sqrt(dx*dx+dz*dz);
    if (dist<1) {
      let nx,nz,att=0;
      do { nx=2+Math.floor(Math.random()*32); nz=2+Math.floor(Math.random()*32); att++; }
      while (map[nz]&&map[nz][nx]===1&&att<80);
      m.patrolTarget={x:nx+0.5,z:nz+0.5};
    } else {
      const spd=m.speed*55*dt*0.75;
      tryMove(m, m.x+(dx/dist)*spd, m.z+(dz/dist)*spd, map);
      m.angle=Math.atan2(dx,dz);
    }
  }
  return null;
}

function bcast(code,obj){
  const lobby=lobbies[code]; if(!lobby) return;
  const s=JSON.stringify(obj);
  lobby.players.forEach(p=>{ if(p.ws.readyState===WebSocket.OPEN) p.ws.send(s); });
}
function sendTo(ws,obj){ if(ws.readyState===WebSocket.OPEN) ws.send(JSON.stringify(obj)); }

function startGameLoop(code) {
  const lobby=lobbies[code];
  if(!lobby||lobby.interval) return;
  lobby.interval=setInterval(()=>{
    if(!lobbies[code]){clearInterval(lobby.interval);return;}
    const gs=lobby.gameState;
    if(!gs||gs.phase!=='playing') return;

    const ev=updateMishkan(gs);
    if(ev&&ev.event==='caught') bcast(code,{type:'player_caught',playerId:ev.playerId});

    // Проверка триггера финала
    if (!gs.escapeActive && gs.items.filter(i=>i.type==='page').every(p=>p.collected)) {
      const alive=gs.players.filter(p=>!p.caught);
      const allInZone=alive.length>0&&alive.every(p=>Math.sqrt((p.x-GATHER_POS.x)**2+(p.z-GATHER_POS.z)**2)<4);
      if (allInZone) {
        gs.escapeActive=true;
        gs.escapeStartTime=Date.now();
        // Расчищаем коридор к выходу
        for (let z2=1;z2<34;z2++) for (let x2=13;x2<=21;x2++) gs.map[z2][x2]=0;
        bcast(code,{type:'escape_start'});
      }
    }

    // Таймер побега
    if (gs.escapeActive && gs.escapeStartTime) {
      const elapsed=(Date.now()-gs.escapeStartTime)/1000;
      if (elapsed>101.5) {
        gs.players.forEach(p=>{ if(!p.caught&&p.z>2) { p.caught=true; bcast(code,{type:'player_caught',playerId:p.id}); }});
      }
    }

    bcast(code,{
      type:'game_state',
      mishkan:{x:gs.mishkan.x,z:gs.mishkan.z,angle:gs.mishkan.angle,state:gs.mishkan.state,banished:gs.mishkan.banished},
      players:gs.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,angle:p.angle,caught:p.caught,hp:p.hp,color:p.color})),
      items:gs.items,
      escapeActive:gs.escapeActive||false,
      map:gs.escapeActive?gs.map:undefined,
    });

    const allPages=gs.items.filter(i=>i.type==='page').every(p=>p.collected);
    const alive=gs.players.filter(p=>!p.caught);
    if(allPages&&gs.escapeActive){
      alive.forEach(p=>{ if(p.z<2){ gs.phase='won'; bcast(code,{type:'game_won'}); } });
    }
    if(alive.length===0&&gs.players.length>0&&gs.phase==='playing'){
      gs.phase='lost'; bcast(code,{type:'game_lost'});
    }
  },50);
}

wss.on('connection',ws=>{
  let playerCode=null,playerId=null;
  ws.on('message',raw=>{
    let msg; try{msg=JSON.parse(raw);}catch{return;}

    if(msg.type==='create_lobby'){
      const code=generateCode();
      const map=generateGridMap(), items=placeItems();
      lobbies[code]={players:[],gameState:{phase:'lobby',map,items,mishkan:createMishkan(),players:[],escapeActive:false}};
      playerCode=code; playerId='p1';
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      lobbies[code].players.push({ws,id:'p1',name:msg.name||'Игрок 1',isHost:true,color:colors[0]});
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:SPAWN_PTS[0].x,z:SPAWN_PTS[0].z,angle:0,caught:false,hp:100,color:colors[0],stamina:100});
      sendTo(ws,{type:'lobby_created',code,playerId:'p1',isHost:true});
      sendTo(ws,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='join_lobby'){
      const code=msg.code.toUpperCase();
      if(!lobbies[code]){sendTo(ws,{type:'error',message:'Лобби не найдено!'});return;}
      if(lobbies[code].players.length>=4){sendTo(ws,{type:'error',message:'Лобби заполнено!'});return;}
      if(lobbies[code].gameState.phase!=='lobby'){sendTo(ws,{type:'error',message:'Игра уже идёт!'});return;}
      playerCode=code;
      const idx=lobbies[code].players.length; playerId=`p${idx+1}`;
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      const sp=SPAWN_PTS[idx];
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
      bcast(playerCode,{type:'game_start',map:lobby.gameState.map,items:lobby.gameState.items,players:lobby.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color}))});
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
          const d=Math.sqrt((player.x-item.x)**2+(player.z-item.z)**2);
          if(d<1.3){
            item.collected=true;
            if(item.type==='energo'){player.adrenaline=true;setTimeout(()=>{if(player)player.adrenaline=false;},8000);}
            bcast(playerCode,{type:'item_collected',itemId:item.id,itemType:item.type,playerId});
          }
        });
      }
    }
    else if(msg.type==='use_cross'){
      if(!playerCode||!lobbies[playerCode]) return;
      const gs=lobbies[playerCode].gameState;
      const player=gs.players.find(p=>p.id===playerId);
      if(!player||player.caught) return;
      // Проверяем что у игрока есть крест
      const cross=gs.items.find(i=>i.type==='cross'&&i.collected&&i.heldBy===playerId);
      const d=Math.sqrt((player.x-gs.mishkan.x)**2+(player.z-gs.mishkan.z)**2);
      if(d<7&&!gs.mishkan.banished){
        gs.mishkan.banished=true; gs.mishkan.banishTimer=30;
        bcast(playerCode,{type:'mishkan_banished',duration:30});
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
