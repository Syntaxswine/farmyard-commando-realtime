import {WEAPONS} from './aft/tactics/solo-weapon-data.js';
import {AIM_LEVELS} from './aft/tactics/aim-levels.js';
import {weaponSkill,refreshStats} from './aft/tactics/character-stats.js';

// Seconds, independent of frame rate and of the inherited turn/AP scheduler.
export const WEAPON_TIMING=Object.freeze({
  hands:{shot:.8,reload:0},knife:{shot:.7,reload:0},
  pistol:{shot:.65,reload:1.8},'pistol-offhand':{shot:.65,reload:1.8},
  assault:{shot:.5,reload:2.4},smg:{shot:.4,reload:2.8},rifle:{shot:1.25,reload:2.8},
  shotgun:{shot:1,reload:3},sniper:{shot:1.8,reload:3.2},hmg:{shot:.7,reload:4},
  grenade:{shot:1.2,reload:0},launcher:{shot:1.6,reload:3.6},rpg:{shot:2.2,reload:4},
  flamethrower:{shot:1.8,reload:3.5},
});
export const TARGET_PRIORITIES=['nearest','weakest','threat'];
export const automaticWeapon=weapon=>!!WEAPONS[weapon]?.mag&&!WEAPONS[weapon].blast&&!WEAPONS[weapon].incendiary&&!WEAPONS[weapon].thrown;
export const shotSeconds=(weapon,aim='hip',burst=false)=>WEAPON_TIMING[weapon].shot*(AIM_LEVELS[aim]?.multiplier||1)*(burst&&WEAPONS[weapon].burstRounds?1.5:1);
export const grenadeSeconds=unit=>WEAPON_TIMING.grenade.shot*(['pistol','pistol-offhand','smg'].includes(unit.weapon)?.5:1);
const emptyActor=weapon=>({weapon,cooldown:0,aimRemaining:0,signature:'',targetId:null,reload:null,manual:null,route:[],repath:0,search:8,credit:null});
const finite=(n,max=60)=>Number.isFinite(n)&&n>=0&&n<=max;

export function validateRealtime(state,inside=()=>true){
  const r=state.realtime;if(!r)return;
  const ids=new Set(state.units.map(u=>u.id)),target=id=>id===null||ids.has(id);
  if(r.version!==1||typeof r.runId!=='string'||!/^[a-zA-Z0-9-]{1,64}$/.test(r.runId)||typeof r.autoFire!=='boolean'||!TARGET_PRIORITIES.includes(r.priority)||!Object.hasOwn(AIM_LEVELS,r.aim)||!Object.hasOwn({torso:1,head:1,legs:1,weapon:1},r.zone)||typeof r.burst!=='boolean'||!target(r.targetId)||!target(r.pinnedId)||!finite(r.time,1e10)||!finite(r.fireClock,3)||!Number.isSafeInteger(r.kills)||r.kills<0||!r.actors||typeof r.actors!=='object'||Array.isArray(r.actors)||!r.xp||!r.gains||!r.earned)throw Error('Unsupported real-time save.');
  for(const key of ['firearms','heavyWeapons','explosives','dexterity','sneak'])if(!Number.isSafeInteger(r.earned[key])||r.earned[key]<0||r.earned[key]>1e9||!Number.isSafeInteger(r.xp[key])||r.xp[key]<0||r.xp[key]>1e9||!Number.isSafeInteger(r.gains[key])||r.gains[key]<0||r.gains[key]>100)throw Error('Unsupported real-time progression.');
  for(const [id,a]of Object.entries(r.actors)){
    if(!ids.has(Number(id))||!a||!WEAPONS[a.weapon]||!finite(a.cooldown)||!finite(a.aimRemaining)||!finite(a.repath)||!finite(a.search)||typeof a.signature!=='string'||a.signature.length>256||!target(a.targetId)||!Array.isArray(a.route)||a.route.length>8192||a.route.some(p=>!p||!inside(p)))throw Error('Unsupported real-time actor.');
    if(a.reload&&(!WEAPONS[a.reload.weapon]?.mag||a.reload.weapon!==a.weapon||!finite(a.reload.remaining)||a.reload.remaining>WEAPON_TIMING[a.weapon].reload))throw Error('Unsupported real-time reload.');
    if(a.manual&&(!Object.hasOwn(AIM_LEVELS,a.manual.aim)||!Object.hasOwn({torso:1,head:1,legs:1,weapon:1},a.manual.zone)||typeof a.manual.burst!=='boolean'||!a.manual.point&&!ids.has(a.manual.targetId)||a.manual.point&&(!inside(a.manual.point)||!finite(a.manual.point.h,20))))throw Error('Unsupported queued real-time shot.');
    if(a.credit&&(!ids.has(a.credit.id)||!WEAPONS[a.credit.weapon]||typeof a.credit.stealth!=='boolean'))throw Error('Unsupported real-time damage credit.');
  }
}

