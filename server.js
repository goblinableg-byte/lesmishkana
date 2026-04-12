const http=require('http'),WebSocket=require('ws'),fs=require('fs'),path=require('path');
const server=http.createServer((req,res)=>{
  const fp=path.join(__dirname,'public',req.url==='/'?'index.html':req.url);
  const ext=path.extname(fp);
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
  fs.readFile(fp,(err,data)=>{
    if(err){res.writeHead(404);res.end('Not found');return;}
    res.writeHead(200,{'Content-Type':mime[ext]||'text/plain'});res.end(data);
  });
});
const wss=new WebSocket.Server({server});
const lobbies={};
function genCode(){return Math.random().toString(36).substring(2,6).toUpperCase();}

// ═══ КАРТА 64x64 — КОМНАТЫ ═══
function genMap(){
  const S=64,map=[];
  for(let z=0;z<S;z++)map.push(new Array(S).fill(1));

  function carveRoom(x1,z1,x2,z2){
    for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)map[z][x]=0;
  }
  function carveCorridor(x1,z1,x2,z2){
    if(Math.random()<0.5){for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)map[z1][x]=0;for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)map[z][x2]=0;}
    else{for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)map[z][x1]=0;for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)map[z2][x]=0;}
  }

  // 13 комнат разного размера, расположены по сетке
  const rooms=[
    {x1:2,  z1:2,  x2:12, z2:10},  // 0: стартовая
    {x1:14, z1:2,  x2:24, z2:8},   // 1
    {x1:27, z1:2,  x2:38, z2:10},  // 2
    {x1:41, z1:2,  x2:52, z2:9},   // 3
    {x1:55, z1:2,  x2:62, z2:12},  // 4
    {x1:2,  z1:13, x2:11, z2:23},  // 5
    {x1:14, z1:11, x2:26, z2:22},  // 6: центральный зал
    {x1:29, z1:13, x2:40, z2:23},  // 7
    {x1:43, z1:11, x2:62, z2:24},  // 8: большая комната
    {x1:2,  z1:26, x2:14, z2:38},  // 9
    {x1:17, z1:25, x2:32, z2:37},  // 10: зона сбора
    {x1:35, z1:26, x2:50, z2:38},  // 11
    {x1:52, z1:27, x2:62, z2:40},  // 12
    {x1:4,  z1:42, x2:16, z2:52},  // 13
    {x1:20, z1:41, x2:44, z2:55},  // 14: большой южный зал
  ];
  rooms.forEach(r=>carveRoom(r.x1,r.z1,r.x2,r.z2));

  // Коридоры между комнатами
  const cx=(r)=>Math.floor((r.x1+r.x2)/2),cz=(r)=>Math.floor((r.z1+r.z2)/2);
  carveCorridor(cx(rooms[0]),cz(rooms[0]),cx(rooms[1]),cz(rooms[1]));
  carveCorridor(cx(rooms[1]),cz(rooms[1]),cx(rooms[2]),cz(rooms[2]));
  carveCorridor(cx(rooms[2]),cz(rooms[2]),cx(rooms[3]),cz(rooms[3]));
  carveCorridor(cx(rooms[3]),cz(rooms[3]),cx(rooms[4]),cz(rooms[4]));
  carveCorridor(cx(rooms[0]),cz(rooms[0]),cx(rooms[5]),cz(rooms[5]));
  carveCorridor(cx(rooms[1]),cz(rooms[1]),cx(rooms[6]),cz(rooms[6]));
  carveCorridor(cx(rooms[2]),cz(rooms[2]),cx(rooms[7]),cz(rooms[7]));
  carveCorridor(cx(rooms[3]),cz(rooms[3]),cx(rooms[8]),cz(rooms[8]));
  carveCorridor(cx(rooms[4]),cz(rooms[4]),cx(rooms[8]),cz(rooms[8]));
  carveCorridor(cx(rooms[5]),cz(rooms[5]),cx(rooms[6]),cz(rooms[6]));
  carveCorridor(cx(rooms[6]),cz(rooms[6]),cx(rooms[7]),cz(rooms[7]));
  carveCorridor(cx(rooms[7]),cz(rooms[7]),cx(rooms[8]),cz(rooms[8]));
  carveCorridor(cx(rooms[5]),cz(rooms[5]),cx(rooms[9]),cz(rooms[9]));
  carveCorridor(cx(rooms[6]),cz(rooms[6]),cx(rooms[10]),cz(rooms[10]));
  carveCorridor(cx(rooms[7]),cz(rooms[7]),cx(rooms[11]),cz(rooms[11]));
  carveCorridor(cx(rooms[8]),cz(rooms[8]),cx(rooms[12]),cz(rooms[12]));
  carveCorridor(cx(rooms[9]),cz(rooms[9]),cx(rooms[10]),cz(rooms[10]));
  carveCorridor(cx(rooms[10]),cz(rooms[10]),cx(rooms[11]),cz(rooms[11]));
  carveCorridor(cx(rooms[11]),cz(rooms[11]),cx(rooms[12]),cz(rooms[12]));
  carveCorridor(cx(rooms[9]),cz(rooms[9]),cx(rooms[13]),cz(rooms[13]));
  carveCorridor(cx(rooms[10]),cz(rooms[10]),cx(rooms[14]),cz(rooms[14]));
  carveCorridor(cx(rooms[13]),cz(rooms[13]),cx(rooms[14]),cz(rooms[14]));

  // Выход на север
  for(let x=30;x<=34;x++){map[0][x]=0;map[1][x]=0;}

  // Зона сбора (комната 10) - всегда свободна
  carveRoom(rooms[10].x1,rooms[10].z1,rooms[10].x2,rooms[10].z2);

  return map;
}

