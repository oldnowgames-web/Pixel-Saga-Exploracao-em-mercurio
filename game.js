(() => {
"use strict";

const $ = id => document.getElementById(id);

// Modo touch: celulares e tablets (ou ?touch=1 para testar no PC)
const touchMode = matchMedia("(pointer: coarse)").matches || /[?&]touch=1/.test(location.search);
if(touchMode) document.body.classList.add("touch");
const touch = {x:0, y:0, run:false, moving:false}; // analógico: x direita+, y frente+
let lookId = null;                                  // dedo que está girando a câmera
const AK = touchMode ? "AÇÃO" : "E";
const MAX_DPR = touchMode ? 1.25 : 1.6;
const startScreen = $("start");
const message = $("message");
const objectiveText = $("objectiveText");

if (!window.THREE) {
  message.textContent = "Não foi possível carregar o Three.js. Verifique sua internet.";
  return;
}

// --------------------------------------------------
// CENA, CÂMERA E RENDERIZAÇÃO
// --------------------------------------------------

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x08090c, 0.0018);

const camera = new THREE.PerspectiveCamera(
  76, innerWidth / innerHeight, 0.1, 4000
);
camera.rotation.order = "YXZ";

const renderer = new THREE.WebGLRenderer({
  antialias:!touchMode, powerPreference:"high-performance"
});
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, MAX_DPR));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
document.body.appendChild(renderer.domElement);

// Sem atmosfera: quase nenhuma luz de preenchimento, sombras bem escuras
scene.add(new THREE.HemisphereLight(0x6b778c,0x29221d,0.3));

// --------------------------------------------------
// SOL ENORME (~13x maior que visto da Terra) + DUPLO AMANHECER
// --------------------------------------------------

const SUN_AZIMUTH = Math.atan2(-340,-180);
const SUN_DISTANCE = 2400;
const SUN_ANGULAR_DIAMETER = 15 * Math.PI / 180; // ~28x o tamanho visto da Terra
const SUN_RADIUS = SUN_DISTANCE * Math.tan(SUN_ANGULAR_DIAMETER / 2);
const SUN_BASE_INTENSITY = 6.0; // ~7x a luz solar na Terra

const sunLight = new THREE.DirectionalLight(0xfff4e0,SUN_BASE_INTENSITY);
sunLight.castShadow = true;
sunLight.shadow.mapSize.set(touchMode?1024:2048,touchMode?1024:2048);
sunLight.shadow.camera.left = -90;
sunLight.shadow.camera.right = 90;
sunLight.shadow.camera.top = 90;
sunLight.shadow.camera.bottom = -90;
sunLight.shadow.camera.far = 700;
sunLight.shadow.bias = -0.00025;
sunLight.shadow.normalBias = 0.025;
scene.add(sunLight);
scene.add(sunLight.target);

function makeGlowTexture(c0, c1) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(256,256,0,256,256,256);
  g.addColorStop(0,c0);
  g.addColorStop(.18,c0);
  g.addColorStop(.32,c1);
  g.addColorStop(.6,"rgba(255,220,160,.10)");
  g.addColorStop(1,"rgba(255,200,120,0)");
  x.fillStyle = g; x.fillRect(0,0,512,512);
  const t = new THREE.CanvasTexture(c);
  t.encoding = THREE.sRGBEncoding;
  return t;
}

const sun = new THREE.Mesh(
  new THREE.SphereGeometry(SUN_RADIUS,48,40),
  new THREE.MeshBasicMaterial({color:0xfff8ee,toneMapped:false,fog:false})
);
scene.add(sun);

const sunGlow = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map:makeGlowTexture("rgba(255,255,245,1)","rgba(255,240,200,.55)"),
    transparent:true,depthWrite:false,fog:false,toneMapped:false,
    blending:THREE.AdditiveBlending
  })
);
sunGlow.scale.set(SUN_RADIUS*4,SUN_RADIUS*4,1);
scene.add(sunGlow);

const sunHalo = new THREE.Sprite(
  new THREE.SpriteMaterial({
    map:makeGlowTexture("rgba(255,235,190,.35)","rgba(255,210,140,.12)"),
    transparent:true,depthWrite:false,fog:false,toneMapped:false,
    blending:THREE.AdditiveBlending
  })
);
sunHalo.scale.set(SUN_RADIUS*5.5,SUN_RADIUS*5.5,1);
scene.add(sunHalo);

// A elevação sobe, para, recua, para de novo e volta a subir
let sunTime = 0;
const SUN_PHASE_SPEED = 0.03;
const sunDir = new THREE.Vector3();
let sunElev = 0.35;
const hemiLight = scene.children.find(o => o.isHemisphereLight);
const SUN_COLOR_HIGH = new THREE.Color(0xfff4e0), SUN_COLOR_LOW = new THREE.Color(0xffc48a);

function updateSun(dt) {
  sunTime += dt;
  const p = sunTime * SUN_PHASE_SPEED;
  const slope = 0.30*Math.cos(p) + 0.30*Math.cos(3*p);
  const elev = Math.max(0.06, 0.35 + 0.30*Math.sin(p) + 0.10*Math.sin(3*p));

  sunDir.set(
    Math.cos(elev)*Math.cos(SUN_AZIMUTH),
    Math.sin(elev),
    Math.cos(elev)*Math.sin(SUN_AZIMUTH)
  );

  sunLight.position.copy(camera.position).addScaledVector(sunDir,300);
  sunLight.target.position.set(camera.position.x,0,camera.position.z);
  sunLight.intensity = SUN_BASE_INTENSITY * (0.75 + 0.25*Math.min(1,elev/0.35));

  const skyPos = camera.position.clone().addScaledVector(sunDir,SUN_DISTANCE);
  sun.position.copy(skyPos);
  sunGlow.position.copy(skyPos);
  sunHalo.position.copy(skyPos);

  // Sol baixo: luz mais quente, preenchimento mais fraco, mais contraste
  sunElev = elev;
  const low = 1 - Math.min(1, Math.max(0, (elev - 0.06) / 0.3));
  sunLight.color.copy(SUN_COLOR_HIGH).lerp(SUN_COLOR_LOW, low);
  if (hemiLight) hemiLight.intensity = 0.3 * (1 - 0.65 * low);
  if (exoMat) exoMat.uniforms.uSun.value.copy(sunDir);

  const state = slope < -0.02 ? "▼" : (slope > 0.02 ? "▲" : "■");
  $("sunInfo").textContent = (elev*180/Math.PI).toFixed(1)+"° "+state;

  // Um ciclo da simulação = 1 dia solar (176 d); o ano (88 d) é metade dele
  const cyc = (p / (Math.PI * 2)) % 1;
  $("solarDay").textContent = "dia " + (1 + Math.floor(cyc * 176)) + " / 176";
  $("yearDay").textContent = "dia " + (1 + Math.floor((cyc * 176) % 88)) + " / 88";
}

// --------------------------------------------------
// EXOSFERA: brilho de sódio no horizonte (mais forte do lado oposto ao Sol)
// --------------------------------------------------

const exoMat = new THREE.ShaderMaterial({
  uniforms: { uSun: { value: new THREE.Vector3(1,0.3,0) } },
  side: THREE.BackSide, transparent: true, depthWrite: false,
  blending: THREE.AdditiveBlending, fog: false,
  vertexShader: "varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);} ",
  fragmentShader: [
    "varying vec3 vDir; uniform vec3 uSun;",
    "void main(){",
    " float h=abs(vDir.y);",
    " float band=exp(-h*9.0);",
    " float tail=0.55+0.45*clamp(-dot(normalize(vec3(vDir.x,0.0,vDir.z)),normalize(vec3(uSun.x,0.0,uSun.z))),-1.0,1.0);",
    " float a=band*tail*0.16*step(0.0,vDir.y+0.02);",
    " gl_FragColor=vec4(vec3(1.0,0.78,0.28)*a,a);",
    "}"
  ].join("\n")
});
const exoSphere = new THREE.Mesh(new THREE.SphereGeometry(3400, 32, 16), exoMat);
exoSphere.renderOrder = -1;
exoSphere.frustumCulled = false;
scene.add(exoSphere);

// --------------------------------------------------
// CÉU: ESTRELAS, VÊNUS, TERRA E LUA
// --------------------------------------------------

{
 const positions=[];
 for(let i=0;i<5000;i++){
  const v=new THREE.Vector3(
   Math.random()-.5,Math.random()-.5,Math.random()-.5
  ).normalize().multiplyScalar(3500);
  positions.push(v.x,v.y,v.z);
 }
 const geo=new THREE.BufferGeometry();
 geo.setAttribute("position",new THREE.Float32BufferAttribute(positions,3));
 scene.add(new THREE.Points(
  geo,new THREE.PointsMaterial({
   color:0xffffff,size:1.5,sizeAttenuation:false,fog:false,toneMapped:false
  })
 ));
}

function makeDotTexture(color){
 const c=document.createElement("canvas");
 c.width=c.height=128;
 const x=c.getContext("2d");
 const g=x.createRadialGradient(64,64,0,64,64,64);
 g.addColorStop(0,"#ffffff");
 g.addColorStop(.15,color);
 g.addColorStop(.4,"rgba(255,255,255,.15)");
 g.addColorStop(1,"rgba(255,255,255,0)");
 x.fillStyle=g;x.fillRect(0,0,128,128);
 return new THREE.CanvasTexture(c);
}

function skyDot(dir,size,color){
 const s=new THREE.Sprite(new THREE.SpriteMaterial({
  map:makeDotTexture(color),transparent:true,depthWrite:false,
  fog:false,toneMapped:false,blending:THREE.AdditiveBlending
 }));
 s.position.set(...dir).normalize().multiplyScalar(3300);
 s.scale.set(size,size,1);
 scene.add(s);
}
skyDot([-0.55,0.38,-0.74],70,"#9fc8ff"); // Terra
skyDot([-0.545,0.385,-0.74],28,"#e8e8e8"); // Lua
skyDot([0.35,0.55,0.76],90,"#fff2cc");   // Vênus

// --------------------------------------------------
// TEXTURAS PROCEDURAIS (solo escuro, rico em grafite)
// --------------------------------------------------

function makeRockTexture() {
 const c=document.createElement("canvas");
 c.width=c.height=512;
 const ctx=c.getContext("2d");
 const im=ctx.createImageData(512,512);

 for(let y=0;y<512;y++){
  for(let x=0;x<512;x++){
   const i=(y*512+x)*4;
   const n=Math.random()*28;
   const wave=Math.sin(x*.06+Math.sin(y*.035)*3)*4;
   const v=Math.max(16,Math.min(100,52+n+wave));
   im.data[i]=v;
   im.data[i+1]=v*.98;
   im.data[i+2]=v*1.03;
   im.data[i+3]=255;
  }
 }
 ctx.putImageData(im,0,0);

 // Manchas largas de grafite
 for(let i=0;i<45;i++){
  const x=Math.random()*512,y=Math.random()*512;
  const r=30+Math.random()*100;
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,"rgba(8,8,12,.32)");
  g.addColorStop(1,"rgba(8,8,12,0)");
  ctx.fillStyle=g;
  ctx.fillRect(x-r,y-r,r*2,r*2);
 }

 for(let i=0;i<1500;i++){
  const x=Math.random()*512,y=Math.random()*512;
  const r=Math.random()*5+.3;
  ctx.fillStyle=Math.random()>.5
   ?"rgba(8,8,10,.35)":"rgba(120,120,126,.22)";
  ctx.beginPath();
  ctx.ellipse(x,y,r*1.6,r,Math.random()*3,0,Math.PI*2);
  ctx.fill();
 }
 for(let i=0;i<140;i++){
  let x=Math.random()*512,y=Math.random()*512;
  ctx.strokeStyle="rgba(10,10,12,.25)";
  ctx.lineWidth=Math.random()*1.3+.3;
  ctx.beginPath();ctx.moveTo(x,y);
  for(let j=0;j<4;j++){
   x+=(Math.random()-.5)*24;
   y+=(Math.random()-.5)*24;
   ctx.lineTo(x,y);
  }
  ctx.stroke();
 }
 const t=new THREE.CanvasTexture(c);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.repeat.set(1,1);
 t.encoding=THREE.sRGBEncoding;
 return t;
}

function makeBumpTexture() {
 const c=document.createElement("canvas");
 c.width=c.height=256;
 const ctx=c.getContext("2d");
 const im=ctx.createImageData(256,256);
 for(let i=0;i<im.data.length;i+=4){
  const v=75+Math.random()*180;
  im.data[i]=im.data[i+1]=im.data[i+2]=v;
  im.data[i+3]=255;
 }
 ctx.putImageData(im,0,0);
 const t=new THREE.CanvasTexture(c);
 t.wrapS=t.wrapT=THREE.RepeatWrapping;
 t.repeat.set(10,10);
 return t;
}
const rockTexture=makeRockTexture();
const bumpTexture=makeBumpTexture();

