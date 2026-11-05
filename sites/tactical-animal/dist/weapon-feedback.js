import * as T from './aft/tactics/vendor/three.module.js';
import {visibleShotSegments} from './aft/tactics/battle-shot-effects.js';
import {BattleAudio} from './designer/a20b343a0234/tactics/battle-audio.js';
import {GUN_SOUND} from './designer/a20b343a0234/tactics/battle-sound-data.js';

const V=(x=0,y=0,z=0)=>new T.Vector3(x,y,z);
const clipIds=[...new Set(Object.values(GUN_SOUND)),'shotgun-pump','explosion-large','explosion-deep','flame-ignite','melee-swing'];
const urls=Object.fromEntries(clipIds.map(id=>[id,new URL('./assets/audio/weapon-sfx/'+id+'.wav',import.meta.url).href]));
export const GRENADE_IMPACT_MS=500;
export const ballistic=weapon=>Object.hasOwn(GUN_SOUND,weapon)||weapon==='rpg'||weapon==='launcher';

export function createWeaponAudio(){
  return new BattleAudio({urls,target:null,volume:.55});
}

export function playWeaponSound(audio,event,state,delay=0){
  if(!audio||!state||globalThis.document?.hidden)return;
  const origin={x:event.ax,y:event.ay};
  if(event.weapon==='grenade'||event.weapon==='rpg'||event.weapon==='launcher'){
    const thrown=event.weapon==='grenade';
    audio.play(thrown?'explosion-large':'explosion-deep',{x:event.bx,y:event.by},state,{delay:thrown?GRENADE_IMPACT_MS/1000:0,priority:2,range:64});
    return;
  }
  const clip=GUN_SOUND[event.weapon]||(event.weapon==='flamethrower'?'flame-ignite':'melee-swing');
  audio.play(clip,origin,state,{delay,range:clip==='melee-swing'?8:48});
  if(event.weapon==='shotgun')audio.play('shotgun-pump',origin,state,{delay:.35,priority:.5,range:18});
}

export function tracerMesh(weapon){
  const color=weapon==='rpg'||weapon==='launcher'?0xffae58:0xffdf90;
  const beam=new T.Mesh(new T.BufferGeometry(),new T.MeshBasicMaterial({
    color,side:T.DoubleSide,transparent:true,depthWrite:false,toneMapped:false
  }));
  beam.name='Weapon tracer';
  return beam;
}

export function traceEnd(event){
  const end=event.traceEnd??{x:event.bx,y:event.by,h:event.bh??.9};
  return V(end.x,end.h,end.y);
}

export function traceStart(event,muzzle,end){
  const start=V(event.ax,event.ah??1.1,event.ay);
  const direction=end.clone().sub(start),distance=direction.length();
  if(!distance)return start;
  if(event.sourceVisible===false)return start.addScaledVector(direction,Math.min(.9/distance,1));
  if(muzzle&&muzzle.distanceToSquared(start)<1.8&&muzzle.clone().sub(start).dot(direction)<distance*distance)return muzzle;
  return start;
}

// Crossed world-space ribbons remain legible on mobile GPUs where line width
// is fixed to one pixel. Reuse AFT's fog clipping before filling the ribbons.
export function setTracer(beam,start,end,state){
  start.shotLevel=end.shotLevel=0;
  const points=state?.visible?visibleShotSegments(state,[start,end]):[start,end];
  const positions=[];
  for(let i=0;i<points.length;i+=2){
    const a=points[i];let b=points[i+1];
    while(points[i+2]?.equals(b)){i+=2;b=points[i+1];}
    const direction=b.clone().sub(a).normalize();
    const side=V().crossVectors(direction,Math.abs(direction.y)>.95?V(1,0,0):V(0,1,0)).normalize().multiplyScalar(.044);
    for(const offset of [side,V().crossVectors(direction,side)]){
      const p=a.clone().add(offset),q=a.clone().sub(offset),r=b.clone().sub(offset),s=b.clone().add(offset);
      positions.push(...p.toArray(),...q.toArray(),...r.toArray(),...p.toArray(),...r.toArray(),...s.toArray());
    }
  }
  beam.geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  beam.geometry.computeBoundingSphere();
  return positions.length>0;
}

export function muzzleFlash(origin,end){
  const flash=new T.Mesh(new T.IcosahedronGeometry(1,0),new T.MeshBasicMaterial({
    color:0xffefa8,transparent:true,depthWrite:false,toneMapped:false
  }));
  flash.name='Weapon muzzle flash';
  flash.position.copy(origin);
  flash.scale.set(.19,.105,.105);
  flash.quaternion.setFromUnitVectors(V(1,0,0),end.clone().sub(origin).normalize());
  return flash;
}

export function applyDischargePose(actor,sample,event,age){
  const gun=actor.equipment,weapon=event.weapon,throwing=weapon==='grenade';
  const decay=Math.max(0,1-age/(throwing?340:220));
  const kick=decay*decay;
  if(ballistic(weapon)&&actor.rifle&&gun.anchors.stock&&gun.anchors.support&&!sample.pose.prone&&!sample.blend){
    const target=traceEnd(event).sub(V(sample.x,0,sample.y));
    if(actor.rifle.apply({aim:.95*decay,recoil:2.2*kick,target,sample}).supported)return 'AFT rifle';
  }

  // A joint overlay keeps the running legs planted on their normal gait. Carry
  // the equipped mesh with the same joint delta to retain the authored grip.
  const oneHanded=throwing||!gun.anchors.support;
  const joint=oneHanded?actor.firingArm:actor.firingSpine;
  if(!joint)return null;
  const carry=gun.root.visible&&!throwing&&gun.root.parent;
  const before=carry?joint.matrixWorld.clone().invert().multiply(gun.root.matrixWorld):null;
  if(throwing)joint.rotateZ(-.92*Math.sin(Math.PI*decay));
  else if(ballistic(weapon))joint.rotateZ((oneHanded?.58:.19)*kick);
  else{joint.rotateZ(.67*kick);joint.rotateY(-.45*decay);}
  actor.worker.root.updateMatrixWorld(true);
  if(before){
    const transform=carry.matrixWorld.clone().invert().multiply(joint.matrixWorld).multiply(before);
    transform.decompose(gun.root.position,gun.root.quaternion,gun.root.scale);
  }
  return throwing?'throw':ballistic(weapon)?'recoil':'melee';
}