// ═══ КОРИДОР ПОБЕГА 64x300 ═══
function genCorridorMap(){
  const W=64,H=300,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  const cx=Math.floor(W/2);
  for(let z=0;z<H;z++)for(let x=cx-6;x<=cx+6;x++)map[z][x]=0;
  for(let x=cx-6;x<=cx+6;x++){map[0][x]=0;map[1][x]=0;}
  return map;
}

function isCell(map,x,z){
  const mx=Math.floor(x),mz=Math.floor(z);
  if(mz<0||mz>=map.length||mx<0||mx>=map[0].length)return false;
  return map[mz][mx]===0;
}
function freeNear(map,x,z){
  if(isCell(map,x,z))return{x,z};
  for(let r=1;r<=5;r++)for(let dz=-r;dz<=r;dz++)for(let dx=-r;dx<=r;dx++){
    const nx=x+dx,nz=z+dz;
    if(isCell(map,nx,nz))return{x:nx+0.5,z:nz+0.5};
  }
  return{x,z};
}

const SPAWNS=[{x:7,z:6},{x:8,z:6},{x:7,z:7},{x:8,z:7}];
const MISHKAN_SPAWN={x:22,z:16};  // в комнате 6
const EXIT_NORMAL={x:32,z:0.7};
const GATHER={x:24.5,z:31};

function makeItems(map){
  const defs=[
    {id:'page_0',type:'page',x:3.5,z:3.5},{id:'page_1',type:'page',x:10.5,z:4.5},
    {id:'page_2',type:'page',x:31.5,z:5.5},{id:'page_3',type:'page',x:49.5,z:5.5},
    {id:'page_4',type:'page',x:58.5,z:7.5},{id:'page_5',type:'page',x:3.5,z:17.5},
    {id:'page_6',type:'page',x:55.5,z:17.5},{id:'page_7',type:'page',x:3.5,z:31.5},
    {id:'page_8',type:'page',x:42.5,z:31.5},{id:'page_9',type:'page',x:8.5,z:47.5},
    {id:'energo_0',type:'energo',x:18.5,z:4.5},{id:'energo_1',type:'energo',x:45.5,z:4.5},
    {id:'energo_2',type:'energo',x:7.5,z:18.5},{id:'energo_3',type:'energo',x:57.5,z:18.5},
    {id:'energo_4',type:'energo',x:24.5,z:30.5},
  ];
  // Меньше крестов — только 3
  const cPool=[{x:18,z:6},{x:36,z:14},{x:8,z:44}];
  cPool.forEach((c,i)=>defs.push({id:`cross_${i}`,type:'cross',x:c.x+0.5,z:c.z+0.5}));

  // Шкафчики — по одному в каждой комнате (кроме стартовой и зоны сбора)
  const lockerPositions=[
    {x:11.5,z:4.5},{x:23.5,z:3.5},{x:37.5,z:3.5},{x:51.5,z:3.5},{x:61.5,z:4.5},
    {x:3.5,z:20.5},{x:25.5,z:12.5},{x:39.5,z:15.5},{x:61.5,z:13.5},
    {x:13.5,z:29.5},{x:49.5,z:29.5},{x:61.5,z:30.5},
    {x:5.5,z:48.5},{x:43.5,z:46.5},
  ];
  lockerPositions.forEach((l,i)=>defs.push({id:`locker_${i}`,type:'locker',x:l.x,z:l.z}));

  return defs.map(d=>{const f=freeNear(map,d.x,d.z);return{...d,x:f.x,z:f.z,collected:false};});
}