// Chão: mapa de altura tileável (ruído fractal + milhares de microcrateras)
// convertido em textura de cor (com oclusão nas crateras) e normal map.
function makeGroundTextures(){
 const N=touchMode?1024:2048,M=N-1;
 const H=new Float32Array(N*N);

 function octave(cells,amp){
  const g=new Float32Array(cells*cells);
  for(let i=0;i<g.length;i++)g[i]=Math.random();
  const step=N/cells;
  for(let y=0;y<N;y++){
   const fy=y/step,y0=Math.floor(fy),ty=fy-y0,sy=ty*ty*(3-2*ty);
   const ra=(y0%cells)*cells,rb=((y0+1)%cells)*cells;
   for(let x=0;x<N;x++){
    const fx=x/step,x0=Math.floor(fx),tx=fx-x0,sx=tx*tx*(3-2*tx);
    const xa=x0%cells,xb=(x0+1)%cells;
    const a=g[ra+xa]+(g[ra+xb]-g[ra+xa])*sx;
    const b=g[rb+xa]+(g[rb+xb]-g[rb+xa])*sx;
    H[y*N+x]+=(a+(b-a)*sy-.5)*amp;
   }
  }
 }
 octave(6,14);octave(12,8);octave(24,5);octave(48,3);
 octave(96,1.6);octave(192,.8);octave(384,.4);

 function crater(cx,cy,r,depth){
  const R=Math.ceil(r*1.7);
  const peak=r>24;
  for(let oy=-R;oy<=R;oy++){
   const y=(((cy+oy)%N)+N)%N;
   for(let ox=-R;ox<=R;ox++){
    const d=Math.sqrt(ox*ox+oy*oy)/r;
    if(d>1.7)continue;
    const e=(d-1)/.14;
    let h=depth*.32*Math.exp(-e*e);
    if(d<1){
     const b=1-d*d;
     h-=depth*b*b;
     if(peak)h+=depth*.28*Math.exp(-(d/.13)*(d/.13));
    }else{
     h+=depth*.06*Math.exp(-(d-1)*3.5);
    }
    const x=(((cx+ox)%N)+N)%N;
    H[y*N+x]+=h;
   }
  }
 }
 for(let i=0,cn=touchMode?1800:7000;i<cn;i++){
  const r=Math.min(80,2.6*Math.pow(Math.random(),-1/1.55));
  crater((Math.random()*N)|0,(Math.random()*N)|0,r,r*(.14+Math.random()*.26));
 }

 const nc=document.createElement("canvas");nc.width=nc.height=N;
 const ac=document.createElement("canvas");ac.width=ac.height=N;
 const nctx=nc.getContext("2d"),actx=ac.getContext("2d");
 const nd=nctx.createImageData(N,N),ad=actx.createImageData(N,N);

 for(let y=0;y<N;y++){
  const ym=(y-1)&M,yp=(y+1)&M;
  for(let x=0;x<N;x++){
   const xm=(x-1)&M,xp=(x+1)&M;
   const idx=y*N+x,i=idx*4;
   const h=H[idx];
   const gx=(H[y*N+xp]-H[y*N+xm])*.5;
   const gy=(H[yp*N+x]-H[ym*N+x])*.5;
   let nx=-gx*1.4,ny=gy*1.4,nz=1;
   const l=Math.sqrt(nx*nx+ny*ny+nz*nz);
   nx/=l;ny/=l;nz/=l;
   nd.data[i]=(nx*.5+.5)*255;
   nd.data[i+1]=(ny*.5+.5)*255;
   nd.data[i+2]=(nz*.5+.5)*255;
   nd.data[i+3]=255;

   const lap=(H[y*N+xp]+H[y*N+xm]+H[yp*N+x]+H[ym*N+x])*.25-h;
   let v=64+h*1.2-lap*9+(Math.random()-.5)*16;
   v=Math.max(14,Math.min(150,v));
   ad.data[i]=v*1.03;
   ad.data[i+1]=v*.99;
   ad.data[i+2]=v*.95;
   ad.data[i+3]=255;
  }
 }
 nctx.putImageData(nd,0,0);
 actx.putImageData(ad,0,0);

 const aniso=renderer.capabilities.getMaxAnisotropy();
 function mk(c,srgb){
  const t=new THREE.CanvasTexture(c);
  t.wrapS=t.wrapT=THREE.RepeatWrapping;
  t.repeat.set(24,24);
  t.anisotropy=aniso;
  if(srgb)t.encoding=THREE.sRGBEncoding;
  return t;
 }
 return {map:mk(ac,true),normalMap:mk(nc,false)};
}

// --------------------------------------------------
// TERRENO COM CRATERAS E HOLLOWS
// --------------------------------------------------

const WORLD=900;
const SEG=touchMode?400:600;
const craters=[];

let seed=73921;
function random(){
 seed=(seed*1664525+1013904223)>>>0;
 return seed/4294967296;
}

// Crateras grandes
for(let i=0;i<115;i++){
 craters.push({
  x:(random()-.5)*WORLD*.9,
  z:(random()-.5)*WORLD*.9,
  r:4+random()*25,
  depth:1.2+random()*3.4
 });
}
// Mercúrio é mais craterado: muitas crateras pequenas
for(let i=0;i<420;i++){
 craters.push({
  x:(random()-.5)*WORLD*.9,
  z:(random()-.5)*WORLD*.9,
  r:2.5+random()*4.5,
  depth:.25+random()*.8
 });
}

// Hollows: depressões rasas em aglomerados
const hollows=[];
function hollowCluster(cx,cz,count,spread){
 for(let i=0;i<count;i++){
  const a=random()*Math.PI*2,d=random()*spread;
  hollows.push({
   x:cx+Math.cos(a)*d,z:cz+Math.sin(a)*d,
   r:5+random()*4,depth:.5+random()*.5
  });
 }
}
for(let i=0;i<26;i++){
 hollowCluster((random()-.5)*WORLD*.8,(random()-.5)*WORLD*.8,3+Math.floor(random()*4),14);
}
hollowCluster(-16,-14,5,9); // um grupo perto do ponto de partida
hollows.forEach(h=>craters.push(h));

// Crateras pequenas na geometria (alta densidade, tamanhos variados)
for(let i=0;i<1400;i++){
 const r=1.6+Math.pow(random(),2.2)*4.5;
 craters.push({
  x:(random()-.5)*WORLD*.92,
  z:(random()-.5)*WORLD*.92,
  r,depth:r*(.1+random()*.14)
 });
}

// Grade espacial: evita testar todas as crateras em cada vértice
const CELL=32,GN=Math.ceil(WORLD/CELL)+3;
const craterGrid=Array.from({length:GN*GN},()=>[]);
function gridIndex(v){
 return Math.min(GN-1,Math.max(0,Math.floor((v+WORLD/2)/CELL)+1));
}
craters.forEach(c=>{
 const ext=c.r*1.6;
 const x0=gridIndex(c.x-ext),x1=gridIndex(c.x+ext);
 const z0=gridIndex(c.z-ext),z1=gridIndex(c.z+ext);
 for(let gz=z0;gz<=z1;gz++)for(let gx=x0;gx<=x1;gx++)craterGrid[gz*GN+gx].push(c);
});
function craterCell(x,z){return craterGrid[gridIndex(z)*GN+gridIndex(x)];}

function sstep(a,b,v){
 const t=Math.max(0,Math.min(1,(v-a)/(b-a)));
 return t*t*(3-2*t);
}

// Planícies: regiões amplas e suaves, com poucas crateras pequenas
function plainFactor(x,z){
 const n=.5*(Math.sin(x*.006+Math.sin(z*.005)*2)+Math.sin(z*.0045-x*.0035+1));
 return sstep(.1,.55,n);
}

// Escarpas: degraus longos e íngremes (blocos elevados com uma face em penhasco)
const scarps=[];
for(let i=0;i<9;i++){
 const a=random()*Math.PI;
 scarps.push({
  x:(random()-.5)*WORLD*.8,z:(random()-.5)*WORLD*.8,
  ca:Math.cos(a),sa:Math.sin(a),
  len:110+random()*170,h:4+random()*7,
  w:5+random()*3,band:25+random()*25,wob:random()*6.28
 });
}

// Vales profundos: cânions sinuosos de fundo largo e paredes íngremes
const valleys=[];
for(let i=0;i<6;i++){
 const a=random()*Math.PI;
 valleys.push({
  x:(random()-.5)*WORLD*.7,z:(random()-.5)*WORLD*.7,
  ca:Math.cos(a),sa:Math.sin(a),
  len:220+random()*260,depth:6+random()*7,
  w:14+random()*14,amp:10+random()*20,
  k:.012+random()*.015,ph:random()*6.28
 });
}

function terrainHeight(x,z){
 const pl=plainFactor(x,z);
 let h=(1-.6*pl)*(
  Math.sin(x*.045)*.55+
  Math.cos(z*.052)*.45+
  Math.sin(x*.13+z*.09)*.22+
  Math.sin(x*.31-z*.22)*.09+
  Math.sin(x*.9+z*.7)*.035);

 for(const c of craterCell(x,z)){
  const dx=x-c.x,dz=z-c.z;
  if(dx>c.r*1.6||dx<-c.r*1.6||dz>c.r*1.6||dz<-c.r*1.6)continue;
  const d=Math.sqrt(dx*dx+dz*dz);
  if(d<c.r*1.6){
   const u=d/c.r;
   const bowl=Math.max(0,1-u*u);
   const rim=Math.exp(-Math.pow((u-1)/.15,2));
   h+=(-c.depth*bowl*bowl+rim*c.depth*.35)*(c.r<10?1-.8*pl:1);
  }
 }
 // Escarpas e vales (longe do ponto de partida)
 const sm=sstep(35,80,Math.hypot(x,z));
 if(sm>0){
  let f=0;
  for(const s of scarps){
   const dx=x-s.x,dz=z-s.z;
   const al=dx*s.ca+dz*s.sa;
   if(Math.abs(al)>s.len*.5)continue;
   const pp=-dx*s.sa+dz*s.ca+3*Math.sin(al*.05+s.wob);
   if(pp<-s.w||pp>s.band+s.w*3)continue;
   const end=1-sstep(s.len*.3,s.len*.5,Math.abs(al));
   f+=s.h*end*sstep(-s.w,s.w,pp)*(1-sstep(s.band,s.band+s.w*3,pp));
  }
  for(const v of valleys){
   const dx=x-v.x,dz=z-v.z;
   const al=dx*v.ca+dz*v.sa;
   if(Math.abs(al)>v.len*.5)continue;
   const vv=-dx*v.sa+dz*v.ca+v.amp*Math.sin(al*v.k+v.ph);
   const u=Math.abs(vv)/v.w;
   if(u>2.5)continue;
   const end=1-sstep(v.len*.3,v.len*.5,Math.abs(al));
   f-=v.depth*end*Math.exp(-Math.pow(u,2.6));
  }
  h+=f*sm;
 }
 return h;
}

const terrainGeo=new THREE.PlaneGeometry(WORLD,WORLD,SEG,SEG);
terrainGeo.rotateX(-Math.PI/2);
const pos=terrainGeo.attributes.position;
for(let i=0;i<pos.count;i++){
 const x=pos.getX(i),z=pos.getZ(i);
 pos.setY(i,terrainHeight(x,z));
}
terrainGeo.computeVertexNormals();

// Variação de tom em grande escala (quebra a repetição da textura)
const colArr=new Float32Array(pos.count*3);
for(let i=0;i<pos.count;i++){
 const x=pos.getX(i),z=pos.getZ(i);
 const n=.5+.22*Math.sin(x*.021+Math.sin(z*.017)*2)+.16*Math.sin(z*.043-x*.031)+.12*Math.sin(x*.11+z*.09);
 const k=(.62+.55*n)*(1+.14*plainFactor(x,z));
 colArr[i*3]=k;colArr[i*3+1]=k*.985;colArr[i*3+2]=k*.96;
}
terrainGeo.setAttribute("color",new THREE.BufferAttribute(colArr,3));

const groundTex=makeGroundTextures();
const terrain=new THREE.Mesh(
 terrainGeo,
 new THREE.MeshStandardMaterial({
  map:groundTex.map,normalMap:groundTex.normalMap,
  normalScale:new THREE.Vector2(1.15,1.15),
  vertexColors:true,color:0x8a8688,roughness:1,metalness:0
 })
);
terrain.receiveShadow=true;
terrain.frustumCulled=false;
scene.add(terrain);

// Visual dos hollows: manchas claras azuladas que parecem evaporar
function makeHollowTexture(){
 const c=document.createElement("canvas");
 c.width=c.height=256;
 const x=c.getContext("2d");
 const g=x.createRadialGradient(128,128,10,128,128,128);
 g.addColorStop(0,"rgba(225,240,255,.95)");
 g.addColorStop(.55,"rgba(170,205,235,.75)");
 g.addColorStop(.85,"rgba(120,160,200,.25)");
 g.addColorStop(1,"rgba(100,140,190,0)");
 x.fillStyle=g;x.fillRect(0,0,256,256);
 for(let i=0;i<900;i++){
  const a=Math.random()*Math.PI*2;
  const r=Math.sqrt(Math.random())*110;
  x.fillStyle="rgba(255,255,255,"+(.15+Math.random()*.35)+")";
  x.fillRect(128+Math.cos(a)*r,128+Math.sin(a)*r,1.5,1.5);
 }
 const t=new THREE.CanvasTexture(c);
 t.encoding=THREE.sRGBEncoding;
 return t;
}
const hollowTex=makeHollowTexture();
const hollowMat=new THREE.MeshStandardMaterial({
 map:hollowTex,transparent:true,depthWrite:false,
 emissive:0x4a6f99,emissiveMap:hollowTex,emissiveIntensity:.55,
 roughness:.6,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2
});
hollows.forEach(h=>{
 const geo=new THREE.PlaneGeometry(h.r*2,h.r*2,16,16);
 geo.rotateX(-Math.PI/2);
 const p=geo.attributes.position;
 for(let i=0;i<p.count;i++){
  p.setY(i,terrainHeight(p.getX(i)+h.x,p.getZ(i)+h.z)+.04);
 }
 geo.computeVertexNormals();
 const m=new THREE.Mesh(geo,hollowMat);
 m.position.set(h.x,0,h.z);
 m.receiveShadow=true;
 scene.add(m);
});