export function awardRealtimeKill(state,source){
  const r=state.realtime,u=state.units.find(u=>u.team==='squad');
  if(!r||source?.id!==u.id)return;
  r.kills++;
  for(const skill of [weaponSkill(source.weapon)||'dexterity',...(source.stealth?['sneak']:[])]){
    r.xp[skill]++;r.earned[skill]++;
    const needed=3+r.gains[skill]*2;
    if(r.xp[skill]>=needed&&u.stats[skill]<100){r.xp[skill]-=needed;r.gains[skill]++;u.stats[skill]++;refreshStats(u);state.log.unshift(skill+' improved to '+u.stats[skill]+'.');}
  }
}

export function createRealtimeRules({hero,alive,distance,canSee,confirmedImpact,previewAttack,attack,completeReload,travel,movePlayer,approachPath,refresh,log,fireRules}){
  const actor=(s,u)=>s.realtime.actors[u.id]??=(emptyActor(u.weapon));
  function enable(s){
    if(!s.realtime){
      const skills=['firearms','heavyWeapons','explosives','dexterity','sneak'];
      s.realtime={version:1,runId:globalThis.crypto?.randomUUID?.()||Date.now().toString(36)+'-'+Math.random().toString(36).slice(2),autoFire:false,priority:'nearest',aim:'hip',zone:'torso',burst:false,targetId:null,pinnedId:null,time:0,fireClock:0,kills:0,xp:Object.fromEntries(skills.map(k=>[k,0])),gains:Object.fromEntries(skills.map(k=>[k,0])),earned:Object.fromEntries(skills.map(k=>[k,0])),actors:{}};
    }
    for(const u of s.units){actor(s,u);u.realtimeMovement=true;if(!u.burningTurns)u.running=!u.sneaking;}
    if(['player','enemy'].includes(s.phase))s.phase='explore';
    refresh(s);return s;
  }
  function ready(s,u){const a=actor(s,u);return alive(u)&&!u.burningTurns&&!a.reload&&a.cooldown<=1e-7;}
  function busy(s,u){const a=actor(s,u);return a.reload?'Reloading · '+a.reload.remaining.toFixed(1)+' s':a.cooldown>1e-7?'Weapon cycling · '+a.cooldown.toFixed(1)+' s':'';}
  function resetAim(a){a.signature='';a.aimRemaining=0;a.targetId=null;}
  function configure(s,changes){
    const r=s.realtime;if(!r)return false;
    if(!changes||typeof changes!=='object'||Object.keys(changes).some(k=>!['autoFire','aim','priority','zone','burst'].includes(k)))return false;
    if(changes.aim!==undefined&&!Object.hasOwn(AIM_LEVELS,changes.aim)||changes.priority!==undefined&&!TARGET_PRIORITIES.includes(changes.priority)||changes.zone!==undefined&&!Object.hasOwn({head:1,torso:1,legs:1,weapon:1},changes.zone)||changes.burst!==undefined&&typeof changes.burst!=='boolean'||changes.autoFire!==undefined&&typeof changes.autoFire!=='boolean')return false;
    const a=actor(s,hero(s)),changed=changes.aim!==undefined&&changes.aim!==r.aim||changes.zone!==undefined&&changes.zone!==r.zone||changes.burst!==undefined&&changes.burst!==r.burst;
    Object.assign(r,changes);
    if(changed){resetAim(a);a.manual=null;}
    if(changes.autoFire===false){a.manual=null;r.targetId=null;resetAim(a);}
    s.revision++;return true;
  }
  function pin(s,id){const u=s.units.find(u=>u.id===id);if(id!==null&&(!u||u.team!=='guard'||!alive(u)||!s.detected.has(id)))return false;s.realtime.pinnedId=id;resetAim(actor(s,hero(s)));s.revision++;return true;}
  function changedWeapon(s,u){const a=actor(s,u);a.weapon=u.weapon;a.reload=null;a.manual=null;a.cooldown=Math.max(a.cooldown,.55);resetAim(a);}
  function reload(s,u){
    const a=actor(s,u),w=WEAPONS[u.weapon];
    if(!alive(u)||u.burningTurns||a.reload||!w.mag||w.thrown||(u.ammo[u.weapon]||0)>=w.mag||!(u.ammoPouch[u.weapon]>0))return false;
    a.manual=null;resetAim(a);a.reload={weapon:u.weapon,remaining:WEAPON_TIMING[u.weapon].reload};log(s,u.name+' reloading ('+a.reload.remaining+' s).');return true;
  }
  function requestShot(s,u,target,burst=false,zone='torso',aim='hip'){
    if(!ready(s,u)||u.team!=='squad'||!target||!Object.hasOwn(AIM_LEVELS,aim))return false;
    const preview=previewAttack(s,u,target,burst,zone,null,aim);if(!preview.ok)return false;
    const a=actor(s,u);a.manual={targetId:target.ground?null:target.id,point:target.ground?{...target}:null,burst,zone,aim};resetAim(a);return true;
  }
  function eligible(s,u,v,zone){
    return alive(v)&&v.team!==u.team&&canSee(s,u,v)&&(u.team!=='squad'||s.detected.has(v.id))&&distance(u,v)<=WEAPONS[u.weapon].range&&confirmedImpact(s,u,v,zone)?.unit?.id===v.id;
  }
  const threat=(u,v)=>WEAPONS[v.weapon].damage*(WEAPONS[v.weapon].pellets||1)/shotSeconds(v.weapon)/(1+distance(u,v)/Math.max(1,WEAPONS[v.weapon].range));
  function choose(s){
    const r=s.realtime,u=hero(s);if(!automaticWeapon(u.weapon))return null;
    const options=s.units.filter(v=>v.team==='guard'&&eligible(s,u,v,r.zone));
    const pinned=options.find(v=>v.id===r.pinnedId);if(pinned)return pinned;
    const value=v=>r.priority==='nearest'?distance(u,v):r.priority==='weakest'?v.hp:-threat(u,v);
    options.sort((a,b)=>value(a)-value(b)||distance(u,a)-distance(u,b)||a.id-b.id);
    const best=options[0],current=options.find(v=>v.id===r.targetId);
    if(!best||!current)return best||null;
    // Keep a valid target unless a new one improves the selected metric by 20%.
    const better=r.priority==='threat'?threat(u,best)>threat(u,current)*1.2:value(best)<value(current)*.8;
    return better?best:current;
  }
  function fire(s,u,target,aim,burst,zone,dt,effects){
    const a=actor(s,u),signature=[target.ground?JSON.stringify(target):target.id,u.weapon,aim,burst,zone].join('/');
    if(a.signature!==signature){a.signature=signature;a.targetId=target.id??null;a.aimRemaining=shotSeconds(u.weapon,aim,burst);}
    // Acquisition cannot overlap a reload or shorten the previous shot's recovery.
    if(!ready(s,u))return;
    a.aimRemaining=Math.max(0,a.aimRemaining-dt);if(a.aimRemaining>1e-7)return;
    const p=previewAttack(s,u,target,burst,zone,null,aim);if(!p.ok)return;
    if(attack(s,u,target,burst,u.team==='guard',zone,false,aim)){
      a.cooldown=shotSeconds(u.weapon,aim,burst);a.manual=null;a.aimRemaining=0;
      if(s.effect)effects.push(s.effect);
    }
  }
  function advanceActor(s,u,dt){
    const a=actor(s,u);if(a.weapon!==u.weapon)changedWeapon(s,u);
    a.cooldown=Math.max(0,a.cooldown-dt);a.repath=Math.max(0,a.repath-dt);
    if(a.reload){
      if(!alive(u)||u.burningTurns||a.reload.weapon!==u.weapon){a.reload=null;return;}
      a.reload.remaining=Math.max(0,a.reload.remaining-dt);
      if(a.reload.remaining<=1e-7){a.reload=null;completeReload(s,u);a.cooldown=Math.max(a.cooldown,.1);}
    }
  }
  function guard(s,g,dt,effects){
    const a=actor(s,g),u=hero(s);if(!alive(g)||g.burningTurns||!g.alert||!alive(u))return;
    const sees=canSee(s,g,u);if(sees){g.lastKnown={x:u.x,y:u.y};a.search=8;}
    const w=WEAPONS[g.weapon];
    if(w.mag&&!g.ammo[g.weapon]&&g.ammoPouch[g.weapon]>0&&!a.reload)reload(s,g);
    if(eligible(s,g,u,'torso')&&(g.ammo[g.weapon]>0||!w.mag)){
      a.route=[];fire(s,g,u,'hip',false,'torso',dt,effects);return;
    }
    resetAim(a);
    if(!g.lastKnown)return;
    if(distance(g,g.lastKnown)<1.2&&!sees){
      a.route=[];a.search-=dt;g.heading=(g.heading+dt*45)%360;
      if(a.search<=0){g.alert=false;g.lastKnown=null;a.search=8;log(s,g.name+' finished searching.');}return;
    }
    if(!a.repath){a.route=approachPath(s,g,g.lastKnown)||[];a.repath=.75+(g.id%3)*.1;}
    while(a.route.length&&distance(g,a.route[0])<.08)a.route.shift();
    const next=a.route[0];
    if(next){const d=distance(g,next),step=Math.min(d,7.2*dt);if(!travel(s,g,(next.x-g.x)/d*step,(next.y-g.y)/d*step,{enemy:true}))a.route=[];}
    else if(!sees){a.search-=dt;if(a.search<=0){g.alert=false;g.lastKnown=null;a.search=8;}}
  }
  function step(s,dt,input){
    const r=s.realtime,u=hero(s),effects=[];r.time+=dt;s.elapsed+=dt;
    for(const v of s.units){v.isMoving=false;advanceActor(s,v,dt);}
    if(!u.burningTurns)movePlayer(s,dt,input);
    refresh(s);if(!alive(u))return;
    const a=actor(s,u),w=WEAPONS[u.weapon];
    if(!u.burningTurns){
      if(w.mag&&!w.thrown&&!u.ammo[u.weapon]&&u.ammoPouch[u.weapon]>0&&!a.reload)reload(s,u);
      if(!r.suspended){
        const manual=a.manual,target=manual?(manual.point||s.units.find(v=>v.id===manual.targetId)):r.autoFire?choose(s):null;
        r.targetId=target?.id??null;
        if(target&&(target.ground||alive(target)))fire(s,u,target,manual?.aim??r.aim,manual?.burst??r.burst,manual?.zone??r.zone,dt,effects);
        else{resetAim(a);a.manual=null;}
      }else resetAim(a);
    }
    for(const g of s.units)if(g.team==='guard')guard(s,g,dt,effects);
    r.fireClock+=dt;
    if(r.fireClock>=3-1e-7){
      r.fireClock=Math.max(0,r.fireClock-3);s.round++;
      for(const v of s.units)fireRules.panicRun(s,v);
      fireRules.finishRound(s);
    }
    if(effects.length)s.effect={sequence:effects.flatMap(e=>e.sequence||[e])};
    refresh(s);
  }
  function status(s){const u=hero(s),a=actor(s,u),r=s.realtime;return {autoFire:r.autoFire,aim:r.aim,priority:r.priority,targetId:r.targetId,pinnedId:r.pinnedId,remaining:a.reload?.remaining??a.cooldown,reloading:!!a.reload,aimRemaining:a.aimRemaining,ammo:u.ammo[u.weapon]||0,reserve:u.ammoPouch[u.weapon]||0,kills:r.kills,automatic:automaticWeapon(u.weapon),weapon:u.weapon};}
  return {enable,actor,ready,busy,configure,pin,changedWeapon,reload,requestShot,choose,step,status};
}