function newMishkan(){
  return{x:MISHKAN_SPAWN.x,z:MISHKAN_SPAWN.z,angle:0,speed:0.028,state:'patrol',
    patrolTarget:{x:24,z:16},lastUpdate:Date.now(),gracePeriod:8000,
    banished:false,banishTimer:0,escapeRunning:false,
    stuckX:MISHKAN_SPAWN.x,stuckZ:MISHKAN_SPAWN.z,stuckT:0};
}

function moveTo(m,tx,tz,spd,map){
  const dx=tx-m.x,dz=tz-m.z,len=Math.sqrt(dx*dx+dz*dz);
  if(len<0.05)return false;
  const nx=m.x+(dx/len)*spd,nz=m.z+(dz/len)*spd;
  const moved=(mx,mz)=>map[Math.floor(mz)]&&map[Math.floor(mz)][Math.floor(mx)]!==1;
  if(moved(nx,nz)){m.x=nx;m.z=nz;m.angle=Math.atan2(dx,dz);return true;}
  if(moved(nx,m.z)){m.x=nx;m.angle=Math.atan2(dx,dz);return true;}
  if(moved(m.x,nz)){m.z=nz;m.angle=Math.atan2(dx,dz);return true;}
  return false;
}

function tickMishkan(gs){
  const m=gs.mishkan,map=gs.map;
  const now=Date.now(),dt=Math.min((now-m.lastUpdate)/1000,0.05);
  m.lastUpdate=now;
  if(m.banished){m.banishTimer-=dt;if(m.banishTimer<=0){m.banished=false;m.x=MISHKAN_SPAWN.x;m.z=MISHKAN_SPAWN.z;m.gracePeriod=gs.allPagesCollected?999999:5000;}return null;}
  if(m.gracePeriod>0){m.gracePeriod-=dt*1000;moveTo(m,m.patrolTarget.x,m.patrolTarget.z,m.speed*45*dt*0.4,map);if(Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2)<1)m.patrolTarget={x:15+Math.random()*30,z:5+Math.random()*30};return null;}
  if(gs.escapeActive&&!m.escapeRunning)return null;
  // Не преследуем игроков в шкафчиках — они спрятаны
  let closest=null,cd=Infinity;
  gs.players.forEach(p=>{
    if(p.caught||p.hidingLockerId)return;
    const d=Math.sqrt((p.x-m.x)**2+(p.z-m.z)**2);
    if(d<cd){cd=d;closest=p;}
  });
  // Проверить игроков в шкафчиках — мишкан подходит к шкафчику
  gs.players.forEach(p=>{
    if(!p.hidingLockerId)return;
    const item=gs.items.find(i=>i.id===p.hidingLockerId);
    if(!item)return;
    const d=Math.sqrt((item.x-m.x)**2+(item.z-m.z)**2);
    if(d<1.5&&!p.lockerMinigameActive){
      p.lockerMinigameActive=true;
      // сообщить игроку о начале мини-игры
    }
  });
  if(!closest){
    // Патрулировать, возможно идти к шкафчику со спрятанным игроком
    let lockerTarget=null,ltd=Infinity;
    gs.players.forEach(p=>{
      if(!p.hidingLockerId)return;
      const item=gs.items.find(i=>i.id===p.hidingLockerId);
      if(!item)return;
      const d=Math.sqrt((item.x-m.x)**2+(item.z-m.z)**2);
      if(d<ltd){ltd=d;lockerTarget=item;}
    });
    if(lockerTarget){moveTo(m,lockerTarget.x,lockerTarget.z,m.speed*45*dt*0.9,map);}
    else{moveTo(m,m.patrolTarget.x,m.patrolTarget.z,m.speed*45*dt*0.7,map);if(Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2)<1){let nx,nz,a=0;do{nx=2+Math.floor(Math.random()*58);nz=2+Math.floor(Math.random()*55);a++;}while(map[nz]&&map[nz][nx]===1&&a<80);m.patrolTarget={x:nx+0.5,z:nz+0.5};}}
    return null;
  }
  if(cd<0.8&&!closest.caught){closest.caught=true;return{event:'caught',id:closest.id};}
  const eMult=m.escapeRunning?7.0:1.0;
  moveTo(m,closest.x,closest.z,m.speed*45*dt*(cd<8?1.2:1.0)*eMult,map);
  m.stuckT+=dt;if(m.stuckT>1.5){const md=Math.sqrt((m.x-m.stuckX)**2+(m.z-m.stuckZ)**2);m.stuckT=0;m.stuckX=m.x;m.stuckZ=m.z;if(md<0.1){const tx=m.x+(closest.x-m.x)*0.3,tz=m.z+(closest.z-m.z)*0.3;if(map[Math.floor(tz)]&&map[Math.floor(tz)][Math.floor(tx)]!==1){m.x=tx;m.z=tz;}}}
  return null;
}