// Rochas espalhadas (sem ferro: tons de cinza escuro)
const rockMaterial=new THREE.MeshStandardMaterial({
 map:rockTexture,bumpMap:bumpTexture,bumpScale:.1,
 color:0x8a8a8e,vertexColors:true,roughness:1,metalness:0,flatShading:true
});

// Rochas poligonais: poliedros de poucas faces, vértices deslocados,
// normais por face (flat shading) e UV projetado por face (sem emendas).
function makeRockGeo(base,jag){
 const g=base.index?base.toNonIndexed():base;
 g.deleteAttribute("uv");
 g.deleteAttribute("normal");
 const p=g.attributes.position;
 const seen=new Map();
 for(let i=0;i<p.count;i++){
  const key=p.getX(i).toFixed(3)+","+p.getY(i).toFixed(3)+","+p.getZ(i).toFixed(3);
  let f=seen.get(key);
  if(!f){
   f={s:(1-jag*.5)+random()*jag,
      j:[(random()-.5)*.04,(random()-.5)*.04,(random()-.5)*.04]};
   seen.set(key,f);
  }
  // achatada e com base reta, como pedras assentadas no chão
  const yy=Math.max(-.42,(p.getY(i)*f.s+f.j[1])*.8);
  p.setXYZ(i,p.getX(i)*f.s+f.j[0],yy,p.getZ(i)*f.s+f.j[2]);
 }
 const uv=new Float32Array(p.count*2);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
 const e1=new THREE.Vector3(),e2=new THREE.Vector3();
 for(let i=0;i<p.count;i+=3){
  a.fromBufferAttribute(p,i);b.fromBufferAttribute(p,i+1);c.fromBufferAttribute(p,i+2);
  e1.subVectors(c,b);e2.subVectors(a,b);e1.cross(e2);
  const ax=Math.abs(e1.x),ay=Math.abs(e1.y),az=Math.abs(e1.z);
  const tri=[a,b,c];
  for(let k=0;k<3;k++){
   const v=tri[k];
   let u,w;
   if(ax>=ay&&ax>=az){u=v.z;w=v.y;}
   else if(ay>=az){u=v.x;w=v.z;}
   else{u=v.x;w=v.y;}
   uv[(i+k)*2]=u*.5;uv[(i+k)*2+1]=w*.5;
  }
 }
 g.setAttribute("uv",new THREE.BufferAttribute(uv,2));
 // cor lisa por face, cada face com um tom levemente diferente
 const col=new Float32Array(p.count*3);
 for(let i=0;i<p.count;i+=3){
  const v=.78+random()*.22;
  for(let k=0;k<3;k++){
   col[(i+k)*3]=v*1.04;col[(i+k)*3+1]=v;col[(i+k)*3+2]=v*.96;
  }
 }
 g.setAttribute("color",new THREE.BufferAttribute(col,3));
 g.computeVertexNormals();
 return g;
}

const rockVariants=[];
for(let i=0;i<5;i++)rockVariants.push(makeRockGeo(new THREE.DodecahedronGeometry(1,0),.1));
for(let i=0;i<5;i++)rockVariants.push(makeRockGeo(new THREE.IcosahedronGeometry(1,1),.12));
const rocks=[];

// Colisão: só as pedras maiores bloqueiam o jogador
const colliders=[];
function addCollider(m){
 const r=Math.max(m.scale.x,m.scale.z)*.8;
 if(r>1.4)colliders.push({
  x:m.position.x,z:m.position.z,r,
  top:m.position.y+m.scale.y*.85
 });
}

for(let i=0;i<600;i++){
 const x=(random()-.5)*WORLD*.85;
 const z=(random()-.5)*WORLD*.85;
 if(Math.hypot(x,z-12)<14||Math.hypot(x+8,z-6)<10)continue; // áreas livres: jogador e jipe
 const s=.3+random()*2.4;
 const rock=new THREE.Mesh(rockVariants[Math.floor(random()*rockVariants.length)],rockMaterial);
 rock.position.set(x,terrainHeight(x,z)+s*.28,z);
 rock.scale.set(s*(.85+random()*.4),s*(.6+random()*.3),s*(.85+random()*.4));
 rock.rotation.set(random()*3,random()*6,random()*3);
 rock.castShadow=true;
 rock.receiveShadow=true;
 scene.add(rock);
 rocks.push(rock);
 addCollider(rock);
}

for(let i=0;i<45;i++){
 const a=random()*Math.PI*2;
 const d=12+random()*110;
 const x=Math.cos(a)*d,z=Math.sin(a)*d;
 if(Math.hypot(x,z-12)<14||Math.hypot(x+8,z-6)<10)continue; // áreas livres: jogador e jipe
 const s=1.2+random()*4;
 const r=new THREE.Mesh(
  rockVariants[Math.floor(random()*rockVariants.length)],rockMaterial
 );
 r.position.set(x,terrainHeight(x,z)+s*.3,z);
 r.scale.set(s,s*.75,s*.95);
 r.rotation.set(random()*2,random()*6,random()*2);
 r.castShadow=true;r.receiveShadow=true;
 addCollider(r);
 scene.add(r);
}

// --------------------------------------------------
// PEDREGULHOS ANGULARES (instanciados, sem colisão)
// --------------------------------------------------

function scatterPebbles(geo,count){
 const im=new THREE.InstancedMesh(geo,rockMaterial,count);
 const o=new THREE.Object3D();
 for(let i=0;i<count;i++){
  const a=random()*Math.PI*2;
  const d=Math.pow(random(),.8)*170;
  const x=Math.cos(a)*d,z=Math.sin(a)*d;
  const s=.08+Math.pow(random(),2)*.32;
  o.position.set(x,terrainHeight(x,z)+s*.2,z);
  o.scale.set(s*(.85+random()*.4),s*(.6+random()*.3),s*(.85+random()*.4));
  o.rotation.set(random()*3,random()*6,random()*3);
  o.updateMatrix();
  im.setMatrixAt(i,o.matrix);
 }
 im.castShadow=true;
 im.receiveShadow=true;
 im.frustumCulled=false;
 scene.add(im);
}
scatterPebbles(rockVariants[5],400);
scatterPebbles(rockVariants[9],400);

// --------------------------------------------------
// JIPE ESPACIAL (dirigível, com som de motor)
// --------------------------------------------------

const JEEP_WHEEL_RADIUS=.55;
const JEEP_START_X=-8,JEEP_START_Z=6;
const JEEP_PROMPT_RANGE=4.5;
const JEEP_PARKED_R=2.3;
const JEEP_ACCEL=14,JEEP_DRAG=1.1,JEEP_MAX=22,JEEP_TURN=1.6;

let jeepHeading=.6;
let jeepDist=0;
let isDriving=false,jeepSpeed=0,jeepVy=0,jeepAir=false,jeepPrevGy=0;
let jeepHeadlightsOn=false;
const jeepGroup=new THREE.Group();
const jeepWheels=[];
const jeepHeadMeshes=[],jeepHeadLights=[];

{
 const bodyMat=new THREE.MeshStandardMaterial({color:0xc2542c,roughness:.45,metalness:.55});
 const trimMat=new THREE.MeshStandardMaterial({color:0xe8e2d4,roughness:.4,metalness:.4});
 const glassMat=new THREE.MeshStandardMaterial({color:0xe4f6ff,roughness:.08,metalness:.05,transparent:true,opacity:.22});
 const wheelMat=new THREE.MeshStandardMaterial({color:0x161616,roughness:.8,metalness:.2});
 const hubMat=new THREE.MeshStandardMaterial({color:0xb0b8bd,roughness:.35,metalness:.8});
 const cageMat=new THREE.MeshStandardMaterial({color:0x2a2c2f,roughness:.5,metalness:.7});
 const seatMat=new THREE.MeshStandardMaterial({color:0x2b2b2b,roughness:.85,metalness:.1});

 function part(geo,mat,x,y,z,shadow){
  const m=new THREE.Mesh(geo,mat);
  m.position.set(x,y,z);
  if(shadow){m.castShadow=true;m.receiveShadow=true;}
  jeepGroup.add(m);
  return m;
 }

 part(new THREE.BoxGeometry(2.1,.35,4),trimMat,0,.55,0,true);        // chassi
 part(new THREE.BoxGeometry(2,.7,1.2),bodyMat,0,1.05,1.15,true);     // traseira
 [-.925,.925].forEach(sx=>part(new THREE.BoxGeometry(.15,.45,1.6),bodyMat,sx,.95,-.25,true)); // laterais do cockpit
 part(new THREE.BoxGeometry(.62,.14,.55),seatMat,0,.85,.05,true);    // assento
 part(new THREE.BoxGeometry(.6,.62,.12),seatMat,0,1.18,.32,true).rotation.x=-.12;
 part(new THREE.BoxGeometry(.4,.18,.12),seatMat,0,1.56,.24).rotation.x=-.12;
 part(new THREE.TorusGeometry(.22,.03,8,20),cageMat,0,1.05,-.75).rotation.x=Math.PI/2.6; // volante
 part(new THREE.CylinderGeometry(.03,.03,.35,6),hubMat,0,.92,-.62).rotation.x=.9;
 part(new THREE.BoxGeometry(1.9,.4,1.1),bodyMat,0,.95,-1.75,true);   // capô
 [-.85,.85].forEach(cx=>part(new THREE.CylinderGeometry(.05,.05,1.3,8),cageMat,cx,1.75,.6,true)); // arcos
 part(new THREE.BoxGeometry(1.9,.08,1.3),cageMat,0,2.4,.6);          // teto da gaiola
 part(new THREE.BoxGeometry(1.8,.85,.06),glassMat,0,1.55,-1.1).rotation.x=-.25; // para-brisa
 part(new THREE.CylinderGeometry(.02,.03,1.6,6),hubMat,.85,2,1.4).rotation.z=.15; // antena
 part(
  new THREE.BoxGeometry(1.9,.12,.08),
  new THREE.MeshStandardMaterial({color:0x220000,emissive:0xff4433,emissiveIntensity:.7,roughness:.5}),
  0,.85,1.65
 ); // luz traseira

 // Faróis: duas lentes + dois refletores (ligam com a tecla L)
 [-.65,.65].forEach(hx=>{
  const lens=part(
   new THREE.SphereGeometry(.11,12,12),
   new THREE.MeshStandardMaterial({color:0xfff8e0,emissive:0xfff3c0,emissiveIntensity:.05,roughness:.3}),
   hx,.95,-2.02
  );
  jeepHeadMeshes.push(lens);
  const light=new THREE.SpotLight(0xfff3d0,0,40,Math.PI/5,.5,1.4);
  light.position.set(hx,1,-2);
  const target=new THREE.Object3D();
  target.position.set(hx*.6,.3,-10);
  jeepGroup.add(target);
  light.target=target;
  jeepGroup.add(light);
  jeepHeadLights.push(light);
 });

 // Rodas (giram ao dirigir)
 [[-1.05,1.15],[1.05,1.15],[-1.05,-1.35],[1.05,-1.35]].forEach(([wx,wz])=>{
  const wg=new THREE.Group();
  wg.position.set(wx,JEEP_WHEEL_RADIUS,wz);
  const tire=new THREE.Mesh(new THREE.CylinderGeometry(JEEP_WHEEL_RADIUS,JEEP_WHEEL_RADIUS,.4,16),wheelMat);
  tire.rotation.z=Math.PI/2;tire.castShadow=true;
  wg.add(tire);
  const hub=new THREE.Mesh(new THREE.CylinderGeometry(.22,.22,.42,8),hubMat);
  hub.rotation.z=Math.PI/2;
  wg.add(hub);
  jeepGroup.add(wg);
  jeepWheels.push(wg);
 });
}

jeepGroup.position.set(JEEP_START_X,terrainHeight(JEEP_START_X,JEEP_START_Z)+.1,JEEP_START_Z);
jeepGroup.rotation.y=jeepHeading;
scene.add(jeepGroup);

function setJeepHeadlights(on){
 jeepHeadlightsOn=on;
 jeepHeadLights.forEach(l=>l.intensity=on?5:0);
 jeepHeadMeshes.forEach(m=>m.material.emissiveIntensity=on?2.2:.05);
}

