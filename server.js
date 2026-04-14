const http=require('http'),WebSocket=require('ws'),fs=require('fs'),path=require('path');
const server=http.createServer((req,res)=>{
  const fp=path.join(__dirname,'public',req.url==='/'?'index.html':req.url);
  const ext=path.extname(fp);
  const mime={'.html':'text/html','.js':'application/javascript','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.mp3':'audio/mpeg','.m4a':'audio/mp4'};
  fs.readFile(fp,(err,data)=>{if(err){res.writeHead(404);res.end('Not found');return;}res.writeHead(200,{'Content-Type':mime[ext]||'text/plain'});res.end(data);});
});
const wss=new WebSocket.Server({server});
const lobbies={};
function genCode(){return Math.random().toString(36).substring(2,6).toUpperCase();}

function genMap(){
  const S=64,map=[];
  for(let z=0;z<S;z++)map.push(new Array(S).fill(1));
  function carveRoom(x1,z1,x2,z2){for(let z=z1;z<=z2;z++)for(let x=x1;x<=x2;x++)map[z][x]=0;}
  function carveCorridor(x1,z1,x2,z2){
    if(Math.random()<0.5){for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)map[z1][x]=0;for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)map[z][x2]=0;}
    else{for(let z=Math.min(z1,z2);z<=Math.max(z1,z2);z++)map[z][x1]=0;for(let x=Math.min(x1,x2);x<=Math.max(x1,x2);x++)map[z2][x]=0;}
  }
  const rooms=[
    {x1:2,z1:2,x2:12,z2:10},{x1:14,z1:2,x2:24,z2:8},{x1:27,z1:2,x2:38,z2:10},
    {x1:41,z1:2,x2:52,z2:9},{x1:55,z1:2,x2:62,z2:12},{x1:2,z1:13,x2:11,z2:23},
    {x1:14,z1:11,x2:26,z2:22},{x1:29,z1:13,x2:40,z2:23},{x1:43,z1:11,x2:62,z2:24},
    {x1:2,z1:26,x2:14,z2:38},{x1:17,z1:25,x2:32,z2:37},{x1:35,z1:26,x2:50,z2:38},
    {x1:52,z1:27,x2:62,z2:40},{x1:4,z1:42,x2:16,z2:52},{x1:20,z1:41,x2:44,z2:55},
  ];
  rooms.forEach(r=>carveRoom(r.x1,r.z1,r.x2,r.z2));
  const cx=(r)=>Math.floor((r.x1+r.x2)/2),cz=(r)=>Math.floor((r.z1+r.z2)/2);
  [[0,1],[1,2],[2,3],[3,4],[0,5],[1,6],[2,7],[3,8],[4,8],[5,6],[6,7],[7,8],[5,9],[6,10],[7,11],[8,12],[9,10],[10,11],[11,12],[9,13],[10,14],[13,14]]
    .forEach(([a,b])=>carveCorridor(cx(rooms[a]),cz(rooms[a]),cx(rooms[b]),cz(rooms[b])));
  for(let x=30;x<=34;x++){map[0][x]=0;map[1][x]=0;}
  carveRoom(rooms[10].x1,rooms[10].z1,rooms[10].x2,rooms[10].z2);
  return map;
}

// === HOUSE FLOOR MAPS ===
// Floor 1: entrance hall with stairs up (to floor2) and locked basement door
// Floor 2: 4 rooms connected by a hallway, stairs back down, random key in one room
// Basement: dark 9x9, central phone, stairs up

function genFloor1Map(){
  // 20x20 house floorplan
  const W=20,H=20,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  // Main hall
  for(let z=2;z<18;z++)for(let x=2;x<18;x++)map[z][x]=0;
  // Interior wall dividers to make rooms feel distinct
  // Room divider horizontal at z=9
  for(let x=2;x<14;x++)map[9][x]=1;
  map[9][7]=0; // doorway
  // Room divider vertical at x=10 (top half)
  for(let z=2;z<9;z++)map[z][10]=1;
  map[5][10]=0; // doorway top
  // Room divider vertical at x=10 (bottom half)
  for(let z=9;z<18;z++)map[z][10]=1;
  map[13][10]=0; // doorway bottom
  // Stairs up at top-right area (x=15,z=3) — marker tile stays open
  // Basement door at bottom-center (x=9,z=16) — stays open but locked logically
  return map;
}

