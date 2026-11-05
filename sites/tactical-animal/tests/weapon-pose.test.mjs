import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {ANIMAL_MOTION_CATALOG} from '../dist/aft/tactics/animal-motion-catalog.js';
import {createWeaponModel} from '../dist/aft/tactics/weapon-models.js';
import {createWorkerLocomotion} from '../dist/aft/tactics/worker-locomotion.js';
import {createBattlePosture} from '../dist/aft/tactics/battle-posture.js';
import {createWeaponPose} from '../dist/weapon-pose.js';
import {V,Q,weaponGrip} from '../dist/weapon-pose-rig.js';

function sheepRig(weapon){
  const profile=ANIMAL_MOTION_CATALOG.find(p=>p.id==='sheep');
  const data=JSON.parse(fs.readFileSync(new URL('../dist/aft/tactics/'+profile.file,import.meta.url)));
  const worker=profile.create(data),gun=createWeaponModel(weapon);
  worker.equipWeapon(gun);
  const gait=createWorkerLocomotion(worker,profile),posture=createBattlePosture(worker,profile);
  const action=createWeaponPose(worker,profile),bones=Object.fromEntries(worker.bones.map(b=>[b.name,b]));
  return {gun,action,bones,prepare(sample){
    gait.apply({...sample,blend:0});posture.apply(sample);action.crawl(sample);posture.ground();
  },dispose(){gait.dispose();gun.dispose();worker.dispose();}};
}

test('prone HMG keeps the carry handle in the support hand and the bipod clear through a crawling shot',()=>{
  const rig=sheepRig('hmg'),{gun,action,bones}=rig;
  const sample={x:0,y:0,heading:45,stance:'prone',weapon:'hmg',pose:{prone:1,kneel:0},blend:1,distance:.37};
  const target=V(8,1.08,0);
  try{
    for(const amount of [.42,1]){
      rig.prepare(sample);
      const supportHeights=['hips','hoof-1','hoof1'].map(name=>bones[name].getWorldPosition(V()).y);
      const fit=action.apply(sample,{target,amount,age:0,active:amount===1});
      assert.ok(fit.supported,fit.reason);
      if(amount===1)assert.ok(fit.direction.angleTo(target.clone().sub(fit.origin))<.0005);
      for(const [i,name] of ['hips','hoof-1','hoof1'].entries()){
        assert.ok(Math.abs(supportHeights[i]-bones[name].getWorldPosition(V()).y)<1e-8);
      }
      for(const [side,name] of [[-1,'support'],[1,'grip']]){
        const {palm}=weaponGrip(gun,name,gun.root.getWorldQuaternion(Q()));
        assert.ok(bones['hand'+side].localToWorld(palm).distanceTo(gun.anchors[name].getWorldPosition(V()))<.0001);
      }
      for(const part of gun.parts.filter(part=>part.name==='bipod foot')){
        const positions=part.geometry.attributes.position;
        for(let i=0;i<positions.count;i++)assert.ok(part.localToWorld(V().fromBufferAttribute(positions,i)).y>=0);
      }
    }
  }finally{rig.dispose();}
});

test('a point-blank prone TT-33 fits a compact grip with the target ahead of the muzzle',()=>{
  const rig=sheepRig('pistol');
  try{
    const sample={x:0,y:0,heading:25,stance:'prone',weapon:'pistol',pose:{prone:1,kneel:0},blend:.75,distance:.38};
    rig.prepare(sample);
    const target=V(.60,.30,0),fit=rig.action.apply(sample,{target,amount:1,active:true,age:0});
    assert.ok(fit.supported,fit.reason);
    assert.ok(fit.angularError<.0005,fit.angularError);
  }finally{rig.dispose();}
});