// Colisão: o jipe parado bloqueia quem está a pé; dirigindo, o raio vira 0
const jeepCol={x:jeepGroup.position.x,z:jeepGroup.position.z,r:JEEP_PARKED_R,top:99};
colliders.push(jeepCol);

function jeepBlocked(x,z){
 if(Math.abs(x)>WORLD*.48||Math.abs(z)>WORLD*.48)return true;
 for(const c of colliders){
  const dx=x-c.x,dz=z-c.z;
  if(dx*dx+dz*dz<c.r*c.r)return true;
 }
 return false;
}
// testa o centro e as 4 quinas da carroceria
function jeepHit(cx,cz,h){
 if(jeepBlocked(cx,cz))return true;
 const fx=-Math.sin(h),fz=-Math.cos(h),rx=Math.cos(h),rz=-Math.sin(h);
 for(let sx=-1;sx<=1;sx+=2){
  for(let sz=-1;sz<=1;sz+=2){
   if(jeepBlocked(cx+fx*2.1*sz+rx*1.15*sx,cz+fz*2.1*sz+rz*1.15*sx))return true;
  }
 }
 return false;
}

// Inclinação do jipe conforme o relevo (sobe/desce ladeiras e inclina de lado)
const jNormal=new THREE.Vector3(),jRight=new THREE.Vector3(),jFwd=new THREE.Vector3(),jBack=new THREE.Vector3();
const jMat=new THREE.Matrix4(),jQuat=new THREE.Quaternion();
function updateJeepTilt(dt,fx,fz){
 const e=.6,px=jeepGroup.position.x,pz=jeepGroup.position.z;
 const dhdx=(terrainHeight(px+e,pz)-terrainHeight(px-e,pz))/(2*e);
 const dhdz=(terrainHeight(px,pz+e)-terrainHeight(px,pz-e))/(2*e);
 jNormal.set(-dhdx,1,-dhdz).normalize();
 jFwd.set(fx,0,fz);
 jRight.crossVectors(jFwd,jNormal).normalize();
 jFwd.crossVectors(jNormal,jRight).normalize();
 jBack.copy(jFwd).negate();
 jMat.makeBasis(jRight,jNormal,jBack);
 jQuat.setFromRotationMatrix(jMat);
 jeepGroup.quaternion.slerp(jQuat,1-Math.exp(-9*dt));
}
updateJeepTilt(100,-Math.sin(jeepHeading),-Math.cos(jeepHeading));

// --- SOM DO JIPE (Web Audio): motor elétrico que sobe de tom com a velocidade,
// ruído de rodagem no chão, chirps de ligar/desligar e batida ---
let audioCtx=null,masterGain=null,sfxGain=null,masterVolume=.6;
let jeepEngineGain,jeepMotorOsc,jeepMotorOsc2,jeepMotorFilter,jeepRoadGain,jeepRoadFilter;

function initAudio(){
 if(audioCtx){
  if(audioCtx.state==="suspended")audioCtx.resume();
  return;
 }
 const AC=window.AudioContext||window.webkitAudioContext;
 if(!AC)return;
 audioCtx=new AC();
 masterGain=audioCtx.createGain();masterGain.gain.value=masterVolume;masterGain.connect(audioCtx.destination);
 sfxGain=audioCtx.createGain();sfxGain.gain.value=1;sfxGain.connect(masterGain);

 const bufSize=audioCtx.sampleRate*2;
 const noiseBuf=audioCtx.createBuffer(1,bufSize,audioCtx.sampleRate);
 const nd=noiseBuf.getChannelData(0);
 for(let i=0;i<bufSize;i++)nd[i]=Math.random()*2-1;

 jeepEngineGain=audioCtx.createGain();jeepEngineGain.gain.value=0;

 jeepMotorOsc=audioCtx.createOscillator();jeepMotorOsc.type="sawtooth";jeepMotorOsc.frequency.value=70;
 jeepMotorOsc2=audioCtx.createOscillator();jeepMotorOsc2.type="triangle";jeepMotorOsc2.frequency.value=140;
 const osc2Gain=audioCtx.createGain();osc2Gain.gain.value=.35;
 jeepMotorFilter=audioCtx.createBiquadFilter();jeepMotorFilter.type="lowpass";jeepMotorFilter.frequency.value=450;
 jeepMotorOsc.connect(jeepMotorFilter);
 jeepMotorOsc2.connect(osc2Gain);osc2Gain.connect(jeepMotorFilter);
 jeepMotorFilter.connect(jeepEngineGain);

 const road=audioCtx.createBufferSource();road.buffer=noiseBuf;road.loop=true;
 jeepRoadFilter=audioCtx.createBiquadFilter();jeepRoadFilter.type="bandpass";jeepRoadFilter.frequency.value=400;jeepRoadFilter.Q.value=.5;
 jeepRoadGain=audioCtx.createGain();jeepRoadGain.gain.value=0;
 road.connect(jeepRoadFilter);jeepRoadFilter.connect(jeepRoadGain);jeepRoadGain.connect(jeepEngineGain);

 jeepEngineGain.connect(sfxGain);
 [jeepMotorOsc,jeepMotorOsc2,road].forEach(n=>n.start());
 setupAmbientAudio(noiseBuf);
}
function updateJeepEngineSound(speedAbs,ratio){
 if(!audioCtx||!jeepMotorOsc)return;
 const t=audioCtx.currentTime;
 const f=70+ratio*260;
 jeepMotorOsc.frequency.setTargetAtTime(f,t,.05);
 jeepMotorOsc2.frequency.setTargetAtTime(f*2,t,.05);
 jeepMotorFilter.frequency.setTargetAtTime(450+ratio*1800,t,.05);
 jeepEngineGain.gain.setTargetAtTime(.16+ratio*.1,t,.05);
 jeepRoadGain.gain.setTargetAtTime(Math.min(1,speedAbs/4)*.22,t,.05);
}
function silenceJeep(){
 if(!audioCtx||!jeepEngineGain)return;
 const t=audioCtx.currentTime;
 jeepEngineGain.gain.cancelScheduledValues(t);
 jeepRoadGain.gain.cancelScheduledValues(t);
 jeepEngineGain.gain.setValueAtTime(0,t);
 jeepRoadGain.gain.setValueAtTime(0,t);
}
function jeepChirp(f0,f1,dur,vol){
 if(!audioCtx)return;
 const now=audioCtx.currentTime;
 const osc=audioCtx.createOscillator();osc.type="sine";
 osc.frequency.setValueAtTime(f0,now);
 osc.frequency.exponentialRampToValueAtTime(f1,now+dur*.8);
 const g=audioCtx.createGain();
 g.gain.setValueAtTime(.0001,now);
 g.gain.linearRampToValueAtTime(vol,now+.03);
 g.gain.exponentialRampToValueAtTime(.0001,now+dur);
 osc.connect(g);g.connect(sfxGain);
 osc.start(now);osc.stop(now+dur+.02);
}
function playJeepStartSound(){jeepChirp(180,520,.28,.22);}
function playJeepStopSound(){jeepChirp(420,120,.35,.18);}
function playJeepBump(){jeepChirp(130,45,.25,.35);}

// --- Entrar, sair e dirigir ---
function enterJeep(){
 isDriving=true;jeepSpeed=0;jeepVy=0;jeepAir=false;jeepPrevGy=jeepGroup.position.y;
 jeepCol.r=0;
 player.yaw=jeepHeading;
 player.vy=0;
 playJeepStartSound();
 $("speedStat").hidden=false;
 message.textContent=touchMode?"Jipe ligado: use o analógico para acelerar e virar. LUZ liga os faróis, SAIR desce.":"Jipe ligado: W/S acelera e freia, A/D vira, L faróis, E sai.";
}
function exitJeep(){
 isDriving=false;jeepSpeed=0;
 jeepCol.r=JEEP_PARKED_R;
 const fx=-Math.sin(jeepHeading),fz=-Math.cos(jeepHeading);
 const rx=Math.cos(jeepHeading),rz=-Math.sin(jeepHeading);
 const dirs=[[rx,rz],[-rx,-rz],[-fx,-fz],[fx,fz]];
 let ex=jeepGroup.position.x+rx*3.2,ez=jeepGroup.position.z+rz*3.2;
 for(const d of dirs){
  const tx=jeepGroup.position.x+d[0]*3.2,tz=jeepGroup.position.z+d[1]*3.2;
  if(!blocked(tx,tz,terrainHeight(tx,tz))){ex=tx;ez=tz;break;}
 }
 player.x=ex;player.z=ez;
 player.y=terrainHeight(ex,ez)+1.75;
 player.vy=0;
 camera.position.set(player.x,player.y,player.z);
 playJeepStopSound();
 silenceJeep();
 $("speedStat").hidden=true;
 message.textContent="Você saiu do jipe.";
}
const jeepSeatLocal=new THREE.Vector3(0,1.5,-.05),jeepCamPos=new THREE.Vector3();
function updateJeepDriving(dt){
 let throttle=((keys.KeyW||keys.ArrowUp)?1:0)-((keys.KeyS||keys.ArrowDown)?1:0);
 throttle=Math.max(-1,Math.min(1,throttle+touch.y));
 if(vit.bat<=0||jeepAir)throttle=0;
 jeepSpeed+=throttle*JEEP_ACCEL*dt;
 jeepSpeed-=jeepSpeed*JEEP_DRAG*dt;
 jeepSpeed=Math.max(-JEEP_MAX*.4,Math.min(JEEP_MAX,jeepSpeed));
 if(Math.abs(jeepSpeed)>.15){
  const steer=Math.max(-1,Math.min(1,((keys.KeyA||keys.ArrowLeft)?1:0)-((keys.KeyD||keys.ArrowRight)?1:0)-touch.x));
  jeepHeading+=steer*JEEP_TURN*dt*Math.sign(jeepSpeed);
 }
 const fx=-Math.sin(jeepHeading),fz=-Math.cos(jeepHeading);
 const nx=jeepGroup.position.x+fx*jeepSpeed*dt;
 const nz=jeepGroup.position.z+fz*jeepSpeed*dt;
 if(!jeepHit(nx,nz,jeepHeading)){
  jeepGroup.position.x=nx;jeepGroup.position.z=nz;
 }else{
  if(Math.abs(jeepSpeed)>4)playJeepBump();
  jeepSpeed=0;
 }
 // Física vertical: rampas lançam o jipe e a baixa gravidade o faz flutuar
 const gy=terrainHeight(jeepGroup.position.x,jeepGroup.position.z)+.1;
 const groundVel=(gy-jeepPrevGy)/Math.max(dt,.001);
 jeepPrevGy=gy;
 jeepVy-=MERCURY_G*dt;
 jeepGroup.position.y+=jeepVy*dt;
 if(jeepGroup.position.y<=gy){
  if(jeepAir&&jeepVy<-2.5){playJeepBump();spawnDust(jeepGroup.position.x,jeepGroup.position.z,8,14,2.2);}
  jeepAir=false;
  jeepGroup.position.y=gy;
  jeepVy=Math.max(-2,Math.min(4,groundVel*.5));
  if(jeepVy<.5)jeepVy=Math.min(jeepVy,0);
 }else if(jeepGroup.position.y>gy+.25){
  jeepAir=true;
 }
 updateJeepFx(dt);
 updateJeepTilt(dt,fx,fz);
 updateJeepEngineSound(Math.abs(jeepSpeed),Math.min(1,Math.abs(jeepSpeed)/JEEP_MAX));

 const spin=-jeepSpeed*dt*1.4;
 jeepWheels.forEach(w=>{w.children[0].rotateY(spin);w.children[1].rotateY(spin);});

 // no touch a câmera acompanha a direção do jipe (enquanto o dedo não estiver girando a vista)
 if(touchMode&&lookId===null&&Math.abs(jeepSpeed)>1){
  player.yaw+=wrapPi(jeepHeading-player.yaw)*(1-Math.exp(-2.2*dt));
 }
 // a câmera fica no banco e acompanha a inclinação do jipe; o mouse olha livremente
 jeepGroup.updateMatrixWorld(true);
 jeepCamPos.copy(jeepSeatLocal).applyMatrix4(jeepGroup.matrixWorld);
 camera.position.copy(jeepCamPos);
 camera.rotation.set(player.pitch,player.yaw,0,"YXZ");

 player.x=jeepGroup.position.x;
 player.z=jeepGroup.position.z;
 player.walked+=Math.abs(jeepSpeed)*dt;
 jeepDist+=Math.abs(jeepSpeed)*dt;
 if(jeepDist>=500)unlockAch("rover");
 $("distance").textContent=Math.floor(player.walked)+" m";
 $("jeepSpeedTxt").textContent=Math.round(Math.abs(jeepSpeed)*3.6)+" km/h";
}

// Tecla E: sair do jipe, entrar nele (se estiver perto) ou analisar descoberta
let scanHold=false,scanProgress=0;
const SCAN_TIME=2;
function interact(){
 if(!inputActive())return;
 if(isDriving){exitJeep();return;}
 if(canEnterJeep){enterJeep();return;}
 if(!activeTarget){scanTarget();return;}
 if(activeTarget.found){scanTarget();return;}
 scanHold=true;scanProgress=0;
}