function genFloor2Map(){
  // 28x20 multi-room attic
  const W=28,H=20,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  // Central hallway z=8..11, x=2..26
  for(let z=7;z<13;z++)for(let x=2;x<26;x++)map[z][x]=0;
  // Room A (top-left): x=2..8, z=2..6
  for(let z=2;z<7;z++)for(let x=2;x<9;x++)map[z][x]=0;
  map[7][5]=0; // door to hallway
  // Room B (top-right): x=10..16, z=2..6
  for(let z=2;z<7;z++)for(let x=10;x<17;x++)map[z][x]=0;
  map[7][13]=0;
  // Room C (far-right top): x=18..25, z=2..6
  for(let z=2;z<7;z++)for(let x=18;x<26;x++)map[z][x]=0;
  map[7][22]=0;
  // Room D (bottom-center): x=8..18, z=14..18
  for(let z=14;z<19;z++)for(let x=8;x<19;x++)map[z][x]=0;
  map[12][13]=0; // door to hallway
  // Stairs down at x=3,z=9 (center of hallway left)
  return map;
}

function genBasementMap(){
  // 13x13 dark basement
  const W=13,H=13,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  // Main room
  for(let z=2;z<11;z++)for(let x=2;x<11;x++)map[z][x]=0;
  // Stairs up marker at x=3,z=9
  return map;
}

// Pick which floor2 room gets the secret key (0=RoomA,1=RoomB,2=RoomC,3=RoomD)
function pickKeyRoom(){return Math.floor(Math.random()*4);}
// Key positions for each room
const FLOOR2_KEY_POS=[
  {x:5.5,z:4.5},  // Room A
  {x:13.5,z:4.5}, // Room B
  {x:22.5,z:4.5}, // Room C
  {x:13.5,z:16.5} // Room D
];

function genCorridorMap(){
  const W=64,H=500,map=[];
  for(let z=0;z<H;z++)map.push(new Array(W).fill(1));
  const cx=Math.floor(W/2);
  for(let z=0;z<H;z++)for(let x=cx-6;x<=cx+6;x++)map[z][x]=0;
  for(let x=cx-6;x<=cx+6;x++){map[0][x]=0;map[1][x]=0;}
  return map;
}

function isCell(map,x,z){const mx=Math.floor(x),mz=Math.floor(z);if(mz<0||mz>=map.length||mx<0||mx>=map[0].length)return false;return map[mz][mx]===0;}
function freeNear(map,x,z){if(isCell(map,x,z))return{x,z};for(let r=1;r<=5;r++)for(let dz2=-r;dz2<=r;dz2++)for(let dx2=-r;dx2<=r;dx2++){const nx=x+dx2,nz=z+dz2;if(isCell(map,nx,nz))return{x:nx+0.5,z:nz+0.5};}return{x,z};}

const SPAWNS=[{x:7,z:6},{x:8,z:6},{x:7,z:7},{x:8,z:7}];
const MISHKAN_SPAWN={x:22,z:16};
const GATHER={x:24.5,z:31};
const ALTAR_POS={x:24.5,z:31};

function makeItems(map){
  const defs=[
    {id:'page_0',type:'page',x:3.5,z:3.5},{id:'page_1',type:'page',x:10.5,z:4.5},{id:'page_2',type:'page',x:31.5,z:5.5},{id:'page_3',type:'page',x:49.5,z:5.5},{id:'page_4',type:'page',x:58.5,z:7.5},
    {id:'page_5',type:'page',x:3.5,z:17.5},{id:'page_6',type:'page',x:55.5,z:17.5},{id:'page_7',type:'page',x:3.5,z:31.5},{id:'page_8',type:'page',x:42.5,z:31.5},{id:'page_9',type:'page',x:8.5,z:47.5},
    {id:'page_10',type:'page',x:20.5,z:6.5},{id:'page_11',type:'page',x:35.5,z:4.5},{id:'page_12',type:'page',x:61.5,z:5.5},{id:'page_13',type:'page',x:6.5,z:14.5},{id:'page_14',type:'page',x:47.5,z:14.5},
    {id:'page_15',type:'page',x:19.5,z:18.5},{id:'page_16',type:'page',x:38.5,z:20.5},{id:'page_17',type:'page',x:60.5,z:20.5},{id:'page_18',type:'page',x:9.5,z:35.5},{id:'page_19',type:'page',x:25.5,z:33.5},
    {id:'page_20',type:'page',x:46.5,z:34.5},{id:'page_21',type:'page',x:58.5,z:33.5},{id:'page_22',type:'page',x:4.5,z:50.5},{id:'page_23',type:'page',x:30.5,z:48.5},{id:'page_24',type:'page',x:42.5,z:50.5},
    {id:'energo_0',type:'energo',x:18.5,z:4.5},{id:'energo_1',type:'energo',x:45.5,z:4.5},{id:'energo_2',type:'energo',x:7.5,z:18.5},{id:'energo_3',type:'energo',x:57.5,z:18.5},{id:'energo_4',type:'energo',x:24.5,z:30.5},
  ];
  [{x:18,z:6},{x:36,z:14},{x:8,z:44}].forEach((c,i)=>defs.push({id:`cross_${i}`,type:'cross',x:c.x+0.5,z:c.z+0.5}));
  [{x:11.5,z:4.5},{x:23.5,z:3.5},{x:37.5,z:3.5},{x:51.5,z:3.5},{x:61.5,z:4.5},{x:3.5,z:20.5},{x:25.5,z:12.5},{x:39.5,z:15.5},{x:61.5,z:13.5},{x:13.5,z:29.5},{x:49.5,z:29.5},{x:61.5,z:30.5},{x:5.5,z:48.5},{x:43.5,z:46.5}]
    .forEach((l,i)=>defs.push({id:`locker_${i}`,type:'locker',x:l.x,z:l.z}));
  defs.push({id:'altar_0',type:'altar',x:ALTAR_POS.x,z:ALTAR_POS.z});
  return defs.map(d=>{const f=freeNear(map,d.x,d.z);return{...d,x:f.x,z:f.z,collected:false};});
}