function bcast(code,obj){const lb=lobbies[code];if(!lb)return;const s=JSON.stringify(obj);lb.players.forEach(p=>{if(p.ws.readyState===WebSocket.OPEN)p.ws.send(s);});}
function sendTo(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}

function startLoop(code){
  const lb=lobbies[code];if(!lb||lb.interval)return;
  lb.interval=setInterval(()=>{
    if(!lobbies[code]){clearInterval(lb.interval);return;}
    const gs=lb.gameState;if(!gs||gs.phase!=='playing')return;
    if(!gs.prePhaseDone)return;
    const ev=tickMishkan(gs);
    if(ev?.event==='caught')bcast(code,{type:'player_caught',playerId:ev.id});

    // Уведомить игроков в шкафчиках если мишкан рядом
    gs.players.forEach(p=>{
      if(!p.hidingLockerId)return;
      const item=gs.items.find(i=>i.id===p.hidingLockerId);
      if(!item)return;
      const d=Math.sqrt((item.x-gs.mishkan.x)**2+(item.z-gs.mishkan.z)**2);
      const ws=lb.players.find(lp=>lp.id===p.id)?.ws;
      if(ws&&ws.readyState===WebSocket.OPEN){
        ws.send(JSON.stringify({type:'locker_mishkan_dist',dist:d,active:p.lockerMinigameActive||false}));
      }
    });

    if(!gs.allPagesCollected&&gs.items.filter(i=>i.type==='page').every(p=>p.collected)){
      gs.allPagesCollected=true;
      gs.mishkan.gracePeriod=999999;
      bcast(code,{type:'pages_all_collected'});
    }
    if(gs.allPagesCollected&&!gs.escapeActive){
      const alive=gs.players.filter(p=>!p.caught);
      if(alive.length>0&&alive.every(p=>Math.sqrt((p.x-GATHER.x)**2+(p.z-GATHER.z)**2)<6)){
        gs.escapeActive=true;
        gs.escapeStart=Date.now();
        gs.map=genCorridorMap();
        gs.corridorMap=true;
        const cxC=32;
        gs.players.forEach((p,i)=>{p.x=cxC-2+i%3;p.z=288-Math.floor(i/3)*2;p.hidingLockerId=null;p.lockerMinigameActive=false;});
        // ИСПРАВЛЕНО: мишкан в самом конце коридора (z=295), не в стене
        gs.mishkan.x=cxC;gs.mishkan.z=295;gs.mishkan.escapeRunning=false;gs.mishkan.gracePeriod=0;
        bcast(code,{type:'escape_start',map:gs.map,players:gs.players.map(p=>({id:p.id,x:p.x,z:p.z}))});
      }
    }
    if(gs.escapeActive&&gs.escapeStart){
      const el=(Date.now()-gs.escapeStart)/1000;
      if(el>101){
        gs.players.forEach(p=>{if(!p.caught&&p.z>3){p.caught=true;bcast(code,{type:'player_caught',playerId:p.id});}});
        gs.phase='escape_ended';
      }
    }
    bcast(code,{
      type:'game_state',
      mishkan:{x:gs.mishkan.x,z:gs.mishkan.z,angle:gs.mishkan.angle,state:gs.mishkan.state,banished:gs.mishkan.banished},
      players:gs.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,angle:p.angle,caught:p.caught,hp:p.hp,color:p.color,hidingLockerId:p.hidingLockerId||null})),
      items:gs.items,
      escapeActive:gs.escapeActive||false,
      allPagesCollected:gs.allPagesCollected||false,
    });
    if(gs.escapeActive){
      gs.players.filter(p=>!p.caught).forEach(p=>{if(p.z<3){gs.phase='won';bcast(code,{type:'game_won'});}});
    }
    if(gs.prePhaseDone&&gs.players.length>0&&gs.players.every(p=>p.caught)&&gs.phase==='playing'){gs.phase='lost';bcast(code,{type:'game_lost'});}
  },50);
}