// --------------------------------------------------
// PONTOS CIENTÍFICOS
// --------------------------------------------------

const discoveriesData=[
 ["CRATERA DE IMPACTO","Estrutura circular formada por colisão com um corpo celeste.","Mercúrio guarda um registro quase intacto do bombardeio inicial do Sistema Solar. Sem atmosfera para erodir as bordas e com pouca atividade geológica, crateras de todos os tamanhos permanecem visíveis por bilhões de anos.","GEOLOGIA"],
 ["ROCHA SILICÁTICA","Amostra simulada de material rochoso da superfície.","A crosta é rica em silicatos, mas pobre em ferro na superfície. Isso a deixa escura, quase cinza-carvão, apesar de o núcleo de ferro do planeta ocupar cerca de 85% do seu raio.","COMPOSIÇÃO"],
 ["CAMPO DE EJEÇÃO","Fragmentos espalhados após um impacto antigo.","Com gravidade de 0,38 g e sem ar, os detritos de um impacto seguem trajetórias balísticas puras e podem cair a centenas de quilômetros, formando raios e crateras secundárias.","IMPACTOS"],
 ["ESCARPA TECTÔNICA","Formação associada à contração do planeta durante seu resfriamento.","Ao resfriar, o núcleo de Mercúrio encolheu e a crosta enrugou, criando falhas de empurrão de centenas de quilômetros e até 3 km de altura. O planeta perdeu cerca de 7 km de raio.","TECTÔNICA"],
 ["DEPÓSITO MINERAL","Anomalia geológica registrada pelo scanner.","A MESSENGER detectou enxofre, potássio e sódio em abundância, sinal de que Mercúrio se formou com mais elementos voláteis do que se previa para um mundo tão perto do Sol.","COMPOSIÇÃO"],
 ["CRATERA ANTIGA","Estrutura degradada por impactos posteriores.","Crateras sobrepostas permitem datar a superfície: quanto mais crateras menores sobre uma maior, mais antiga ela é. Algumas regiões de Mercúrio têm mais de 4 bilhões de anos.","GEOLOGIA"],
 ["BACIA CALORIS","Eco da maior estrutura de impacto do planeta, com cerca de 1.550 km de diâmetro.","Formada há cerca de 3,9 bilhões de anos, a bacia foi preenchida por lava. O impacto foi tão violento que as ondas sísmicas convergiram do lado oposto e criaram o chamado terreno caótico.","IMPACTOS"],
 ["DISCOVERY RUPES","Escarpa gigante batizada em homenagem ao navio de James Cook.","Descoberta pela Mariner 10, tem cerca de 650 km de extensão e até 3 km de altura. É o exemplo clássico das falhas de contração que enrugaram o planeta.","TECTÔNICA"],
 ["RAIOS DE CRATERA JOVEM","Faixas claras de material ejetado em crateras recentes.","Raios brilhantes indicam impactos jovens, pois o intemperismo espacial escurece o solo com o tempo. Em Mercúrio o Sol e os micrometeoritos fazem isso mais rápido que em qualquer outro lugar.","IMPACTOS"],
 ["DEPÓSITO DE GRAFITE","Material escuro rico em carbono, provável resto da crosta primordial.","A cor escura de Mercúrio é atribuída a até 4% de grafite na superfície, segundo estudos com dados da MESSENGER. Pode ser o que sobrou de um oceano primordial de magma flutuante.","COMPOSIÇÃO"],
 ["MARCO MARINER 10 / MESSENGER","Homenagem às sondas que revelaram o planeta.","A Mariner 10 (1974–75) fez três sobrevoos e mapeou cerca de 45% da superfície. A MESSENGER (2011–2015) orbitou o planeta, mapeou 100% dele e terminou a missão ao se chocar de propósito contra o solo.","MISSÕES"],
 ["MARCO BEPICOLOMBO","Missão europeia e japonesa que estuda Mercúrio com duas sondas.","A BepiColombo, da ESA e da JAXA, leva as sondas MPO e Mio. Depois de vários sobrevoos, entra em órbita para estudar o campo magnético, a exosfera e o interior do planeta.","MISSÕES"]
];

const discoveries=[];
const markerMat=new THREE.MeshStandardMaterial({
 color:0x65e5ed,emissive:0x138c9a,emissiveIntensity:2,
 roughness:.3,metalness:.2
});

for(let i=0;i<discoveriesData.length;i++){
 const a=i*2.399;
 const d=24+i*14;
 const x=Math.cos(a)*d,z=Math.sin(a)*d;
 const y=terrainHeight(x,z);
 const group=new THREE.Group();
 group.position.set(x,y,z);

 const ring=new THREE.Mesh(
  new THREE.TorusGeometry(1.8,.055,8,36),
  markerMat
 );
 ring.rotation.x=Math.PI/2;
 ring.position.y=.12;
 group.add(ring);

 const pillar=new THREE.Mesh(
  new THREE.CylinderGeometry(.035,.035,1.8,8),
  markerMat
 );
 pillar.position.y=1;
 group.add(pillar);

 const orb=new THREE.Mesh(
  new THREE.SphereGeometry(.18,12,10),
  new THREE.MeshBasicMaterial({color:0xa4ffff})
 );
 orb.position.y=2;
 group.add(orb);

 scene.add(group);
 discoveries.push({
  group,ring,orb,
  name:discoveriesData[i][0],
  description:discoveriesData[i][1],
  long:discoveriesData[i][2],tag:discoveriesData[i][3],
  found:false
 });
}

// --------------------------------------------------
// PARTÍCULAS (poeira baixa e partículas de sódio) E MARCAS NO REGOLITO
// --------------------------------------------------

const MERCURY_G = 3.7;
const MAX_P = 900;
const pPos = new Float32Array(MAX_P*3), pCol = new Float32Array(MAX_P*3);
const pAlpha = new Float32Array(MAX_P), pSize = new Float32Array(MAX_P);
const pVel = new Float32Array(MAX_P*3), pLife = new Float32Array(MAX_P), pMax = new Float32Array(MAX_P);
const pBase = new Float32Array(MAX_P), pGrav = new Float32Array(MAX_P);
let pHead = 0;
const pGeo = new THREE.BufferGeometry();
pGeo.setAttribute("position", new THREE.BufferAttribute(pPos,3));
pGeo.setAttribute("aColor", new THREE.BufferAttribute(pCol,3));
pGeo.setAttribute("aAlpha", new THREE.BufferAttribute(pAlpha,1));
pGeo.setAttribute("aSize", new THREE.BufferAttribute(pSize,1));
const pMat = new THREE.ShaderMaterial({
  transparent:true, depthWrite:false,
  vertexShader:[
    "attribute vec3 aColor; attribute float aAlpha; attribute float aSize;",
    "varying vec3 vC; varying float vA;",
    "uniform float uScale;",
    "void main(){ vC=aColor; vA=aAlpha;",
    " vec4 mv=modelViewMatrix*vec4(position,1.0);",
    " gl_PointSize=aSize*uScale/max(1.0,-mv.z);",
    " gl_Position=projectionMatrix*mv; }"
  ].join("\n"),
  fragmentShader:[
    "varying vec3 vC; varying float vA;",
    "void main(){ float d=length(gl_PointCoord-0.5)*2.0; if(d>1.0)discard;",
    " gl_FragColor=vec4(vC,vA*(1.0-d*d)); }"
  ].join("\n"),
  uniforms:{uScale:{value:innerHeight}}
});
for (let i=0;i<MAX_P;i++){ pPos[i*3+1]=-9999; }
const particles = new THREE.Points(pGeo, pMat);
particles.frustumCulled = false;
scene.add(particles);

function spawnParticle(x,y,z,vx,vy,vz,life,size,alpha,r,g,b,grav){
  const i = pHead; pHead = (pHead+1)%MAX_P;
  pPos[i*3]=x;pPos[i*3+1]=y;pPos[i*3+2]=z;
  pVel[i*3]=vx;pVel[i*3+1]=vy;pVel[i*3+2]=vz;
  pLife[i]=life;pMax[i]=life;pBase[i]=alpha;pSize[i]=size;pGrav[i]=grav;
  pCol[i*3]=r;pCol[i*3+1]=g;pCol[i*3+2]=b;pAlpha[i]=alpha;
}
// Poeira de regolito: sobe em arco baixo e cai, sem atmosfera para freá-la
function spawnDust(x,z,speed,count,spread){
  const y = terrainHeight(x,z);
  for (let k=0;k<count;k++){
    const a = Math.random()*Math.PI*2, s = (0.3+Math.random())*spread;
    spawnParticle(
      x+(Math.random()-.5)*.5, y+.08, z+(Math.random()-.5)*.5,
      Math.cos(a)*s + (Math.random()-.5)*speed*.2, .6+Math.random()*(1.2+speed*.08), Math.sin(a)*s,
      1.1+Math.random()*1.1, .5+Math.random()*.8, .3, .5,.47,.43, MERCURY_G
    );
  }
}
let sodiumTimer = 0;
function updateParticles(dt){
  uScaleUpdate();
  for (let i=0;i<MAX_P;i++){
    if (pLife[i]<=0){ if (pAlpha[i]!==0){pAlpha[i]=0;pPos[i*3+1]=-9999;} continue; }
    pLife[i]-=dt;
    pVel[i*3+1]-=pGrav[i]*dt;
    pPos[i*3]+=pVel[i*3]*dt; pPos[i*3+1]+=pVel[i*3+1]*dt; pPos[i*3+2]+=pVel[i*3+2]*dt;
    if (pGrav[i]>0){
      const gy = terrainHeight(pPos[i*3],pPos[i*3+2]);
      if (pPos[i*3+1]<gy){ pPos[i*3+1]=gy; pVel[i*3+1]=0; pVel[i*3]*=.4; pVel[i*3+2]*=.4; }
    }
    const f = Math.max(0,pLife[i]/pMax[i]);
    pAlpha[i] = pBase[i]*f;
  }
  // Partículas raras de sódio subindo do solo ao redor do jogador
  sodiumTimer -= dt;
  if (sodiumTimer<=0){
    sodiumTimer = 0.5+Math.random()*1.2;
    const a=Math.random()*Math.PI*2, d=8+Math.random()*50;
    const x=player.x+Math.cos(a)*d, z=player.z+Math.sin(a)*d;
    spawnParticle(x,terrainHeight(x,z)+.2,z,(Math.random()-.5)*.3,1.6+Math.random()*1.5,(Math.random()-.5)*.3,
      6+Math.random()*4, .35, .6, 1,.82,.3, 0);
  }
  pGeo.attributes.position.needsUpdate=true;
  pGeo.attributes.aAlpha.needsUpdate=true;
}
function uScaleUpdate(){ pMat.uniforms.uScale.value = renderer.getPixelRatio()*innerHeight*0.5/Math.tan(camera.fov*Math.PI/360); }

// Marcas no solo (pegadas e pneus): instâncias achatadas em anel circular
const TRACK_MAX = 1400;
const trackMat = new THREE.MeshBasicMaterial({
  color:0x000000, transparent:true, opacity:.34, depthWrite:false,
  polygonOffset:true, polygonOffsetFactor:-4, polygonOffsetUnits:-4
});
const trackGeo = new THREE.PlaneGeometry(1,1); trackGeo.rotateX(-Math.PI/2);
const tracks = new THREE.InstancedMesh(trackGeo, trackMat, TRACK_MAX);
tracks.frustumCulled = false; tracks.count = 0;
scene.add(tracks);
let trackHead = 0, trackCount = 0;
const tObj = new THREE.Object3D(), tN = new THREE.Vector3(), tUp = new THREE.Vector3(0,1,0), tQ = new THREE.Quaternion(), tQy = new THREE.Quaternion();
function addTrack(x,z,yaw,w,l){
  const e=.4;
  const dhdx=(terrainHeight(x+e,z)-terrainHeight(x-e,z))/(2*e);
  const dhdz=(terrainHeight(x,z+e)-terrainHeight(x,z-e))/(2*e);
  tN.set(-dhdx,1,-dhdz).normalize();
  tQ.setFromUnitVectors(tUp,tN);
  tQy.setFromAxisAngle(tUp,yaw);
  tObj.position.set(x,terrainHeight(x,z)+.035,z);
  tObj.quaternion.copy(tQ).multiply(tQy);
  tObj.scale.set(w,1,l);
  tObj.updateMatrix();
  tracks.setMatrixAt(trackHead,tObj.matrix);
  trackHead=(trackHead+1)%TRACK_MAX;
  trackCount=Math.min(TRACK_MAX,trackCount+1);
  tracks.count=trackCount;
  tracks.instanceMatrix.needsUpdate=true;
}

// --------------------------------------------------
// ESTAÇÕES DE RECARGA
// --------------------------------------------------