// BFS path cache
const pathCache=new Map();
setInterval(()=>{const now=Date.now();for(const[k,v]of pathCache)if(now-v.ts>8000)pathCache.delete(k);},10000);

function bfsPath(map,fx,fz,tx,tz){
  const sx=Math.floor(fx),sz=Math.floor(fz),ex=Math.floor(tx),ez=Math.floor(tz);
  if(sx===ex&&sz===ez)return[];
  const key=sx+','+sz+'|'+ex+','+ez;
  const cached=pathCache.get(key);
  if(cached){cached.ts=Date.now();return cached.path;}
  const SZ=map.length,SX=map[0].length;
  const prev=new Int32Array(SZ*SX).fill(-1);
  const start=sz*SX+sx;
  prev[start]=start;
  const q=[start];
  let head=0,found=false;
  while(head<q.length&&q.length<8000){
    const idx=q[head++];
    const cx2=idx%SX,cz2=(idx-cx2)/SX;
    if(cx2===ex&&cz2===ez){found=true;break;}
    const dirs=[[0,-1],[0,1],[-1,0],[1,0]];
    for(let d=0;d<4;d++){
      const nx=cx2+dirs[d][0],nz=cz2+dirs[d][1];
      if(nx<0||nx>=SX||nz<0||nz>=SZ||map[nz][nx]===1)continue;
      const ni=nz*SX+nx;
      if(prev[ni]!==-1)continue;
      prev[ni]=idx;q.push(ni);
    }
  }
  if(!found){pathCache.set(key,{path:[],ts:Date.now()});return[];}
  const path=[];let cur=ez*SX+ex,safety=0;
  while(cur!==start&&safety++<1000){path.unshift([cur%SX,Math.floor(cur/SX)]);cur=prev[cur];}
  pathCache.set(key,{path,ts:Date.now()});
  return path;
}

function newMishkan(){
  return{
    x:MISHKAN_SPAWN.x,z:MISHKAN_SPAWN.z,angle:0,baseSpeed:0.030,phase:1,
    patrolTarget:{x:24,z:16},lastUpdate:Date.now(),gracePeriod:8000,
    banished:false,banishTimer:0,escapeRunning:false,
    path:[],pathTargetX:-1,pathTargetZ:-1,pathAge:0,
    stuckX:MISHKAN_SPAWN.x,stuckZ:MISHKAN_SPAWN.z,stuckT:0,
    heardNoise:null,heardNoiseT:0,hearingEnabled:false,noiseRadius:0
  };
}

function smartMove(m,tx,tz,spd,map){
  const dist=Math.sqrt((tx-m.x)**2+(tz-m.z)**2);
  if(dist<0.05)return;
  const etx=Math.floor(tx),etz=Math.floor(tz);
  const now=Date.now();
  const needRepath=m.path.length===0||m.pathTargetX!==etx||m.pathTargetZ!==etz||(now-m.pathAge)>2500;
  if(needRepath){m.path=bfsPath(map,m.x,m.z,tx,tz);m.pathTargetX=etx;m.pathTargetZ=etz;m.pathAge=now;}
  if(m.path.length>0){
    // Skip already-passed waypoints
    while(m.path.length>0){
      const wp=m.path[0];
      const wx=wp[0]+0.5,wz=wp[1]+0.5;
      if(Math.sqrt((wx-m.x)**2+(wz-m.z)**2)<0.42){m.path.shift();continue;}
      const dx=wx-m.x,dz=wz-m.z,len=Math.sqrt(dx*dx+dz*dz);
      const step=Math.min(spd,len);
      const nx=m.x+(dx/len)*step,nz=m.z+(dz/len)*step;
      const free=(px,pz)=>{const mx2=Math.floor(px),mz2=Math.floor(pz);return mz2>=0&&mz2<map.length&&mx2>=0&&mx2<map[0].length&&map[mz2][mx2]!==1;};
      if(free(nx,nz)){m.x=nx;m.z=nz;}
      else if(free(nx,m.z)){m.x=nx;}
      else if(free(m.x,nz)){m.z=nz;}
      else{m.path=[];}
      m.angle=Math.atan2(dx,dz);
      return;
    }
  }
  // Short-range direct
  if(dist<3){
    const dx=tx-m.x,dz=tz-m.z,len=Math.sqrt(dx*dx+dz*dz);
    const step=Math.min(spd,len);
    const nx=m.x+(dx/len)*step,nz=m.z+(dz/len)*step;
    const free=(px,pz)=>{const mx2=Math.floor(px),mz2=Math.floor(pz);return mz2>=0&&mz2<map.length&&mx2>=0&&mx2<map[0].length&&map[mz2][mx2]!==1;};
    if(free(nx,nz)){m.x=nx;m.z=nz;m.angle=Math.atan2(dx,dz);}
    else if(free(nx,m.z)){m.x=nx;m.angle=Math.atan2(dx,dz);}
    else if(free(m.x,nz)){m.z=nz;m.angle=Math.atan2(dx,dz);}
  }
}

