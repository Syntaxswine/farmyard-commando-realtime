import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Core,createSoloGame,decodeSave,encodeSave,hero} from '../dist/solo-game.js';
import {searchHaloCandidates} from '../dist/search-halo.js';
import {app} from './app-harness.mjs';

const action=(app,text)=>app.el('overlay-actions').children.find(button=>button.textContent.startsWith(text));

const realtimeSave = 'farmyard-realtime:tactical-animal-operation-v2';
const hasHalo = (a, id) => searchHaloCandidates(a.s).some(object => object.id === id);
const singleTake = a => a.el('overlay-actions').children.find(button =>
  button.textContent.startsWith('Take ') && !button.textContent.startsWith('Take all'));

function nearBoth() {
  const state = createSoloGame();
  Object.assign(hero(state), {x: 6.2, y: 23.3});
  Core.refresh(state, {forceFog: true});
  return state;
}

test('Take all clears the chest hand and halo immediately and saves the empty chest', () => {
  const a = app({realTime: true, initialState: createSoloGame()});
  const before = {ap: a.u.ap, dressings: a.s.solo.dressings, grenades: a.u.ammo.grenade ?? 0};
  assert.equal(a.el('interaction-hand').hidden, false);
  assert.equal(a.el('interaction-label').textContent, 'Open');
  assert.ok(hasHalo(a, 'supply-chest'));

  a.el('interaction-hand').click();
  assert.equal(a.el('overlay').open, true);
  action(a, 'Take all').click();

  assert.equal(a.s.solo.dressings, before.dressings + 1);
  assert.equal(a.u.ammo.grenade, before.grenades + 1);
  assert.equal(a.u.ap, before.ap);
  assert.equal(a.el('overlay').open, false);
  assert.equal(a.el('interaction-hand').hidden, true);
  assert.equal(hasHalo(a, 'supply-chest'), false);
  assert.ok(!Core.nearbyInteractions(a.s).some(object => object.id === 'supply-chest'));
  assert.equal(Core.previewInteraction(a.s, 'supply-chest', 'loot').ok, false);
  const restored = decodeSave(a.saved.get(realtimeSave));
  assert.deepEqual(restored.interactables.find(object => object.kind === 'chest').inventory, []);
});

test('a partial body pickup keeps its halo and hand until the last item frees focus for the chest', () => {
  const a = app({realTime: true, initialState: nearBoth()});
  a.view.options.onPick({interactionId: 'body:4'});
  assert.equal(a.el('interaction-label').textContent, 'Search');
  assert.ok(hasHalo(a, 'body:4'));

  a.el('interaction-hand').click();
  singleTake(a).click();
  assert.equal(a.el('overlay').open, true);
  assert.ok(hasHalo(a, 'body:4'));
  action(a, 'Return to operation').click();
  a.advance(1, 0);
  assert.equal(a.el('interaction-hand').hidden, false);
  assert.equal(a.el('interaction-label').textContent, 'Loot');
  assert.match(a.el('interaction-hand')['aria-label'], /fallen guard/);

  a.el('interaction-hand').click();
  singleTake(a).click();
  assert.equal(a.el('overlay').open, false);
  assert.equal(hasHalo(a, 'body:4'), false);
  assert.ok(!Core.nearbyInteractions(a.s).some(object => object.id === 'body:4'));
  assert.equal(a.el('interaction-hand').hidden, false);
  assert.match(a.el('interaction-hand')['aria-label'], /Open Supply chest/);
  assert.ok(hasHalo(a, 'supply-chest'));
});

test('resuming an older save with empty loot leaves both objects present without a hand or halo', () => {
  const state = nearBoth();
  for (const object of state.interactables) {
    if (object.kind === 'chest' || object.kind === 'body') object.inventory = [];
  }
  Core.enableRealtime(state);
  const preferences = {version: 1, campaignId: 'first-shift', selectedMissionId: state.solo.missionId};
  const a = app({realTime: true, autoDeploy: false, initialStorage: [
    [realtimeSave, encodeSave(state)],
    ['farmyard-realtime:tactical-animal-first-shift-v1', JSON.stringify(preferences)],
  ]});
  a.el('resume').click();
  assert.ok(a.s, 'the old operation resumes');
  assert.equal(a.el('interaction-hand').hidden, true);
  for (const id of ['supply-chest', 'body:4']) {
    assert.deepEqual(Core.interactionObjects(a.s).find(object => object.id === id).inventory, []);
    assert.equal(hasHalo(a, id), false);
    assert.ok(!Core.nearbyInteractions(a.s).some(object => object.id === id));
  }
});

test('an opted-in chest still opens and closes after its final transfer', () => {
  const state = createSoloGame();
  const chest = state.interactables.find(object => object.kind === 'chest');
  chest.allowEmptyInteraction = true;
  const a = app({realTime: true, initialState: state});
  a.el('interaction-hand').click();
  action(a, 'Take all').click();
  assert.equal(a.el('overlay').open, true);
  assert.equal(action(a, 'Take all').disabled, true);
  assert.equal(hasHalo(a, chest.id), false);

  action(a, 'Close chest').click();
  assert.equal(chest.open, false);
  assert.equal(a.el('interaction-hand').hidden, false);
  assert.equal(a.el('interaction-label').textContent, 'Open');
  a.el('interaction-hand').click();
  assert.equal(a.el('overlay').open, true);
  assert.equal(action(a, 'Take all').disabled, true);
  assert.deepEqual(chest.inventory, []);
  const restored = decodeSave(a.saved.get(realtimeSave));
  assert.equal(restored.interactables.find(object => object.id === chest.id).allowEmptyInteraction, true);
});

test('opening hand choices is free, and activating a costly action with insufficient AP spends nothing',()=>{
  const a=app();a.s.engaged=true;a.s.phase='player';a.u.ap=1;a.advance(3);
  a.el('interaction-hand').fire('keydown',{key:'ArrowDown'});assert.equal(a.el('overlay').open,true);assert.equal(a.u.ap,1);
  assert.equal(action(a,'Open').disabled,true);action(a,'Return to operation').click();a.el('interaction-hand').click();assert.equal(a.u.ap,1);
  assert.equal(a.s.interactables.find(object=>object.kind==='chest').open,false);
});

test('the hand hides during grenade aim and guard turns, and returns without changing inventory',()=>{
  const a=app();assert.equal(a.el('interaction-hand').hidden,false);
  a.el('grenade').click();assert.equal(a.el('interaction-hand').hidden,true);a.el('cancel-grenade').click();assert.equal(a.el('interaction-hand').hidden,false);
  a.s.phase='player';Core.endTurn(a.s);a.advance(3);assert.equal(a.el('interaction-hand').hidden,true);
});

test('tapping a nearby body changes stable focus without looting it or equipping hands',()=>{
  const a=app(),weapon=a.u.weapon;a.u.x=6.2;a.u.y=23.3;a.advance(3);
  a.view.options.onPick({interactionId:'body:4'});assert.equal(a.el('interaction-label').textContent,'Search');assert.equal(a.u.weapon,weapon);
  a.advance(3);assert.match(a.el('interaction-hand')['aria-label'],/fallen guard/);
  assert.equal(a.s.interactables.find(object=>object.id==='body:4').searched,false);
});