const stations = [];
{
  const baseMat = new THREE.MeshStandardMaterial({color:0xd9d4c8,roughness:.5,metalness:.5});
  const darkMat = new THREE.MeshStandardMaterial({color:0x2a2e34,roughness:.6,metalness:.6});
  const lightMat = new THREE.MeshStandardMaterial({color:0x8dffad,emissive:0x2ecf6a,emissiveIntensity:2.2});
  const panelMat = new THREE.MeshStandardMaterial({color:0x14213d,roughness:.3,metalness:.8});
  [[8,18],[150,-110],[-170,120]].forEach(([x,z],idx)=>{
    const g = new THREE.Group();
    g.position.set(x,terrainHeight(x,z),z);
    const add=(geo,mat,px,py,pz,cast)=>{const m=new THREE.Mesh(geo,mat);m.position.set(px,py,pz);if(cast){m.castShadow=true;m.receiveShadow=true;}g.add(m);return m;};
    add(new THREE.CylinderGeometry(1.6,1.9,.4,16),darkMat,0,.2,0,true);
    add(new THREE.CylinderGeometry(.55,.65,2.6,12),baseMat,0,1.7,0,true);
    add(new THREE.BoxGeometry(.9,.5,.9),darkMat,0,3.2,0,true);
    const ring = add(new THREE.TorusGeometry(1.35,.05,8,32),lightMat,0,.5,0,false); ring.rotation.x=Math.PI/2;
    add(new THREE.SphereGeometry(.14,10,10),lightMat,0,3.65,0,false);
    const p1 = add(new THREE.BoxGeometry(2.4,.06,1.2),panelMat,2.0,2.4,0,true); p1.rotation.z=-.35;
    const p2 = add(new THREE.BoxGeometry(2.4,.06,1.2),panelMat,-2.0,2.4,0,true); p2.rotation.z=.35;
    scene.add(g);
    stations.push({x,z,group:g,ring,name:"ESTAÇÃO DE RECARGA "+(idx+1)});
  });
}
const STATION_RANGE = 7;

// --------------------------------------------------
// SISTEMAS DO TRAJE: oxigênio, bateria do jipe, calor e temperatura
// --------------------------------------------------

const vit = {
  o2:100, bat:100, heat:0, temp:300, tempTarget:300,
  inShade:false, speedMult:1, nearStation:null,
  shadeTimer:0, wasHot:false, batWarned:false, o2Warned:false, rescues:0, time:0
};

function sunOccluded(x,y,z){
  const dx=sunDir.x,dy=sunDir.y,dz=sunDir.z;
  for(let t=2;t<=110;t+=3){
    const px=x+dx*t,py=y+dy*t,pz=z+dz*t;
    if(terrainHeight(px,pz)>py)return true;
    if(t<=50){
      for(const c of colliders){
        if(c.top>50)continue;
        const ex=px-c.x,ez=pz-c.z;
        if(ex*ex+ez*ez<c.r*c.r&&py<c.top)return true;
      }
    }
  }
  return false;
}

function updateThermal(dt){
  vit.shadeTimer-=dt;
  if(vit.shadeTimer<=0){
    vit.shadeTimer=.25;
    vit.inShade=sunOccluded(player.x,terrainHeight(player.x,player.z)+1.2,player.z);
    const k=Math.min(1,Math.sin(sunElev)/.7);
    // sol direto: ~145 a 430 °C; sombra: cai até cerca de -180 °C
    vit.tempTarget=vit.inShade?(-182+30*k):(130+300*k);
  }
  vit.temp+=(vit.tempTarget-vit.temp)*(1-Math.exp(-.45*dt));
}

function rescuePlayer(reason){
  const st=stations.reduce((a,b)=>Math.hypot(a.x-player.x,a.z-player.z)<Math.hypot(b.x-player.x,b.z-player.z)?a:b);
  if(isDriving)exitJeep();
  player.x=st.x+2.8;player.z=st.z+2.8;
  player.y=terrainHeight(player.x,player.z)+1.75;
  player.vy=0;
  camera.position.set(player.x,player.y,player.z);
  vit.o2=65;vit.heat=0;vit.rescues++;
  showToast("RESGATE AUTOMÁTICO","Você foi levado à estação mais próxima. "+reason);
  message.textContent="Resgate automático: "+reason;
}

function updateVitals(dt){
  vit.time+=dt;
  updateThermal(dt);

  // estação de recarga
  vit.nearStation=null;
  for(const s of stations){
    const bx=isDriving?jeepGroup.position.x:player.x,bz=isDriving?jeepGroup.position.z:player.z;
    if(Math.hypot(bx-s.x,bz-s.z)<STATION_RANGE){vit.nearStation=s;break;}
  }

  // calor
  const hot=vit.temp>250;
  if(hot){
    vit.heat+=((vit.temp-250)/180)*3.2*(isDriving?.45:1)*dt;
  }else if(vit.temp>60){
    vit.heat-=1.2*dt;
  }else{
    vit.heat-=6*dt;
  }
  if(vit.nearStation){
    vit.heat-=16*dt;vit.o2+=28*dt;vit.bat+=22*dt;
  }
  vit.heat=Math.max(0,Math.min(100,vit.heat));

  // oxigênio (a cabine do jipe poupa o traje)
  const running=!isDriving&&(keys.ShiftLeft||keys.ShiftRight||touch.run)&&(keys.KeyW||keys.KeyA||keys.KeyS||keys.KeyD||touch.moving);
  let drain=isDriving?.015:(.085+(running?.1:0));
  if(vit.heat>=100)drain*=2;
  vit.o2-=drain*dt;
  vit.o2=Math.max(0,Math.min(100,vit.o2));

  // bateria do jipe
  if(isDriving){
    vit.bat-=(.03+Math.abs(jeepSpeed)/JEEP_MAX*.13+(jeepHeadlightsOn?.03:0))*dt;
  }
  vit.bat=Math.max(0,Math.min(100,vit.bat));
  if(vit.bat<=0&&isDriving&&!vit.batWarned){vit.batWarned=true;showToast("BATERIA ESGOTADA","O jipe parou. Empurre-se até uma estação ou continue a pé.");}
  if(vit.bat>15)vit.batWarned=false;

  vit.speedMult=vit.heat>=100?.5:1;

  // alertas
  const w=$("heatWarn");
  if(vit.heat>=100){w.hidden=false;w.textContent="SUPERAQUECIMENTO: SISTEMAS LENTOS";w.className="blink";}
  else if(vit.heat>=70){w.hidden=false;w.textContent="ALERTA: PROCURE UMA SOMBRA";w.className="blink";}
  else if(vit.o2<25){w.hidden=false;w.textContent="OXIGÊNIO BAIXO: VÁ À ESTAÇÃO";w.className="blink";}
  else{w.hidden=true;}
  if(vit.heat>=70)vit.wasHot=true;
  if(vit.wasHot&&vit.heat<30){vit.wasHot=false;unlockAch("shade");}

  if(vit.o2<=0)rescuePlayer("Oxigênio esgotado.");

  // HUD
  const col=(v,inv)=>{const x=inv?100-v:v;return x>50?"#65e5ed":(x>25?"#f1a96b":"#ff5c4a");};
  $("o2Bar").style.width=vit.o2+"%";$("o2Bar").style.background=col(vit.o2);$("o2Txt").textContent=Math.round(vit.o2)+"%";
  $("batBar").style.width=vit.bat+"%";$("batBar").style.background=col(vit.bat);$("batTxt").textContent=Math.round(vit.bat)+"%";
  $("heatBar").style.width=vit.heat+"%";$("heatBar").style.background=col(vit.heat,true);$("heatTxt").textContent=Math.round(vit.heat)+"%";
  const t=Math.round(vit.temp);
  $("tempInfo").textContent=(t>0?"+":"")+t+" °C"+(vit.inShade?" ☾":" ☀");
  $("heatTint").style.opacity=Math.max(0,(vit.heat-55)/45)*(.55+.2*Math.sin(vit.time*5));
  $("lowO2").style.opacity=vit.o2<20?(20-vit.o2)/20*.9:0;
}

// --------------------------------------------------
// TOAST, CONQUISTAS E DIÁRIO
// --------------------------------------------------

let toastTimer=0;
function showToast(title,sub){
  const t=$("toast");
  t.innerHTML=title+(sub?"<small>"+sub+"</small>":"");
  t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>t.classList.remove("show"),4200);
}

const achDefs={
  first:["Primeira descoberta","Registrou sua primeira estrutura"],
  km:["Percorreu 1 km","1.000 m a pé ou de jipe"],
  valley:["Desceu em um vale profundo","Alcançou o fundo de um cânion"],
  jump:["Saltou de uma escarpa","Caiu mais de 3 m de altura"],
  rover:["Piloto de Mercúrio","Dirigiu 500 m no jipe"],
  shade:["Sobrevivente do Sol","Esfriou na sombra após quase superaquecer"],
  half:["Cientista júnior","Registrou 6 descobertas"],
  all:["Cientista planetário","Registrou todas as descobertas"]
};
const achDone={};
function unlockAch(id){
  if(achDone[id])return;
  achDone[id]=true;
  showToast("CONQUISTA: "+achDefs[id][0].toUpperCase(),achDefs[id][1]);
}

let journalOpen=false,endOpen=false;
function renderJournal(){
  $("achList").innerHTML=Object.keys(achDefs).map(k=>
    '<span class="ach'+(achDone[k]?' on':'')+'" title="'+achDefs[k][1]+'">'+(achDone[k]?'✓ ':'')+achDefs[k][0]+'</span>').join("");
  $("journalList").innerHTML=discoveries.map(d=>d.found
    ?'<div class="jEntry"><div class="tag">'+d.tag+'</div><h3>'+d.name+'</h3><p>'+d.long+'</p></div>'
    :'<div class="jEntry locked"><div class="tag">'+d.tag+'</div><h3>??? NÃO REGISTRADO</h3><p>Encontre e analise o marcador para desbloquear esta entrada.</p></div>').join("");
}
function toggleJournal(){
  if(endOpen)return;
  journalOpen=!journalOpen;
  $("journal").hidden=!journalOpen;
  if(journalOpen){renderJournal();releaseKeys();document.exitPointerLock();}
  else lockPointer();
}
function releaseKeys(){for(const k in keys)keys[k]=false;scanHold=false;scanProgress=0;touchReset();}

function showEndScreen(){
  endOpen=true;
  releaseKeys();
  document.exitPointerLock();
  const m=Math.floor(vit.time/60),s=Math.floor(vit.time%60);
  $("endStats").innerHTML=[
    ["DISTÂNCIA",Math.floor(player.walked)+" m"],
    ["TEMPO DE MISSÃO",String(m).padStart(2,"0")+":"+String(s).padStart(2,"0")],
    ["DESCOBERTAS",foundCount+" / "+discoveries.length],
    ["CONQUISTAS",Object.keys(achDone).length+" / "+Object.keys(achDefs).length]
  ].map(a=>"<div>"+a[0]+"<b>"+a[1]+"</b></div>").join("");
  $("endScreen").hidden=false;
}
$("btnEndContinue").addEventListener("click",()=>{
  endOpen=false;$("endScreen").hidden=true;lockPointer();
});

// --------------------------------------------------
// BÚSSOLA E MINIMAPA
// --------------------------------------------------

const cpCv=$("compassCv"),cpX=cpCv.getContext("2d");
const mmCv=$("minimapCv"),mmX=mmCv.getContext("2d");
function wrapPi(a){while(a>Math.PI)a-=Math.PI*2;while(a<-Math.PI)a+=Math.PI*2;return a;}

function drawCompass(){
  const W=cpCv.width,H=cpCv.height,span=Math.PI;
  const ppr=W/span;
  cpX.clearRect(0,0,W,H);
  cpX.font="bold 24px Arial";cpX.textAlign="center";cpX.textBaseline="middle";
  // marcas a cada 15°, bearing horário = -ângulo (yaw cresce para a esquerda)
  for(let deg=0;deg<360;deg+=15){
    const rel=wrapPi(deg*Math.PI/180-(-player.yaw));
    if(Math.abs(rel)>span/2)continue;
    const x=W/2+rel*ppr;
    const card=deg%90===0;
    cpX.fillStyle=card?"#f1a96b":"rgba(200,210,220,.55)";
    if(card){
      cpX.fillText({0:"N",90:"L",180:"S",270:"O"}[deg],x,22);
    }else{
      cpX.fillRect(x-1,H-18,2,deg%45===0?14:8);
    }
  }
  function mark(wx,wz,color,size,shape){
    const th=Math.atan2(-(wx-player.x),-(wz-player.z));
    const rel=wrapPi(-(th-player.yaw));
    if(Math.abs(rel)>span/2)return;
    const x=W/2+rel*ppr;
    cpX.fillStyle=color;cpX.beginPath();
    if(shape==="d"){cpX.moveTo(x,H-34);cpX.lineTo(x+size,H-34+size);cpX.lineTo(x,H-34+size*2);cpX.lineTo(x-size,H-34+size);}
    else{cpX.rect(x-size,H-34,size*2,size*2);}
    cpX.fill();
  }
  discoveries.forEach(d=>{if(!d.found)mark(d.group.position.x,d.group.position.z,"#65e5ed",7,"d");});
  stations.forEach(s=>mark(s.x,s.z,"#8dffad",6,"s"));
  mark(jeepGroup.position.x,jeepGroup.position.z,"#ff8a4c",7,"s");
}