function pickFreeCell(map){let nx,nz,a=0;do{nx=2+Math.floor(Math.random()*58);nz=2+Math.floor(Math.random()*55);a++;}while(a<120&&map[nz]&&map[nz][nx]===1);return{x:nx+0.5,z:nz+0.5};}
function pickOppositeCell(map,x,z){const ox=x<32?40+Math.random()*18:4+Math.random()*20;const oz=z<28?36+Math.random()*18:4+Math.random()*20;return freeNear(map,ox,oz);}

function tickMishkan(gs){
  const m=gs.mishkan,map=gs.map;
  const now=Date.now(),dt=Math.min((now-m.lastUpdate)/1000,0.05);
  m.lastUpdate=now;
  if(m.banished){
    m.banishTimer-=dt;
    if(m.banishTimer<=0){m.banished=false;m.x=MISHKAN_SPAWN.x;m.z=MISHKAN_SPAWN.z;m.gracePeriod=gs.allPagesCollected?999999:5000;m.path=[];m.pathTargetX=-1;m.pathTargetZ=-1;}
    return null;
  }
  const collected=gs.items.filter(i=>i.type==='page'&&i.collected).length;
  m.phase=collected<9?1:collected<17?2:3;
  m.hearingEnabled=m.phase>=2;
  m.noiseRadius=m.phase===2?15:20;
  const phaseSpeed=m.phase===1?1.0:m.phase===2?1.35:1.7;
  const spd=m.baseSpeed*45*dt*phaseSpeed;
  if(m.gracePeriod>0){m.gracePeriod-=dt*1000;const d2p=Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2);smartMove(m,m.patrolTarget.x,m.patrolTarget.z,spd*0.3,map);if(d2p<1.5){m.patrolTarget=pickFreeCell(map);m.path=[];}return null;}
  if(gs.escapeActive&&!m.escapeRunning)return null;
  if(m.heardNoise){m.heardNoiseT-=dt;if(m.heardNoiseT<=0)m.heardNoise=null;}
  let closest=null,cd=Infinity;
  gs.players.forEach(p=>{if(p.caught||p.hidingLockerId)return;const d=Math.sqrt((p.x-m.x)**2+(p.z-m.z)**2);if(d<cd){cd=d;closest=p;}});
  gs.players.forEach(p=>{if(!p.hidingLockerId)return;const item=gs.items.find(i=>i.id===p.hidingLockerId);if(!item)return;if(Math.sqrt((item.x-m.x)**2+(item.z-m.z)**2)<1.5&&!p.lockerMinigameActive)p.lockerMinigameActive=true;});
  if(!closest){
    let target=null;
    if(m.heardNoise)target={x:m.heardNoise.x,z:m.heardNoise.z};
    if(!target){let ltd=Infinity;gs.players.forEach(p=>{if(!p.hidingLockerId)return;const item=gs.items.find(i=>i.id===p.hidingLockerId);if(!item)return;const d=Math.sqrt((item.x-m.x)**2+(item.z-m.z)**2);if(d<ltd){ltd=d;target=item;}});}
    if(!target)target=m.patrolTarget;
    smartMove(m,target.x,target.z,spd*0.75,map);
    if(Math.sqrt((m.patrolTarget.x-m.x)**2+(m.patrolTarget.z-m.z)**2)<1.5){m.patrolTarget=pickFreeCell(map);m.path=[];}
    return null;
  }
  // Catch only when truly close
  if(cd<1.1&&!closest.caught){closest.caught=true;return{event:'caught',id:closest.id};}
  const escMult=m.escapeRunning?8.0:1.0;
  smartMove(m,closest.x,closest.z,spd*(cd<5?1.1:1.0)*escMult,map);
  m.stuckT+=dt;
  if(m.stuckT>2.5){const md=Math.sqrt((m.x-m.stuckX)**2+(m.z-m.stuckZ)**2);if(md<0.25){m.path=[];m.pathTargetX=-1;m.pathTargetZ=-1;}m.stuckT=0;m.stuckX=m.x;m.stuckZ=m.z;}
  return null;
}