wss.on('connection',ws=>{
  let pCode=null,pId=null;
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==='create_lobby'){
      const code=genCode(),map=genMap(),items=makeItems(map);
      lobbies[code]={players:[],gameState:{phase:'lobby',map,items,mishkan:newMishkan(),players:[],allPagesCollected:false,escapeActive:false}};
      pCode=code;pId='p1';
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      lobbies[code].players.push({ws,id:'p1',name:msg.name||'Игрок 1',isHost:true,color:colors[0]});
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:SPAWNS[0].x,z:SPAWNS[0].z,angle:0,caught:false,hp:100,color:colors[0],stamina:100,hidingLockerId:null,lockerMinigameActive:false});
      sendTo(ws,{type:'lobby_created',code,playerId:'p1',isHost:true});
      sendTo(ws,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='join_lobby'){
      const code=msg.code.toUpperCase();
      if(!lobbies[code]){sendTo(ws,{type:'error',message:'Лобби не найдено!'});return;}
      if(lobbies[code].players.length>=4){sendTo(ws,{type:'error',message:'Лобби заполнено!'});return;}
      if(lobbies[code].gameState.phase!=='lobby'){sendTo(ws,{type:'error',message:'Игра уже идёт!'});return;}
      pCode=code;const idx=lobbies[code].players.length;pId=`p${idx+1}`;
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];const sp=SPAWNS[idx];
      lobbies[code].players.push({ws,id:pId,name:msg.name||`Игрок ${idx+1}`,isHost:false,color:colors[idx]});
      lobbies[code].gameState.players.push({id:pId,name:msg.name||`Игрок ${idx+1}`,x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[idx],stamina:100,hidingLockerId:null,lockerMinigameActive:false});
      sendTo(ws,{type:'joined_lobby',code,playerId:pId,isHost:false,players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
      bcast(code,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='player_ready'){
      if(!pCode||!lobbies[pCode])return;
      const lb=lobbies[pCode];
      if(!lb.readySet)lb.readySet=new Set();
      lb.readySet.add(pId);
      bcast(pCode,{type:'player_ready_ack',readyIds:[...lb.readySet]});
    }
    else if(msg.type==='start_game'){
      if(!pCode||!lobbies[pCode])return;
      const lb=lobbies[pCode],host=lb.players.find(p=>p.id===pId);
      if(!host?.isHost)return;
      lb.gameState.phase='playing';
      bcast(pCode,{type:'game_start',map:lb.gameState.map,items:lb.gameState.items,players:lb.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color}))});
      startLoop(pCode);
    }
    else if(msg.type==='game_ready'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(gs)gs.prePhaseDone=true;
    }
    else if(msg.type==='player_move'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState,pl=gs.players.find(p=>p.id===pId);
      if(!pl||pl.caught)return;
      if(!pl.hidingLockerId){
        pl.x=msg.x;pl.z=msg.z;pl.angle=msg.angle;
        if(msg.sprint&&pl.stamina>0)pl.stamina=Math.max(0,pl.stamina-0.5);
        else if(!msg.sprint)pl.stamina=Math.min(100,pl.stamina+0.2);
      }
      if(msg.interact&&!pl.hidingLockerId){
        gs.items.forEach(item=>{
          if(item.collected)return;
          const dist=Math.sqrt((pl.x-item.x)**2+(pl.z-item.z)**2);
          if(dist<1.4){
            if(item.type==='locker'){
              // Войти в шкафчик
              pl.hidingLockerId=item.id;
              const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
              if(ws2)sendTo(ws2,{type:'locker_entered',lockerId:item.id});
              return;
            }
            item.collected=true;
            if(item.type==='energo'){pl.adrenaline=true;setTimeout(()=>{if(pl)pl.adrenaline=false;},8000);}
            bcast(pCode,{type:'item_collected',itemId:item.id,itemType:item.type,playerId:pId});
          }
        });
      }
      if(msg.interact&&pl.hidingLockerId){
        // Выйти из шкафчика (если мини-игра не активна)
        if(!pl.lockerMinigameActive){
          pl.hidingLockerId=null;
          const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
          if(ws2)sendTo(ws2,{type:'locker_exited'});
        }
      }
    }
    else if(msg.type==='locker_minigame_fail'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      const pl=gs.players.find(p=>p.id===pId);
      if(!pl||!pl.hidingLockerId)return;
      pl.hidingLockerId=null;pl.lockerMinigameActive=false;
      pl.caught=true;
      bcast(pCode,{type:'player_caught',playerId:pId,fromLocker:true,lockerScream:true});
    }
    else if(msg.type==='locker_minigame_success'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      const pl=gs.players.find(p=>p.id===pId);
      if(!pl)return;
      pl.lockerMinigameActive=false;
      // Мишкан уходит от шкафчика — сбросить патрульную цель
      gs.mishkan.patrolTarget={x:10+Math.random()*50,z:5+Math.random()*45};
    }
    else if(msg.type==='escape_phase2'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(gs.mishkan)gs.mishkan.escapeRunning=true;
    }
    else if(msg.type==='use_cross'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(gs.escapeActive)return;
      if(!gs.mishkan.banished){gs.mishkan.banished=true;gs.mishkan.banishTimer=30;bcast(pCode,{type:'mishkan_banished',duration:30});}
    }
    else if(msg.type==='heal_player'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      const healer=gs.players.find(p=>p.id===pId),target=gs.players.find(p=>p.id===msg.targetId);
      if(!healer||!target||!target.caught)return;
      if(Math.sqrt((healer.x-target.x)**2+(healer.z-target.z)**2)<2.5){target.caught=false;target.hp=100;bcast(pCode,{type:'player_healed',playerId:target.id});}
    }
  });
  ws.on('close',()=>{
    if(!pCode||!lobbies[pCode])return;
    lobbies[pCode].players=lobbies[pCode].players.filter(p=>p.id!==pId);
    lobbies[pCode].gameState.players=lobbies[pCode].gameState.players.filter(p=>p.id!==pId);
    if(lobbies[pCode].players.length===0){clearInterval(lobbies[pCode].interval);delete lobbies[pCode];}
    else bcast(pCode,{type:'lobby_update',players:lobbies[pCode].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
  });
});
const PORT=process.env.PORT||3000;
server.listen(PORT,'0.0.0.0',()=>console.log(`🌲 Лес Мишкана на порту ${PORT}`));
