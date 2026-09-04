import test from 'node:test';
import assert from 'node:assert/strict';
import { chanceForState } from '../src/game/chanceChecks.js';
import {
  applyTimeAndEnergy, decorateTimeChoices, energyPreviewForState,
  estimateActionTime, timeCapacityForState,
} from '../src/game/energy.js';

test('every choice receives a visible time cost',()=>{
  const state={energy:75,profession:'it',career:3,npcs:{}};
  const event={id:'test',choices:[
    {text:'Отдохнуть',effects:{stress:-6,health:5}},
    {text:'Сделать сложный проект',effects:{skills:8,career:2,stress:8}},
  ]};
  const decorated=decorateTimeChoices(event,state);
  assert.match(decorated.choices[0].text,/⏱ 1/);
  assert.match(decorated.choices[1].text,/⏱ 3/);
});

test('work, project and close relationships consume annual time',()=>{
  const state={
    energy:75,profession:'it',career:4,activeProject:{id:'x'},
    npcs:{a:{score:80},b:{score:75}},
  };
  const preview=energyPreviewForState(state);
  assert.equal(preview.capacity,4);
  assert.equal(preview.commitments,3);
  assert.equal(preview.free,1);
});

test('overcommitment reduces energy and increases stress',()=>{
  const before={
    energy:70,stress:20,happiness:60,health:80,profession:'it',career:8,
    activeProject:{id:'x'},npcs:{a:{score:80},b:{score:80}},
  };
  const state=structuredClone(before);
  const choice={text:'Сложный рывок',effects:{skills:8,career:2,stress:8}};
  assert.equal(estimateActionTime(choice),3);
  const result=applyTimeAndEnergy(state,choice,before);
  assert.ok(result.overload>0);
  assert.ok(state.energy<before.energy);
  assert.ok(result.stressDelta>0);
});

test('rest with spare time can restore energy',()=>{
  const before={energy:45,stress:55,happiness:50,health:60,career:0,npcs:{}};
  const state=structuredClone(before);
  const result=applyTimeAndEnergy(state,{text:'Взять паузу',effects:{stress:-8,health:6,happiness:7}},before);
  assert.equal(result.overload,0);
  assert.ok(state.energy>before.energy);
});

test('low energy reduces available time and probability of risky actions',()=>{
  const fresh={energy:80,stress:20,health:80,skills:60};
  const tired={...fresh,energy:15};
  assert.equal(timeCapacityForState(fresh),4);
  assert.equal(timeCapacityForState(tired),2);
  const check={base:50,weights:{skills:0.2}};
  assert.ok(chanceForState(fresh,check)>chanceForState(tired,check));
});