function bcast(code,obj){const lb=lobbies[code];if(!lb)return;const s=JSON.stringify(obj);lb.players.forEach(p=>{if(p.ws.readyState===WebSocket.OPEN)p.ws.send(s);});}
function sendTo(ws,obj){if(ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify(obj));}

function startLoop(code){
  const lb=lobbies[code];if(!lb||lb.interval)return;
  const gs=lb.gameState;
  const pages=gs.items.filter(i=>i.type==='page');
  const darkIdxs=new Set();while(darkIdxs.size<3)darkIdxs.add(Math.floor(Math.random()*pages.length));
  darkIdxs.forEach(i=>{pages[i].dark=true;});
  lb.interval=setInterval(()=>{
    if(!lobbies[code]){clearInterval(lb.interval);return;}
    const gs=lb.gameState;if(!gs||gs.phase!=='playing')return;
    if(!gs.prePhaseDone)return;
    const ev=tickMishkan(gs);
    if(ev?.event==='caught')bcast(code,{type:'player_caught',playerId:ev.id});
    gs.players.forEach(p=>{
      if(!p.hidingLockerId)return;
      const item=gs.items.find(i=>i.id===p.hidingLockerId);if(!item)return;
      const d=Math.sqrt((item.x-gs.mishkan.x)**2+(item.z-gs.mishkan.z)**2);
      const ws=lb.players.find(lp=>lp.id===p.id)?.ws;
      if(ws&&ws.readyState===WebSocket.OPEN)ws.send(JSON.stringify({type:'locker_mishkan_dist',dist:d,active:p.lockerMinigameActive||false}));
    });
    if(!gs.allPagesCollected){
      gs.players.forEach(p=>{
        if(p.caught||p.hidingLockerId||!p.atAltar)return;
        const altar=gs.items.find(i=>i.type==='altar');if(!altar)return;
        if(Math.sqrt((p.x-altar.x)**2+(p.z-altar.z)**2)>2.5){p.atAltar=false;p.altarT=0;return;}
        p.altarT=(p.altarT||0)+(50/1000);
        const pws=lb.players.find(lp=>lp.id===p.id)?.ws;
        if(pws)sendTo(pws,{type:'altar_progress',progress:p.altarT/3.0});
        if(p.altarT>=3.0&&!p.altarUsed){
          p.altarUsed=true;p.atAltar=false;p.altarT=0;
          gs.altarCharges=(gs.altarCharges||0)+1;
          bcast(code,{type:'altar_activated',charges:gs.altarCharges,playerId:p.id});
          const al=gs.items.find(i=>i.type==='altar');
          if(al){gs.mishkan.heardNoise={x:al.x,z:al.z};gs.mishkan.heardNoiseT=15;}
          setTimeout(()=>{if(p)p.altarUsed=false;},30000);
        }
      });
    }
    if(!gs.allPagesCollected&&gs.items.filter(i=>i.type==='page').every(p=>p.collected)){
      gs.allPagesCollected=true;gs.mishkan.gracePeriod=999999;
      bcast(code,{type:'pages_all_collected'});
    }
    if(gs.allPagesCollected&&!gs.escapeActive){
      const alive=gs.players.filter(p=>!p.caught);
      if(alive.length>0&&alive.every(p=>Math.sqrt((p.x-GATHER.x)**2+(p.z-GATHER.z)**2)<6)){
        gs.escapeActive=true;gs.escapeStart=Date.now();gs.map=genCorridorMap();gs.corridorMap=true;
        const cxC=32;
        gs.players.forEach((p,i)=>{p.x=cxC-2+i%3;p.z=488-Math.floor(i/3)*2;p.hidingLockerId=null;p.lockerMinigameActive=false;});
        gs.mishkan.x=cxC;gs.mishkan.z=498;gs.mishkan.escapeRunning=false;gs.mishkan.gracePeriod=0;gs.mishkan.path=[];gs.mishkan.pathTargetX=-1;gs.mishkan.pathTargetZ=-1;
        bcast(code,{type:'escape_start',map:gs.map,players:gs.players.map(p=>({id:p.id,x:p.x,z:p.z}))});
      }
    }
    if(gs.escapeActive&&gs.escapeStart){const el=(Date.now()-gs.escapeStart)/1000;if(el>101){gs.players.forEach(p=>{if(!p.caught&&p.z>3){p.caught=true;bcast(code,{type:'player_caught',playerId:p.id});}});gs.phase='escape_ended';}}
    if(gs.escapeActive&&gs.phase==='playing'){const escaped=gs.players.filter(p=>!p.caught&&p.z<3);if(escaped.length>0&&!gs.gameWonSent){gs.gameWonSent=true;gs.phase='won';bcast(code,{type:'game_won'});}}
    if(gs.prePhaseDone&&gs.players.length>0&&gs.players.every(p=>p.caught)&&gs.phase==='playing'){gs.phase='lost';bcast(code,{type:'game_lost'});}
    // Broadcast full game state every tick for movement sync
    bcast(code,{type:'game_state',
      mishkan:{x:gs.mishkan.x,z:gs.mishkan.z,angle:gs.mishkan.angle,banished:gs.mishkan.banished,phase:gs.mishkan.phase},
      players:gs.players.map(p=>({id:p.id,x:p.x,z:p.z,angle:p.angle,caught:p.caught,hp:p.hp,hidingLockerId:p.hidingLockerId,floor:p.floor||'forest',hasSecretKey:p.hasSecretKey})),
      items:gs.items,allPagesCollected:gs.allPagesCollected,
      phoneRinging:gs.secretState?.phoneRinging,
      // Phone distance per player: send individually below
    });
    // Send phone volume per player based on basement distance
    if(gs.secretState?.phoneRinging&&gs.house){
      gs.players.forEach(p=>{
        if(p.floor!=='basement')return;
        const dist=Math.sqrt((p.x-gs.house.phone.x)**2+(p.z-gs.house.phone.z)**2);
        const ws2=lobbies[code].players.find(lp=>lp.id===p.id)?.ws;
        if(ws2&&ws2.readyState===WebSocket.OPEN)ws2.send(JSON.stringify({type:'phone_volume',dist}));
      });
    }
  },50);
}

