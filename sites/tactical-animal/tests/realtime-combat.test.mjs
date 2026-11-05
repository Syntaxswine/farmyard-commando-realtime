import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Core,ANIMALS,createSoloGame,DEFAULT_BUILD,FIRST_REALTIME_MISSION,MISSIONS,hero,tick,encodeSave,decodeSave,lineClear,walkSegment} from '../dist/solo-game.js';
import {windowReviewSource,WINDOW_REVIEW_ID} from '../dist/window-review-map.js';
import {shotSeconds,WEAPON_TIMING} from '../dist/realtime-combat.js';
import {loadTownTour} from '../dist/mount-dora-entry.js';
import {getTourWorld} from '../dist/mount-dora-activity.js';
import {readTourProgress} from '../dist/mount-dora-progress.js';
import {app} from './app-harness.mjs';

// Declared synthetic editor document; every command runs through the production adapter/Core.
function fixture({primary='assault',guards=[{x:28,y:25}],crate=false,door=false}={}){
 const source=windowReviewSource();source.edges=door?{'e:20:25':'door-wood-closed'}:{};source.farmyardWindows.instances=[];
 source.guards=guards.map((g,i)=>({name:'Target '+i,species:'pig-foreman',weapon:'pistol',heading:0,...g}));
 if(crate)source.terrain[25][27]='crate';
 const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,primary,utility:'grenade'},1,WINDOW_REVIEW_ID,{authoredMap:source}));
 for(const u of s.units){u.hp=u.maxHp=10000;}hero(s).stats.firearms=hero(s).stats.dexterity=100;if(crate){s.units[1].stance='kneeling';Core.refresh(s);}
 return s;
}
function advance(s,seconds,input=null,step=.05){for(let t=0;t<seconds-1e-8;t+=step)tick(s,Math.min(step,seconds-t),input);}
function action(a,label){const b=a.el('overlay-actions').children.find(b=>b.textContent.startsWith(label));assert(b,label);return b;}