function drawMinimap(){
  const S=mmCv.width,C=S/2,R=110,k=C/R;
  mmX.clearRect(0,0,S,S);
  mmX.strokeStyle="rgba(180,195,210,.18)";mmX.lineWidth=1;
  [R/3,R*2/3].forEach(r=>{mmX.beginPath();mmX.arc(C,C,r*k,0,Math.PI*2);mmX.stroke();});
  mmX.beginPath();mmX.moveTo(C,0);mmX.lineTo(C,S);mmX.moveTo(0,C);mmX.lineTo(S,C);mmX.stroke();
  const fx=-Math.sin(player.yaw),fz=-Math.cos(player.yaw),rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
  function pt(wx,wz,color,r,sq){
    let dx=wx-player.x,dz=wz-player.z;
    let px=dx*rx+dz*rz,py=-(dx*fx+dz*fz);
    const d=Math.hypot(px,py);
    let a=1;
    if(d>R*.93){px*=R*.93/d;py*=R*.93/d;a=.5;}
    mmX.globalAlpha=a;mmX.fillStyle=color;
    const x=C+px*k,y=C+py*k;
    if(sq)mmX.fillRect(x-r,y-r,r*2,r*2);
    else{mmX.beginPath();mmX.arc(x,y,r,0,Math.PI*2);mmX.fill();}
    mmX.globalAlpha=1;
  }
  discoveries.forEach(d=>pt(d.group.position.x,d.group.position.z,d.found?"#8dffad":"#65e5ed",d.found?5:8,false));
  stations.forEach(s=>pt(s.x,s.z,"#8dffad",8,true));
  pt(jeepGroup.position.x,jeepGroup.position.z,"#ff8a4c",9,true);
  // jogador no centro, apontando para cima
  mmX.fillStyle="#ffffff";mmX.beginPath();mmX.moveTo(C,C-14);mmX.lineTo(C+9,C+10);mmX.lineTo(C,C+5);mmX.lineTo(C-9,C+10);mmX.closePath();mmX.fill();
}

// --------------------------------------------------
// ÁUDIO AMBIENTE DO TRAJE: zumbido, respiração e passos
// --------------------------------------------------

let ambNoise=null,breathTimer=2,stepDistAcc=0,stepSide=1,lastSolidY=0,wasAir=false,trackAcc=0,jeepTrackAcc=0;
function setupAmbientAudio(noiseBuf){
  ambNoise=noiseBuf;
  const hum=audioCtx.createGain();hum.gain.value=.018;
  const lp=audioCtx.createBiquadFilter();lp.type="lowpass";lp.frequency.value=260;
  [52,104.5,157].forEach((f,i)=>{
    const o=audioCtx.createOscillator();o.type=i?"sine":"triangle";o.frequency.value=f;
    const g=audioCtx.createGain();g.gain.value=i===0?1:.4/i;
    o.connect(g);g.connect(lp);o.start();
  });
  lp.connect(hum);hum.connect(sfxGain);
}
function playStep(run){
  if(!audioCtx||!ambNoise)return;
  const t=audioCtx.currentTime;
  const o=audioCtx.createOscillator();o.type="sine";
  o.frequency.setValueAtTime(95,t);o.frequency.exponentialRampToValueAtTime(40,t+.14);
  const g=audioCtx.createGain();
  g.gain.setValueAtTime(.0001,t);g.gain.linearRampToValueAtTime(run?.2:.14,t+.01);g.gain.exponentialRampToValueAtTime(.0001,t+.16);
  o.connect(g);g.connect(sfxGain);o.start(t);o.stop(t+.2);
  const n=audioCtx.createBufferSource();n.buffer=ambNoise;
  const f=audioCtx.createBiquadFilter();f.type="lowpass";f.frequency.value=320;
  const ng=audioCtx.createGain();
  ng.gain.setValueAtTime(.0001,t);ng.gain.linearRampToValueAtTime(.08,t+.01);ng.gain.exponentialRampToValueAtTime(.0001,t+.1);
  n.connect(f);f.connect(ng);ng.connect(sfxGain);n.start(t,Math.random());n.stop(t+.12);
}
function playBreath(fast){
  if(!audioCtx||!ambNoise)return;
  const t=audioCtx.currentTime,d=fast?.65:1.0;
  const n=audioCtx.createBufferSource();n.buffer=ambNoise;
  const f=audioCtx.createBiquadFilter();f.type="bandpass";f.frequency.value=650;f.Q.value=.7;
  const g=audioCtx.createGain();
  g.gain.setValueAtTime(.0001,t);
  g.gain.linearRampToValueAtTime(.05,t+d*.45);g.gain.linearRampToValueAtTime(.0001,t+d*.9);
  g.gain.linearRampToValueAtTime(.032,t+d*1.4);g.gain.linearRampToValueAtTime(.0001,t+d*2);
  n.connect(f);f.connect(g);g.connect(sfxGain);n.start(t,Math.random());n.stop(t+d*2.05);
}
function updateAmbientAudio(dt,moving,running){
  breathTimer-=dt;
  if(breathTimer<=0){
    const fast=running||vit.o2<25||vit.heat>80;
    playBreath(fast);
    breathTimer=fast?2.0:3.8;
  }
}

// --------------------------------------------------
// PASSOS, PEGADAS E POEIRA
// --------------------------------------------------

function updateFootsteps(dt,moveLen,running){
  if(!player.onGround||moveLen<.02)return;
  stepDistAcc+=moveLen;
  const stride=running?2.6:1.7;
  if(stepDistAcc>=stride){
    stepDistAcc-=stride;stepSide=-stepSide;
    const rx=Math.cos(player.yaw),rz=-Math.sin(player.yaw);
    const fx=player.x+rx*.2*stepSide,fz=player.z+rz*.2*stepSide;
    addTrack(fx,fz,player.yaw,.2,.42);
    spawnDust(fx,fz,running?8:4,running?5:3,running?1.1:.6);
    playStep(running);
  }
}
function updateJeepFx(dt){
  const sp=Math.abs(jeepSpeed);
  if(jeepAir)return;
  if(sp>1){
    jeepTrackAcc+=sp*dt;
    if(jeepTrackAcc>=1.4){
      jeepTrackAcc-=1.4;
      const h=jeepHeading,rx=Math.cos(h),rz=-Math.sin(h),bx=Math.sin(h),bz=Math.cos(h);
      [[-1.05,1.15],[1.05,1.15],[-1.05,-1.35],[1.05,-1.35]].forEach(([lx,lz])=>{
        addTrack(jeepGroup.position.x+rx*lx+bx*lz,jeepGroup.position.z+rz*lx+bz*lz,h,.4,1.7);
      });
    }
    if(sp>3&&Math.random()<Math.min(1,sp/8)){
      const h=jeepHeading,bx=Math.sin(h),bz=Math.cos(h),rx=Math.cos(h),rz=-Math.sin(h);
      const side=Math.random()<.5?-1:1;
      spawnDust(jeepGroup.position.x+rx*1.05*side+bx*1.4,jeepGroup.position.z+rz*1.05*side+bz*1.4,sp,2,1.3);
    }
  }
}
function trackAir(gh,grounded){
  if(grounded){
    if(wasAir&&lastSolidY-gh>=3)unlockAch("jump");
    wasAir=false;lastSolidY=gh;
  }else wasAir=true;
}

// --------------------------------------------------
// CONTROLE EM PRIMEIRA PESSOA
// --------------------------------------------------

const player={
 x:0,z:12,y:3,
 vx:0,vy:0,vz:0,
 yaw:0,pitch:0,
 onGround:false,
 walked:0
};

player.y=terrainHeight(player.x,player.z)+1.75;
camera.position.set(player.x,player.y,player.z);

const keys={};
let playing=false;
let lastTime=performance.now();
let foundCount=0;
let activeTarget=null;

// O jogo só processa entrada quando está de fato "em jogo":
// no PC, com o mouse capturado; no celular, sem menu/diário/tela final abertos.
function inputActive(){
 if(!playing)return false;
 if(touchMode)return !journalOpen&&!endOpen&&startScreen.style.display==="none";
 return document.pointerLockElement===renderer.domElement;
}

document.addEventListener("keydown",e=>{
 keys[e.code]=true;

 if(["Space","ArrowUp","ArrowDown","ArrowLeft","ArrowRight"].includes(e.code))
  e.preventDefault();

 if(e.code==="KeyJ" && playing && started && !e.repeat) toggleJournal();
 if(e.code==="KeyE" && playing && !e.repeat && !journalOpen && !endOpen) interact();
 if(e.code==="KeyL" && playing && isDriving) setJeepHeadlights(!jeepHeadlightsOn);
 if(e.code==="Space" && player.onGround && !isDriving){
  player.vy=7.5;
  player.onGround=false;
 }
});
document.addEventListener("keyup",e=>{
 keys[e.code]=false;
 if(e.code==="KeyE"){scanHold=false;scanProgress=0;}
});

renderer.domElement.addEventListener("click",()=>{
 if(!touchMode && playing && document.pointerLockElement!==renderer.domElement){
  renderer.domElement.requestPointerLock();
 }
});

document.addEventListener("mousemove",e=>{
 if(!playing || document.pointerLockElement!==renderer.domElement)return;
 player.yaw-=e.movementX*mouseSens;
 player.pitch-=e.movementY*mouseSens;
 player.pitch=Math.max(-1.45,Math.min(1.45,player.pitch));
});

// --------------------------------------------------
// MENU (tela inicial e pausa)
// --------------------------------------------------

const hud=$("hud");
hud.style.display="none";
let started=false;
let menuYaw=.95;
let mouseSens=.0022;

const screens={
 main:$("screenMain"),
 controls:$("screenControls"),
 options:$("screenOptions")
};
function showScreen(name){
 for(const k in screens)screens[k].hidden=(k!==name);
}
function openMenu(paused){
 startScreen.style.display="flex";
 startScreen.classList.toggle("pause",paused);
 if(paused){silenceJeep();releaseKeys();}
 $("menuTitle").innerHTML=paused?"MISSÃO<br>PAUSADA":"PIXEL<br>SAGA";
 $("menuSubtitle").textContent=paused?"PIXEL SAGA • EXPLORAÇÃO EM MERCÚRIO":"EXPLORAÇÃO EM MERCÚRIO";
 $("btnPlay").textContent=paused?"CONTINUAR":"INICIAR EXPLORAÇÃO";
 $("btnQuit").hidden=!paused;
 showScreen("main");
}
function lockPointer(){
 if(touchMode)return;
 try{
  const r=renderer.domElement.requestPointerLock();
  if(r&&r.catch)r.catch(()=>{});
 }catch(e){}
}
function resume(){
 initAudio();
 if(touchMode)goFullscreen();
 startScreen.style.display="none";
 hud.style.display="";
 if(!started){
  started=true;
  playing=true;
  player.yaw=menuYaw;
  player.pitch=0;
  message.textContent="Missão iniciada. Investigue os marcadores azuis. Há um jipe estacionado perto: aproxime-se e pressione "+AK+".";
 }
 lockPointer();
}

$("btnPlay").addEventListener("click",resume);
$("btnControls").addEventListener("click",()=>showScreen("controls"));
$("btnOptions").addEventListener("click",()=>showScreen("options"));
$("btnQuit").addEventListener("click",()=>location.reload());
document.querySelectorAll("[data-back]").forEach(b=>{
 b.addEventListener("click",()=>showScreen("main"));
});

$("optSens").addEventListener("input",e=>{
 const v=+e.target.value;
 mouseSens=.0022*v/5;
 $("optSensVal").textContent=v;
});
$("optFov").addEventListener("input",e=>{
 const v=+e.target.value;
 camera.fov=v;
 camera.updateProjectionMatrix();
 $("optFovVal").textContent=v+"°";
});
$("optVol").addEventListener("input",e=>{
 const v=+e.target.value;
 masterVolume=v/100;
 if(masterGain)masterGain.gain.value=masterVolume;
 $("optVolVal").textContent=v+"%";
});
$("optExp").addEventListener("input",e=>{
 const v=+e.target.value;
 renderer.toneMappingExposure=1.05*v/100;
 $("optExpVal").textContent=v+"%";
});

// Esc (ou perda do mouse) abre o menu de pausa
document.addEventListener("pointerlockchange",()=>{
 if(!touchMode && document.pointerLockElement!==renderer.domElement && started
    && !journalOpen && !endOpen && startScreen.style.display==="none"){
  openMenu(true);
 }
});
document.addEventListener("pointerlockerror",()=>{
 if(!touchMode&&started&&!journalOpen&&!endOpen)openMenu(true);
});

// --------------------------------------------------
// --------------------------------------------------
// CONTROLES TOUCH: analógico virtual, arrastar para olhar e botões
// --------------------------------------------------

const tUI=$("touchUI"),moveZone=$("moveZone"),joyBase=$("joyBase"),joyKnob=$("joyKnob"),tAct=$("tAct");
const JOY_R=42;            // alcance do analógico em pixels
let joyId=null,joyCx=0,joyCy=0,tActLbl="";

function joyClear(){
 touch.x=touch.y=0;touch.moving=false;touch.run=false;
 joyKnob.style.transform="";
 joyBase.classList.remove("active");
 joyBase.style.left=joyBase.style.top=joyBase.style.bottom="";
}
function touchReset(){joyId=null;lookId=null;joyClear();}