wss.on('connection',ws=>{
  let pCode=null,pId=null;
  ws.on('message',raw=>{
    let msg;try{msg=JSON.parse(raw);}catch{return;}
    if(msg.type==='create_lobby'){
      const code=genCode(),map=genMap(),items=makeItems(map);
      const keyRoom=pickKeyRoom();
      const houseData={
        floor1Map:genFloor1Map(),floor2Map:genFloor2Map(),basementMap:genBasementMap(),
        keyRoom,
        // Special positions
        stairsUp:{x:15.5,z:3.5},     // floor1 -> floor2
        stairsDown2:{x:3.5,z:9.5},   // floor2 -> floor1
        basementDoor:{x:9.5,z:16.5}, // floor1 -> basement (locked until hasSecretKey)
        stairsBasement:{x:3.5,z:9.5},// basement -> floor1
        phone:{x:6.5,z:6.5},         // phone in basement
      };
      lobbies[code]={players:[],gameState:{phase:'lobby',map,items,mishkan:newMishkan(),players:[],allPagesCollected:false,escapeActive:false,altarCharges:0,house:houseData,secretState:{phoneRinging:false,readyHidden:false,gennadyChosen:false,ending:false}}};
      pCode=code;pId='p1';const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];
      lobbies[code].players.push({ws,id:'p1',name:msg.name||'Игрок 1',isHost:true,color:colors[0]});
      lobbies[code].gameState.players.push({id:'p1',name:msg.name||'Игрок 1',x:SPAWNS[0].x,z:SPAWNS[0].z,angle:0,caught:false,hp:100,color:colors[0],stamina:100,hidingLockerId:null,lockerMinigameActive:false,lockerEnterTime:null,atAltar:false,altarT:0,floor:'forest',hasSecretKey:false});
      sendTo(ws,{type:'lobby_created',code,playerId:'p1',isHost:true});
      sendTo(ws,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='join_lobby'){
      const code=msg.code.toUpperCase();
      if(!lobbies[code]){sendTo(ws,{type:'error',message:'Лобби не найдено!'});return;}
      if(lobbies[code].players.length>=4){sendTo(ws,{type:'error',message:'Лобби заполнено!'});return;}
      if(lobbies[code].gameState.phase!=='lobby'){sendTo(ws,{type:'error',message:'Игра уже идёт!'});return;}
      pCode=code;const idx=lobbies[code].players.length;pId='p'+(idx+1);
      const colors=['#ff6b6b','#4ecdc4','#ffe66d','#a8e6cf'];const sp=SPAWNS[idx];
      lobbies[code].players.push({ws,id:pId,name:msg.name||'Игрок '+(idx+1),isHost:false,color:colors[idx]});
      lobbies[code].gameState.players.push({id:pId,name:msg.name||'Игрок '+(idx+1),x:sp.x,z:sp.z,angle:0,caught:false,hp:100,color:colors[idx],stamina:100,hidingLockerId:null,lockerMinigameActive:false,lockerEnterTime:null,atAltar:false,altarT:0,floor:'forest',hasSecretKey:false});
      sendTo(ws,{type:'joined_lobby',code,playerId:pId,isHost:false,players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
      bcast(code,{type:'lobby_update',players:lobbies[code].players.map(p=>({id:p.id,name:p.name,color:p.color}))});
    }
    else if(msg.type==='player_ready'){if(!pCode||!lobbies[pCode])return;const lb=lobbies[pCode];if(!lb.readySet)lb.readySet=new Set();lb.readySet.add(pId);bcast(pCode,{type:'player_ready_ack',readyIds:[...lb.readySet]});}
    else if(msg.type==='start_game'){if(!pCode||!lobbies[pCode])return;const lb=lobbies[pCode],host=lb.players.find(p=>p.id===pId);if(!host?.isHost)return;lb.gameState.phase='playing';bcast(pCode,{type:'game_start',map:lb.gameState.map,items:lb.gameState.items,players:lb.gameState.players.map(p=>({id:p.id,name:p.name,x:p.x,z:p.z,color:p.color})),house:lb.gameState.house});startLoop(pCode);}
    else if(msg.type==='game_ready'){if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;if(gs)gs.prePhaseDone=true;}
    else if(msg.type==='player_move'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState,pl=gs.players.find(p=>p.id===pId);
      if(!pl||pl.caught)return;
      if(!pl.hidingLockerId){
        pl.x=msg.x;pl.z=msg.z;pl.angle=msg.angle;
        if(msg.floor)pl.floor=msg.floor;
        if(msg.sprint&&pl.stamina>0)pl.stamina=Math.max(0,pl.stamina-0.5);
        else if(!msg.sprint)pl.stamina=Math.min(100,pl.stamina+0.2);
        if(msg.sprint&&gs.mishkan.hearingEnabled){
          const nd=Math.sqrt((pl.x-gs.mishkan.x)**2+(pl.z-gs.mishkan.z)**2);
          if(nd<gs.mishkan.noiseRadius){gs.mishkan.heardNoise={x:pl.x,z:pl.z};gs.mishkan.heardNoiseT=8;}
        }
      }
      if(msg.interact&&!pl.hidingLockerId){
        const house=gs.house;
        // Floor transition interactions
        if(pl.floor==='floor1'&&house){
          const dStairsUp=Math.sqrt((pl.x-house.stairsUp.x)**2+(pl.z-house.stairsUp.z)**2);
          if(dStairsUp<1.5){
            pl.floor='floor2';pl.x=house.stairsDown2.x+1;pl.z=house.stairsDown2.z;
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'floor_change',floor:'floor2',x:pl.x,z:pl.z});
          }
          const dBasement=Math.sqrt((pl.x-house.basementDoor.x)**2+(pl.z-house.basementDoor.z)**2);
          if(dBasement<1.5){
            if(pl.hasSecretKey){
              pl.floor='basement';pl.x=house.stairsBasement.x;pl.z=house.stairsBasement.z-1;
              const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
              if(ws2)sendTo(ws2,{type:'floor_change',floor:'basement',x:pl.x,z:pl.z});
              // Start phone ringing for everyone
              if(!gs.secretState.phoneRinging){
                gs.secretState.phoneRinging=true;
                bcast(pCode,{type:'phone_start'});
              }
            } else {
              const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
              if(ws2)sendTo(ws2,{type:'basement_locked'});
            }
          }
        }
        if(pl.floor==='floor2'&&house){
          const dStairsDown=Math.sqrt((pl.x-house.stairsDown2.x)**2+(pl.z-house.stairsDown2.z)**2);
          if(dStairsDown<1.5){
            pl.floor='floor1';pl.x=house.stairsUp.x-1;pl.z=house.stairsUp.z;
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'floor_change',floor:'floor1',x:pl.x,z:pl.z});
          }
          // Secret key pickup on floor2
          const kp=FLOOR2_KEY_POS[house.keyRoom];
          const dKey=Math.sqrt((pl.x-kp.x)**2+(pl.z-kp.z)**2);
          if(dKey<1.3&&!gs.secretState.keyCollected&&!pl.hasSecretKey){
            gs.secretState.keyCollected=true;pl.hasSecretKey=true;
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'secret_key_found'});
          }
        }
        if(pl.floor==='basement'&&house){
          const dStairsUp2=Math.sqrt((pl.x-house.stairsBasement.x)**2+(pl.z-house.stairsBasement.z)**2);
          if(dStairsUp2<1.5){
            pl.floor='floor1';pl.x=house.basementDoor.x;pl.z=house.basementDoor.z-1;
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'floor_change',floor:'floor1',x:pl.x,z:pl.z});
          }
          // Phone interaction
          const dPhone=Math.sqrt((pl.x-house.phone.x)**2+(pl.z-house.phone.z)**2);
          if(dPhone<1.5&&gs.secretState.phoneRinging){
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'phone_interact'});
          }
        }
        // House entry: player in forest near house portal
        if(pl.floor==='forest'){
          // House door is at forest map coords ~(7,2)
          const dHouse=Math.sqrt((pl.x-7)**2+(pl.z-2)**2);
          if(dHouse<2.0){
            pl.floor='floor1';pl.x=9.5;pl.z=15.0;
            const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;
            if(ws2)sendTo(ws2,{type:'floor_change',floor:'floor1',x:pl.x,z:pl.z});
          }
        }
        gs.items.forEach(item=>{
          if(item.type==='altar'){const d=Math.sqrt((pl.x-item.x)**2+(pl.z-item.z)**2);if(d<2.5&&!gs.allPagesCollected)pl.atAltar=true;return;}
          if(item.type!=='locker'&&item.collected)return;
          const dist=Math.sqrt((pl.x-item.x)**2+(pl.z-item.z)**2);
          if(dist<1.4){
            if(item.type==='locker'){pl.hidingLockerId=item.id;pl.lockerEnterTime=Date.now();const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;if(ws2)sendTo(ws2,{type:'locker_entered',lockerId:item.id});return;}
            item.collected=true;
            if(item.type==='energo'){pl.adrenaline=true;setTimeout(()=>{if(pl)pl.adrenaline=false;},8000);}
            if(item.type==='page'&&item.dark&&!gs.allPagesCollected){
              const ang=Math.random()*Math.PI*2,r=7+Math.random()*4;
              const f=freeNear(gs.map,pl.x+Math.cos(ang)*r,pl.z+Math.sin(ang)*r);
              gs.mishkan.x=f.x;gs.mishkan.z=f.z;gs.mishkan.path=[];gs.mishkan.pathTargetX=-1;gs.mishkan.pathTargetZ=-1;
              bcast(pCode,{type:'dark_page_triggered',playerId:pId});
            }
            bcast(pCode,{type:'item_collected',itemId:item.id,itemType:item.type,playerId:pId,dark:item.dark||false});
          }
        });
      }
      if(!msg.interact)pl.atAltar=false;
      if(msg.interact&&pl.hidingLockerId){
        const enterCooldown=!pl.lockerEnterTime||(Date.now()-pl.lockerEnterTime)>800;
        if(!pl.lockerMinigameActive&&enterCooldown){pl.hidingLockerId=null;pl.lockerEnterTime=null;const ws2=lobbies[pCode].players.find(lp=>lp.id===pId)?.ws;if(ws2)sendTo(ws2,{type:'locker_exited'});}
      }
    }
    else if(msg.type==='gennady_choice'){
      if(!pCode||!lobbies[pCode])return;
      const gs=lobbies[pCode].gameState;
      if(msg.accept){
        gs.secretState.ending=true;
        bcast(pCode,{type:'gennady_ending'});
      } else {
        // Restore ready buttons
        gs.secretState.readyHidden=false;
        bcast(pCode,{type:'ready_restored'});
      }
    }
    else if(msg.type==='locker_minigame_fail'){if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;const pl=gs.players.find(p=>p.id===pId);if(!pl||!pl.hidingLockerId)return;pl.hidingLockerId=null;pl.lockerMinigameActive=false;pl.caught=true;bcast(pCode,{type:'player_caught',playerId:pId,fromLocker:true,lockerScream:true});}
    else if(msg.type==='locker_minigame_success'){
      if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;const pl=gs.players.find(p=>p.id===pId);if(!pl)return;
      pl.lockerMinigameActive=false;
      const opp=pickOppositeCell(gs.map,gs.mishkan.x,gs.mishkan.z);
      gs.mishkan.patrolTarget={x:opp.x,z:opp.z};gs.mishkan.heardNoise=null;gs.mishkan.path=[];gs.mishkan.pathTargetX=-1;gs.mishkan.pathTargetZ=-1;
    }
    else if(msg.type==='escape_phase2'){if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;if(gs.mishkan)gs.mishkan.escapeRunning=true;}
    else if(msg.type==='use_cross'){if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;if(gs.escapeActive)return;if(!gs.mishkan.banished){gs.mishkan.banished=true;gs.mishkan.banishTimer=30;bcast(pCode,{type:'mishkan_banished',duration:30});}}
    else if(msg.type==='heal_player'){if(!pCode||!lobbies[pCode])return;const gs=lobbies[pCode].gameState;const healer=gs.players.find(p=>p.id===pId),target=gs.players.find(p=>p.id===msg.targetId);if(!healer||!target||!target.caught)return;if(Math.sqrt((healer.x-target.x)**2+(healer.z-target.z)**2)<2.5){target.caught=false;target.hp=100;bcast(pCode,{type:'player_healed',playerId:target.id});}}
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
server.listen(PORT,'0.0.0.0',()=>console.log('Лес Мишкана на порту '+PORT));
