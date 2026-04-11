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

// ═══ КАРТА 36x36 (сетка страха) ═══
function genMap(){
  const S=36,map=[];
  for(let z=0;z<S;z++)map.push(new Array(S).fill(0));
  for(let i=0;i<S;i++){map[0][i]=1;map[S-1][i]=1;map[i][0]=1;map[i][S-1]=1;}
  for(let z=2;z<S-2;z+=6)for(let x=2;x<S-2;x+=6){
    if(z>=12&&z<=22&&x>=12&&x<=22)continue;
    if(z>=26&&x>=22)continue; // зона мишкана — свободна
    for(let bz=0;bz<4;bz++)for(let bx=0;bx<4;bx++)
      if(z+bz<S-1&&x+bx<S-1)map[z+bz][x+bx]=1;
  }
  // Выход север
  for(let x=14;x<=20;x++){map[0][x]=0;map[1][x]=0;}
  // Зона сбора юг — свободна
  for(let z=29;z<=S-2;z++)for(let x=13;x<=22;x++)map[z][x]=0;
  return map;
}

// ═══ КОРИДОР ПОБЕГА — ДЛИННЫЙ 768 ═══
function genCorridorMap(){
  const W=64,H=768,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  // Коридор шириной 12 по центру
  const cx=Math.floor(W/2);
  for(let z=0;z<H;z++)for(let x=cx-6;x<=cx+6;x++)map[z][x]=0;
  // Выход на севере открыт
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

const SPAWNS=[{x:17,z:17},{x:18,z:17},{x:17,z:18},{x:18,z:18}];
const MISHKAN_SPAWN={x:30,z:30};
const EXIT_NORMAL={x:17.5,z:0.7};
const GATHER={x:17.5,z:32};

function makeItems(map){
  const defs=[
    {id:'page_0',type:'page',x:2.5,z:1.5},{id:'page_1',type:'page',x:33.5,z:1.5},
    {id:'page_2',type:'page',x:1.5,z:8.5},{id:'page_3',type:'page',x:8.5,z:8.5},
    {id:'page_4',type:'page',x:26.5,z:8.5},{id:'page_5',type:'page',x:33.5,z:8.5},
    {id:'page_6',type:'page',x:1.5,z:20.5},{id:'page_7',type:'page',x:8.5,z:20.5},
    {id:'page_8',type:'page',x:8.5,z:26.5},{id:'page_9',type:'page',x:14.5,z:28.5},
    {id:'energo_0',type:'energo',x:11.5,z:3.5},{id:'energo_1',type:'energo',x:23.5,z:3.5},
    {id:'energo_2',type:'energo',x:5.5,z:14.5},{id:'energo_3',type:'energo',x:29.5,z:14.5},
    {id:'energo_4',type:'energo',x:17.5,z:20.5},
  ];
  const cPool=[{x:4,z:4},{x:16,z:4},{x:28,z:4},{x:4,z:10},{x:28,z:10},{x:10,z:16},{x:24,z:16},{x:4,z:22},{x:28,z:22}];
  const cn=5+Math.floor(Math.random()*3);
  cPool.sort(()=>Math.random()-0.5).slice(0,cn).forEach((c,i)=>defs.push({id:`cross_${i}`,type:'cross',x:c.x+0.5,z:c.z+0.5}));
  return defs.map(d=>{const f=freeNear(map,d.x,d.z);return{...d,x:f.x,z:f.z,collected:false};});
}

function newMishkan(){
  return{x:MISHKAN_SPAWN.x,z:MISHKAN_SPAWN.z,angle:0,speed:0.032,state:'patrol',
    patrolTarget:{x:28,z:28},lastUpdate:Date.now(),gracePeriod:8000,
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
  if(m.gracePeriod>0){m.gracePeriod-=dt*1000;moveTo(m,m.patrolTarget.x,m.patrolTarget.z,m.speed*45*dt*0.4,map);if(Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2)<1)m.patrolTarget={x:25+Math.random()*8,z:25+Math.random()*8};return null;}
  // escape phase — стоим пока не escapeRunning
  if(gs.escapeActive&&!m.escapeRunning)return null;
  let closest=null,cd=Infinity;
  gs.players.forEach(p=>{if(p.caught)return;const d=Math.sqrt((p.x-m.x)**2+(p.z-m.z)**2);if(d<cd){cd=d;closest=p;}});
  if(!closest){moveTo(m,m.patrolTarget.x,m.patrolTarget.z,m.speed*45*dt*0.7,map);if(Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2)<1){let nx,nz,a=0;do{nx=2+Math.floor(Math.random()*30);nz=2+Math.floor(Math.random()*30);a++;}while(map[nz]&&map[nz][nx]===1&&a<60);m.patrolTarget={x:nx+0.5,z:nz+0.5};}return null;}
  if(cd<0.8&&!closest.caught){closest.caught=true;return{event:'caught',id:closest.id};}
  const eMult=m.escapeRunning?7.0:1.0;
  moveTo(m,closest.x,closest.z,m.speed*45*dt*(cd<8?1.2:1.0)*eMult,map);
  // антизастревание
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
    const ev=tickMishkan(gs);
    if(ev?.event==='caught')bcast(code,{type:'player_caught',playerId:ev.id});
    // Все страницы собраны → скрыть выход+мишкана
    if(!gs.allPagesCollected&&gs.items.filter(i=>i.type==='page').every(p=>p.collected)){
      gs.allPagesCollected=true;
      gs.mishkan.gracePeriod=999999; // бесконечный — мишкан стоит
      bcast(code,{type:'pages_all_collected'});
    }
    // Триггер финала — все в зоне сбора
    if(gs.allPagesCollected&&!gs.escapeActive){
      const alive=gs.players.filter(p=>!p.caught);
      if(alive.length>0&&alive.every(p=>Math.sqrt((p.x-GATHER.x)**2+(p.z-GATHER.z)**2)<5)){
        gs.escapeActive=true;
        gs.escapeStart=Date.now();
        // Пересобираем карту в коридор 64x64
        gs.map=genCorridorMap();
        gs.corridorMap=true;
        // Игроки в южном конце (z≈245), бегут на север к z=0
        const cx=32;
        gs.players.forEach((p,i)=>{p.x=cx-2+i%3;p.z=755-Math.floor(i/3)*2;});
        // Мишкан позади всех (z=762), стоит пока не escapeRunning
        gs.mishkan.x=cx+0.5;gs.mishkan.z=762;gs.mishkan.escapeRunning=false;gs.mishkan.gracePeriod=0;
        bcast(code,{type:'escape_start',map:gs.map,players:gs.players.map(p=>({id:p.id,x:p.x,z:p.z}))});
      }
    }
    // escape_phase2 — мишкан начинает бежать (клиент присылает)
    // Таймер 101с
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
      players:gs.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,angle:p.angle,caught:p.caught,hp:p.hp,color:p.color})),
      items:gs.items,
      escapeActive:gs.escapeActive||false,
      allPagesCollected:gs.allPagesCollected||false,
    });
    // Победа
    if(gs.escapeActive){
      gs.players.filter(p=>!p.caught).forEach(p=>{if(p.z<3){gs.phase='won';bcast(code,{type:'game_won'});}});
    } else if(!gs.allPagesCollected){
      const pages=gs.items.filter(i=>i.type==='page');const alive=gs.players.filter(p=>!p.caught);
      if(pages.every(p=>p.collected)&&alive.length>0&&alive.every(p=>p.z<2)&&!gs.escapeActive){gs.phase='won';bcast(code,{type:'game_won'});}
    }
    if(gs.players.length>0&&gs.players.every(p=>p.caught)&&gs.phase==='playing'){gs.phase='lost';bcast(code,{type:'game_lost'});}
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
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:SPAWNS[0].x,z:SPAWNS[0].z,angle:0,caught:false,hp:100,color:colors[0],stamina:100});
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
      lobbies[code].gameState.players.push({id:pId,name:msg.name||`Игрок ${idx+1}`,x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[idx],stamina:100});
      sendTo(ws,{type:'joined_lobby',code,playerId:pId,isHost:false,players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
      bcast(code,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='player_ready'){
      // Pre-game ready system
      if(!pCode||!lobbies[pCode])return;
      const lb=lobbies[pCode];
      if(!lb.readySet)lb.readySet=new Set();
      lb.readySet.add(pId);
      // Broadcast ready list to all
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
    else if(msg.type==='player_move'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState,pl=gs.players.find(p=>p.id===pId);
      if(!pl||pl.caught)return;
      pl.x=msg.x;pl.z=msg.z;pl.angle=msg.angle;
      if(msg.sprint&&pl.stamina>0)pl.stamina=Math.max(0,pl.stamina-0.5);
      else if(!msg.sprint)pl.stamina=Math.min(100,pl.stamina+0.2);
      if(msg.interact){
        gs.items.forEach(item=>{
          if(item.collected)return;
          if(Math.sqrt((pl.x-item.x)**2+(pl.z-item.z)**2)<1.3){
            item.collected=true;
            if(item.type==='energo'){pl.adrenaline=true;setTimeout(()=>{if(pl)pl.adrenaline=false;},8000);}
            bcast(pCode,{type:'item_collected',itemId:item.id,itemType:item.type,playerId:pId});
          }
        });
      }
    }
    else if(msg.type==='escape_phase2'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(gs.mishkan)gs.mishkan.escapeRunning=true;
    }
    else if(msg.type==='use_cross'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(gs.escapeActive)return; // нельзя изгнать во время побега
      const d=Math.sqrt((gs.players.find(p=>p.id===pId)?.x-gs.mishkan.x)**2||0+(gs.players.find(p=>p.id===pId)?.z-gs.mishkan.z)**2||0);
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