test('full inherited operations coexist with an initially unengaged real-time encounter',()=>{
 assert.equal(MISSIONS.length,3);
 const s=Core.enableRealtime(createSoloGame(DEFAULT_BUILD,1,FIRST_REALTIME_MISSION.id));
 assert.equal(s.phase,'explore');assert.equal(s.realtime.autoFire,false);assert.equal(s.units.filter(v=>v.team==='guard'&&v.hp>0).length,2);
 assert(s.interactables.some(o=>o.kind==='door'));assert(s.interactables.some(o=>o.kind==='chest'));assert(s.units.filter(v=>v.team==='guard'&&v.hp>0).every(v=>!v.alert));
});
test('the introductory encounter can be completed legally with automatic combat, collection and extraction',()=>{
 const s=Core.enableRealtime(createSoloGame({...DEFAULT_BUILD,animal:ANIMALS.find(a=>a.name==='Yakov').id},1947,FIRST_REALTIME_MISSION.id));
 Core.configureRealtime(s,{autoFire:true,aim:'aimed'});
 function go(x,y){assert(Core.move(s,hero(s),x,y));for(let i=0;i<2000&&s.queue.length;i++){tick(s,.05);assert.notEqual(s.solo.status,'lost');}assert(Math.hypot(hero(s).x-x,hero(s).y-y)<.1);}
 go(19,23);go(19,13.5);for(let i=0;i<200&&s.realtime.kills<1;i++)tick(s,.05);assert(s.realtime.kills>0);go(24,13.5);go(30,14);go(31,6);
 assert(Core.performInteraction(s,FIRST_REALTIME_MISSION.objective.id,'collect').ok);go(30,14);go(19,13.5);go(19,23);go(5,24);assert(Core.performInteraction(s,'extraction','extract').ok);assert.equal(s.solo.status,'extracted');assert(hero(s).hp>0);assert(hero(s).ammo.assault<30);
});
test('continuous movement spends neither AP nor stamina, including during contact',()=>{
 const s=fixture(),u=hero(s),ap=u.ap,stamina=u.stamina;advance(s,.5,{x:0,y:1});
 assert(Math.abs(u.y-32.2)<1e-7);assert.equal(u.ap,ap);assert.equal(u.stamina,stamina);assert.notEqual(s.phase,'enemy');assert.equal(Core.endTurn(s),false);
});
test('posture controls base speed and sneak halves every posture',()=>{
 const s=fixture(),u=hero(s);for(const [stance,speed]of [['standing',14.4],['kneeling',7.2],['prone',3.6]]){
 Core.setStance(s,u,stance);Core.setMovementMode(s,u,'run');assert.equal(Core.movementSpeed(u),speed);Core.setMovementMode(s,u,'sneak');assert.equal(Core.movementSpeed(u),speed/2);}
});
test('hold fire preserves ammunition even with an eligible opponent',()=>{
 const s=fixture(),u=hero(s);assert(Core.realtimeTarget(s));advance(s,1);assert.equal(u.ammo.assault,30);assert.equal(s.realtime.targetId,null);
});
test('nearest, weakest, threat and explicit pin choose among clear visible hostiles',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:28,y:29},{x:31,y:21,weapon:'hmg'}]});s.units[2].hp=50;
 assert.equal(Core.realtimeTarget(s).id,1);Core.configureRealtime(s,{priority:'weakest'});assert.equal(Core.realtimeTarget(s).id,2);
 Core.configureRealtime(s,{priority:'threat'});assert.equal(Core.realtimeTarget(s).id,3);assert(Core.pinRealtimeTarget(s,1));assert.equal(Core.realtimeTarget(s).id,1);
});
test('a nearer alternative does not cause rapid target oscillation',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:27,y:29}]});s.realtime.targetId=1;assert.equal(Core.realtimeTarget(s).id,1);s.units[2].x=24;Core.refresh(s);assert.equal(Core.realtimeTarget(s).id,2);
});
test('visible targets behind solid crate cover are rejected by the real projectile query',()=>{
 const s=fixture({crate:true}),u=hero(s),g=s.units[1];assert(Core.canSee(s,u,g));assert.equal(Core.previewAttack(s,u,g).ok,false);assert.match(Core.previewAttack(s,u,g).reason,/cover/);
 assert.equal(Core.realtimeTarget(s),null);Core.configureRealtime(s,{autoFire:true});advance(s,1);assert.equal(u.ammo.assault,30);
});
test('real time cannot acquire invisible or out-of-range targets',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];g.x=50;Core.refresh(s);assert.equal(Core.realtimeTarget(s),null);g.x=28;u.heading=180;Core.refresh(s);assert.equal(Core.realtimeTarget(s),null);
});
test('aim adds proportional acquisition and shot intervals without per-shot selection',()=>{
 for(const aim of ['hip','aimed','full']){
  const s=fixture(),u=hero(s),seconds=shotSeconds(u.weapon,aim);Core.configureRealtime(s,{autoFire:true,aim});advance(s,seconds-.05);assert.equal(u.ammo.assault,30,aim+' first delay');advance(s,.05);assert.equal(u.ammo.assault,29,aim+' first shot');advance(s,seconds);assert.equal(u.ammo.assault,28,aim+' next shot');
 }
});
test('frame partitions preserve shot count and the simulation does not catch up unlimited wall time',()=>{
 const a=fixture(),b=fixture();Core.configureRealtime(a,{autoFire:true});Core.configureRealtime(b,{autoFire:true});advance(a,1,null,.02);advance(b,1,null,.05);assert.equal(hero(a).ammo.assault,hero(b).ammo.assault);
 const elapsed=a.elapsed;tick(a,30);assert(Math.abs(a.elapsed-elapsed-1)<1e-6);
});
test('changing aim cannot bypass recovery from a committed shot',()=>{
 const s=fixture(),u=hero(s);Core.configureRealtime(s,{autoFire:true});advance(s,.5);assert.equal(u.ammo.assault,29);
 Core.configureRealtime(s,{aim:'full'});Core.configureRealtime(s,{aim:'hip'});advance(s,.45);assert.equal(u.ammo.assault,29);
});
test('manual firearm shots are acquired over time and use the production impact and ammo path',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];assert(Core.attack(s,u,g,false,false,'torso',false,'full'));assert.equal(u.ammo.assault,30);advance(s,.95);assert.equal(u.ammo.assault,30);advance(s,.05);assert.equal(u.ammo.assault,29);assert(g.hp<10000);assert(s.effect.sequence.some(e=>e.shooter===u.id));
});
test('empty magazines start real reloads, permit movement and consume reserve only on completion',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=0;const reserve=u.ammoPouch.assault;tick(s,.05);assert(Core.realtimeStatus(s).reloading);assert.equal(u.ammo.assault,0);assert.equal(u.ammoPouch.assault,reserve);
 const y=u.y;advance(s,.5,{x:0,y:1});assert(u.y>y);assert.equal(u.ammo.assault,0);advance(s,WEAPON_TIMING.assault.reload-.5);assert.equal(u.ammo.assault,30);assert.equal(u.ammoPouch.assault,reserve-30);
});
test('an early reload transfers only missing rounds and a weapon swap cancels without wasting reserve',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=20;const reserve=u.ammoPouch.assault;assert(Core.reload(s,u));advance(s,1);assert(Core.equip(s,u,'pistol'));assert.equal(u.ammoPouch.assault,reserve);assert.equal(u.ammo.assault,20);
 advance(s,.6);Core.equip(s,u,'assault');assert(Core.reload(s,u));advance(s,2.4);assert.equal(u.ammo.assault,30);assert.equal(u.ammoPouch.assault,reserve-10);
});
test('no reserve means no automatic refill, and explosives never fire automatically',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=0;u.ammoPouch.assault=0;Core.configureRealtime(s,{autoFire:true});advance(s,3);assert.equal(u.ammo.assault,0);assert.equal(Core.realtimeStatus(s).reloading,false);
 const r=fixture({primary:'rpg'});Core.configureRealtime(r,{autoFire:true});advance(r,3);assert.equal(hero(r).ammo.rpg,1);
});
test('continuous guards fire and reload on the same clock without stopping player movement',()=>{
 const s=fixture(),u=hero(s),g=s.units[1];g.heading=180;g.ammo.pistol=1;Core.refresh(s);advance(s,.7);assert.equal(g.ammo.pistol,0);assert(s.effect.sequence.some(e=>e.shooter===g.id));advance(s,.1);assert(s.realtime.actors[g.id].reload);advance(s,1.85);assert(g.ammo.pistol>0);assert.notEqual(s.phase,'enemy');
});
test('save and resume retain reload, aim, target preference, resources and acquired skill XP',()=>{
 const s=fixture(),u=hero(s);u.ammo.assault=12;Core.configureRealtime(s,{autoFire:true,aim:'full',priority:'weakest'});Core.reload(s,u);advance(s,.7);
 const copy=decodeSave(encodeSave(s));assert.equal(copy.realtime.aim,'full');assert.equal(copy.realtime.priority,'weakest');assert(Math.abs(copy.realtime.actors[0].reload.remaining-1.7)<1e-7);assert.equal(hero(copy).ammo.assault,12);advance(copy,1.7);assert.equal(hero(copy).ammo.assault,30);
});
test('unsupported real-time save timers and target data are rejected',()=>{
 const s=fixture(),raw=JSON.parse(encodeSave(s));raw.realtime.actors[0].cooldown=-1;assert.throws(()=>decodeSave(JSON.stringify(raw)),/real-time/);
 raw.realtime.actors[0].cooldown=0;raw.realtime.pinnedId=999;assert.throws(()=>decodeSave(JSON.stringify(raw)),/real-time/);
});
test('opening editor doors changes the same movement/sight collision and persists in real time',()=>{
 const s=fixture({guards:[],door:true}),u=hero(s),door=s.interactables.find(o=>o.kind==='door');assert(!walkSegment(s,u,{x:21,y:25},u.id));assert(!lineClear(s,u,{x:21,y:25}));
 assert(Core.performInteraction(s,door.id,'open').ok);assert(walkSegment(s,u,{x:21,y:25},u.id));assert(lineClear(s,u,{x:21,y:25}));const copy=decodeSave(encodeSave(s));assert(copy.interactables.find(o=>o.id===door.id).open);
});
test('grenades and flamethrowers keep production resources, effects and timed recovery',()=>{
 const s=fixture(),u=hero(s);assert(Core.throwGrenade(s,u,{x:20,y:17}));assert.equal(u.ammo.grenade,2);assert(s.effect.sequence.some(e=>e.weapon==='grenade'));assert.equal(Core.throwGrenade(s,u,{x:20,y:17}),false);
 const f=fixture({primary:'flamethrower'}),v=hero(f);assert(Core.fireFlame(f,v,270));assert.equal(v.ammo.flamethrower,3);assert(f.effect.sequence[0].flame);assert.equal(Core.fireFlame(f,v,270),false);
});
test('burning follows the inherited three panic stages on real-time seconds, including resume',()=>{
 const s=fixture(),u=hero(s);assert(Core.ignite(s,u));advance(s,3);assert.equal(u.burningTurns,2);const copy=decodeSave(encodeSave(s));advance(copy,6);assert.equal(hero(copy).hp,0);assert.equal(copy.solo.status,'lost');assert(hero(copy).burnedRemains);
});
test('sneak opening damage is larger, but toggling sneak against an aware target grants no bonus',()=>{
 const quiet=fixture(),loud=fixture();for(const s of [quiet,loud])Core.setMovementMode(s,hero(s),'sneak');loud.units[1].alert=true;
 for(const s of [quiet,loud]){Core.configureRealtime(s,{autoFire:true});advance(s,.5);}
 assert(quiet.units[1].hp<loud.units[1].hp);assert.equal(10000-quiet.units[1].hp,37);assert.equal(10000-loud.units[1].hp,24);
});
test('real kills award weapon XP once, improve skill, and survive resuming the operation',()=>{
 const s=fixture({guards:[{x:28,y:25},{x:29,y:28},{x:29,y:22}]}),u=hero(s);u.stats.firearms=50;const before=u.stats.firearms;Core.configureRealtime(s,{autoFire:true});for(const g of s.units.filter(v=>v.team==='guard'))g.hp=1;
 for(let i=0;i<300&&s.realtime.kills<3;i++)tick(s,.05);
 assert.equal(s.realtime.kills,3);assert.equal(u.stats.firearms,before+1);advance(s,1);assert.equal(s.realtime.kills,3);assert.equal(decodeSave(encodeSave(s)).realtime.kills,3);
});
test('real application controls toggle fire, persist aim, pause with menus/background and isolate turn-based saves',()=>{
 const old='unchanged-turn-based-save',s=fixture(),a=app({realTime:true,initialState:s,initialStorage:[['tactical-animal-operation-v2',old]]});
 a.el('end-turn').click();assert(s.realtime.autoFire);a.el('realtime-aim').click();assert.equal(s.realtime.aim,'aimed');a.key(' ');assert.equal(s.realtime.autoFire,false);
 a.el('menu').click();const elapsed=s.elapsed;a.advance(20);assert.equal(s.elapsed,elapsed);action(a,'Continue operation').click();a.visibility(true);a.advance(20);assert.equal(s.elapsed,elapsed);a.visibility(false);a.advance(2);assert(s.elapsed>elapsed);
 assert.equal(a.saved.get('tactical-animal-operation-v2'),old);assert(a.saved.has('farmyard-realtime:tactical-animal-operation-v2'));
});
test('a corrupt career cannot prevent the actual operation from saving',()=>{
 const a=app({realTime:true,initialState:fixture(),initialStorage:[['farmyard-realtime:careers-v1','invalid']]});
 assert(a.saved.has('farmyard-realtime:tactical-animal-operation-v2'));assert.match(a.el('toast').textContent,/character progression/);
});
test('Mount Dora keeps the real-time scheduler, resources and reload checkpoint in its streamed save',async()=>{
 const projectURL=new URL('../../../maps/mount-dora/project.json',import.meta.url),fetcher=async url=>new Response(fs.readFileSync(url));
 const s=Core.enableRealtime(await loadTownTour({build:{...DEFAULT_BUILD,utility:'grenade'},fetcher,projectURL}));let copy;
 try{hero(s).ammo.assault=7;Core.reload(s,hero(s));advance(s,.6);copy=await loadTownTour({progress:readTourProgress(encodeSave(s)),fetcher,projectURL});assert.equal(hero(copy).ammo.assault,7);assert(copy.realtime.actors[0].reload);advance(copy,1.8);assert.equal(hero(copy).ammo.assault,30);}finally{getTourWorld(s).dispose();if(copy)getTourWorld(copy).dispose();}
});