// Analógico flutuante: aparece onde o polegar encosta (metade esquerda da tela)
function joyUpdate(cx,cy){
 const dx=cx-joyCx,dy=cy-joyCy,d=Math.hypot(dx,dy)||1e-6;
 const k=Math.min(1,JOY_R/d);
 joyKnob.style.transform="translate("+(dx*k)+"px,"+(dy*k)+"px)";
 const m=Math.min(1,d/JOY_R);
 if(m<.15){touch.x=touch.y=0;touch.moving=false;touch.run=false;return;}
 const s=(m-.15)/.85;                    // zona morta + curva suave
 touch.x=dx/d*s;touch.y=-dy/d*s;
 touch.moving=true;
 touch.run=m>=.9;                        // empurrar até a borda = correr
}
moveZone.addEventListener("pointerdown",e=>{
 if(joyId!==null||!inputActive())return;
 e.preventDefault();
 joyId=e.pointerId;
 joyCx=Math.max(JOY_R+24,Math.min(innerWidth*.5,e.clientX));
 joyCy=Math.max(JOY_R+24,Math.min(innerHeight-JOY_R-24,e.clientY));
 joyBase.style.left=(joyCx-64)+"px";joyBase.style.top=(joyCy-64)+"px";joyBase.style.bottom="auto";
 joyBase.classList.add("active");
 try{moveZone.setPointerCapture(e.pointerId);}catch(_){}
 joyUpdate(e.clientX,e.clientY);
});
moveZone.addEventListener("pointermove",e=>{if(e.pointerId===joyId)joyUpdate(e.clientX,e.clientY);});
["pointerup","pointercancel","lostpointercapture"].forEach(n=>moveZone.addEventListener(n,e=>{
 if(e.pointerId!==joyId)return;
 joyId=null;joyClear();
}));

// Arrastar o dedo no resto da tela gira a câmera
let lookX=0,lookY=0;
const cv=renderer.domElement;
cv.addEventListener("pointerdown",e=>{
 if(!touchMode||lookId!==null||!inputActive())return;
 lookId=e.pointerId;lookX=e.clientX;lookY=e.clientY;
 try{cv.setPointerCapture(e.pointerId);}catch(_){}
});
cv.addEventListener("pointermove",e=>{
 if(e.pointerId!==lookId)return;
 const k=mouseSens*1.8;
 player.yaw-=(e.clientX-lookX)*k;
 player.pitch-=(e.clientY-lookY)*k;
 player.pitch=Math.max(-1.45,Math.min(1.45,player.pitch));
 lookX=e.clientX;lookY=e.clientY;
});
["pointerup","pointercancel","lostpointercapture"].forEach(n=>cv.addEventListener(n,e=>{
 if(e.pointerId===lookId)lookId=null;
}));

// Botões na tela
function bindBtn(id,down,up){
 const el=$(id);
 el.addEventListener("pointerdown",e=>{
  e.preventDefault();
  el.classList.add("on");
  try{el.setPointerCapture(e.pointerId);}catch(_){}
  if(navigator.vibrate)navigator.vibrate(8);
  if(down)down();
 });
 const rel=()=>{el.classList.remove("on");if(up)up();};
 ["pointerup","pointercancel","lostpointercapture"].forEach(n=>el.addEventListener(n,rel));
}
bindBtn("tAct",()=>{if(inputActive())interact();},()=>{scanHold=false;scanProgress=0;});
bindBtn("tJump",()=>{
 if(inputActive()&&player.onGround&&!isDriving){player.vy=7.5;player.onGround=false;}
});
bindBtn("tLight",()=>{if(inputActive()&&isDriving)setJeepHeadlights(!jeepHeadlightsOn);});
bindBtn("tJournal",()=>{if(started&&!endOpen)toggleJournal();});
bindBtn("tPause",()=>{if(started&&inputActive()){releaseKeys();openMenu(true);}});
$("btnJournalClose").addEventListener("click",()=>{if(journalOpen)toggleJournal();});

// O botão de ação muda de nome conforme o contexto; faróis só aparecem no jipe
function updateTouchUI(){
 if(!touchMode)return;
 tUI.classList.toggle("driving",isDriving);
 const lbl=isDriving?"SAIR":canEnterJeep?"ENTRAR":(activeTarget&&!activeTarget.found)?"ANALISAR":"AÇÃO";
 if(lbl!==tActLbl){tActLbl=lbl;tAct.textContent=lbl;}
}

// Tela cheia + paisagem (onde o navegador permitir)
function goFullscreen(){
 const de=document.documentElement,f=de.requestFullscreen||de.webkitRequestFullscreen;
 if(!f||document.fullscreenElement||document.webkitFullscreenElement)return;
 try{
  const p=f.call(de);
  if(p&&p.then)p.then(()=>{
   if(screen.orientation&&screen.orientation.lock)screen.orientation.lock("landscape").catch(()=>{});
  }).catch(()=>{});
 }catch(e){}
}

if(touchMode){
 // sem menu de contexto no toque longo; pausa automática ao sair do app/aba
 document.addEventListener("contextmenu",e=>e.preventDefault());
 document.addEventListener("gesturestart",e=>e.preventDefault());
 document.addEventListener("visibilitychange",()=>{
  if(document.hidden&&started&&inputActive()){releaseKeys();openMenu(true);}
 });
}

// --------------------------------------------------
// MOVIMENTAÇÃO
// --------------------------------------------------

// Bloqueia se os pés estão abaixo do topo da pedra (dá para pular em cima)
function blocked(x,z,feet){
 for(const c of colliders){
  const dx=x-c.x,dz=z-c.z;
  if(dx*dx+dz*dz<c.r*c.r && feet<c.top-.4)return true;
 }
 return false;
}

// Altura do topo da pedra sob o jogador, quando ele está em cima dela
function supportHeight(x,z,feet){
 let g=-Infinity;
 for(const c of colliders){
  const dx=x-c.x,dz=z-c.z;
  const rr=c.r*.9;
  if(dx*dx+dz*dz<rr*rr && feet>=c.top-.4 && c.top>g)g=c.top;
 }
 return g;
}

function updatePlayer(dt){
 if(isDriving){updateJeepDriving(dt);return;}
 const oldX=player.x,oldZ=player.z;
 const forward=new THREE.Vector3(-Math.sin(player.yaw),0,-Math.cos(player.yaw));
 const right=new THREE.Vector3(Math.cos(player.yaw),0,-Math.sin(player.yaw));

 let move=new THREE.Vector3();
 if(keys.KeyW||keys.ArrowUp)move.add(forward);
 if(keys.KeyS||keys.ArrowDown)move.sub(forward);
 if(keys.KeyD||keys.ArrowRight)move.add(right);
 if(keys.KeyA||keys.ArrowLeft)move.sub(right);
 if(touch.moving)move.addScaledVector(forward,touch.y).addScaledVector(right,touch.x);
 if(move.lengthSq()>1)move.normalize();

 const running=!!(keys.ShiftLeft||keys.ShiftRight||touch.run);
 const speed=(running?13:7)*vit.speedMult;
 player.x+=move.x*speed*dt;
 player.z+=move.z*speed*dt;

 player.x=Math.max(-WORLD*.48,Math.min(WORLD*.48,player.x));
 player.z=Math.max(-WORLD*.48,Math.min(WORLD*.48,player.z));

 const feet=player.y-1.75;
 if(blocked(player.x,player.z,feet)){
  // desliza ao longo da pedra em vez de travar
  if(!blocked(player.x,oldZ,feet)){player.z=oldZ;}
  else if(!blocked(oldX,player.z,feet)){player.x=oldX;}
  else{player.x=oldX;player.z=oldZ;}
 }

 const ground=Math.max(
  terrainHeight(player.x,player.z),
  supportHeight(player.x,player.z,feet)
 )+1.75;
 player.vy-=4.9*dt;
 player.y+=player.vy*dt;
 if(player.y<ground){
  player.y=ground;player.vy=0;player.onGround=true;
 }

 const stepLen=Math.hypot(player.x-oldX,player.z-oldZ);
 player.walked+=stepLen;
 updateFootsteps(dt,stepLen,running);
 if(player.y<=ground+.001&&player.vy===0)trackAir(ground-1.75,true);else trackAir(ground-1.75,false);
 if(ground-1.75<-6)unlockAch("valley");
 if(player.walked>=1000)unlockAch("km");
 camera.position.set(player.x,player.y,player.z);
 camera.rotation.set(player.pitch,player.yaw,0,"YXZ");

 $("distance").textContent=Math.floor(player.walked)+" m";
}

// --------------------------------------------------
// SCANNER
// --------------------------------------------------

function scanTarget(){
 if(!activeTarget){
  message.textContent="Nenhuma estrutura ao alcance. Procure um marcador azul.";
  return;
 }
 if(activeTarget.found){
  message.textContent="Esta descoberta já foi registrada.";
  return;
 }
 activeTarget.found=true;
 foundCount++;
 $("discoveries").textContent=foundCount+" / "+discoveries.length;
 message.textContent="REGISTRO CONCLUÍDO: "+activeTarget.name;
 objectiveText.textContent=activeTarget.description;
 activeTarget.orb.material.color.set(0x8dffad);
 activeTarget.ring.material.color.set(0x8dffad);
 unlockAch("first");
 if(foundCount>=6)unlockAch("half");
 showToast("NOVA ENTRADA NO DIÁRIO",activeTarget.name+" • tecla J");

 if(foundCount===discoveries.length){
  unlockAch("all");
  message.textContent="MISSÃO CONCLUÍDA! Todas as estruturas foram analisadas.";
  objectiveText.textContent="Todas as descobertas foram registradas. Continue explorando Mercúrio!";
  setTimeout(showEndScreen,3500);
 }
}

let canEnterJeep=false;
function updateScanner(dt){
 const bw=$("scanBarWrap");
 if(scanHold&&activeTarget&&!activeTarget.found&&!isDriving){
  scanProgress+=dt/SCAN_TIME;
  bw.hidden=false;$("scanBar").style.width=Math.min(100,scanProgress*100)+"%";
  if(scanProgress>=1){scanHold=false;scanProgress=0;bw.hidden=true;scanTarget();}
 }else{
  if(scanHold&&!activeTarget){scanHold=false;}
  scanProgress=0;bw.hidden=true;
 }
 if(isDriving){
  activeTarget=null;canEnterJeep=false;
  $("reticleLabel").textContent="";
  $("scan").textContent="[ "+AK+" ] SAIR DO JIPE"+(touchMode?"":"   [ L ] FARÓIS");
  return;
 }
 let closest=null,best=13;
 for(const d of discoveries){
  if(d.found)continue;
  const dist=camera.position.distanceTo(d.group.position);
  if(dist<best){best=dist;closest=d;}
 }
 const jd=Math.hypot(player.x-jeepGroup.position.x,player.z-jeepGroup.position.z);
 canEnterJeep=jd<JEEP_PROMPT_RANGE&&!(closest&&best<jd);
 activeTarget=canEnterJeep?null:closest;
 if(canEnterJeep){
  $("reticleLabel").textContent="JIPE ESPACIAL • "+jd.toFixed(1)+" m";
  $("scan").textContent="[ "+AK+" ] ENTRAR NO JIPE";
 }else if(closest){
  $("reticleLabel").textContent=closest.name+" • "+best.toFixed(1)+" m";
  $("scan").textContent=scanHold?"ANALISANDO... MANTENHA ["+AK+"]":"[ SEGURE "+AK+" ] ANALISAR E REGISTRAR";
 }else{
  $("reticleLabel").textContent="";
  $("scan").textContent="";
 }
}

// --------------------------------------------------
// ANIMAÇÃO
// --------------------------------------------------

function animate(now){
 requestAnimationFrame(animate);
 const dt=Math.min((now-lastTime)/1000,.04);
 lastTime=now;

 if(inputActive()){
  updatePlayer(dt);
  updateScanner(dt);
  updateVitals(dt);
  updateAmbientAudio(dt);
  const mt=Math.floor(vit.time);
  $("missionTime").textContent=String(Math.floor(mt/60)).padStart(2,"0")+":"+String(mt%60).padStart(2,"0");
 }
 updateParticles(dt);
 exoSphere.position.copy(camera.position);
 if(playing){
  drawCompass();drawMinimap();updateTouchUI();
  $("visor").style.opacity=isDriving?.35:1;
  stations.forEach(s=>{s.ring.rotation.z+=dt*.8;});
 }

 for(const d of discoveries){
  d.ring.rotation.z+=dt*.45;
  d.orb.position.y=2+Math.sin(now*.002+d.group.position.x)*.15;
 }

 // Na tela inicial a câmera gira devagar mostrando a paisagem
 if(!started){
  menuYaw+=dt*.04;
  camera.rotation.set(.12,menuYaw,0,"YXZ");
 }

 updateSun(dt);
 renderer.render(scene,camera);
}
updateSun(0);
requestAnimationFrame(animate);

addEventListener("resize",()=>{
 camera.aspect=innerWidth/innerHeight;
 camera.updateProjectionMatrix();
 renderer.setSize(innerWidth,innerHeight);
 renderer.setPixelRatio(Math.min(devicePixelRatio,MAX_DPR));
});

})();