import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, formatDeltas, formatState, newGameState } from '../src/game/engine.js';
import { chanceForState } from '../src/game/chanceChecks.js';
import { achievementsFor, scoreGame } from '../src/game/scoring.js';

test('age 17 introduces Artem and stores a persistent friendship',()=>{
  const state=newGameState();
  state.age=17;
  const event=currentEvent(state);
  assert.equal(event.id,'npc-artem-intro-17');
  assert.equal(event.choices.length,4);
  const outcome=applyChoice(state,event,0);
  assert.equal(state.npcs.artem.name,'Артём');
  assert.equal(state.npcs.artem.role,'друг');
  assert.ok(state.npcs.artem.score>=50);
  assert.match(formatDeltas(outcome.deltas),/Артём/);
  assert.match(formatState(state),/Люди рядом:.*Артём/);
});

test('internship event introduces mentor Irina without consuming a separate year',()=>{
  const state=newGameState();
  Object.assign(state,{age:21,profession:'it',careerFamily:'creative',career:1});
  const event=currentEvent(state);
  assert.equal(event.id,'internship-choice');
  assert.match(event.title,/Ирин/);
  applyChoice(state,event,0);
  assert.equal(state.npcs.irina.name,'Ирина');
  assert.equal(state.npcs.irina.role,'наставник');
  assert.ok(state.npcs.irina.score>=50);
});

test('age 31 can create a close relationship with Sasha',()=>{
  const state=newGameState();
  Object.assign(state,{age:31,profession:'game_dev',specialization:'game_design',career:4,money:500000});
  const event=currentEvent(state);
  assert.equal(event.id,'npc-sasha-intro-31');
  applyChoice(state,event,0);
  assert.equal(state.npcs.sasha.name,'Саша');
  assert.equal(state.npcs.sasha.status,'close');
  assert.ok(state.npcs.sasha.score>=55);
});

test('age 34 creates colleague relationship that can become ally or rival',()=>{
  const ally=newGameState();
  Object.assign(ally,{age:34,profession:'engineering',specialization:'cad',career:4});
  let event=currentEvent(ally);
  assert.equal(event.id,'npc-kirill-intro-34');
  applyChoice(ally,event,0);
  assert.equal(ally.npcs.kirill.status,'ally');

  const rival=newGameState();
  Object.assign(rival,{age:34,profession:'engineering',specialization:'cad',career:4});
  event=currentEvent(rival);
  applyChoice(rival,event,3);
  assert.equal(rival.npcs.kirill.status,'rival');
  assert.ok(rival.npcs.kirill.score<ally.npcs.kirill.score);
});

test('trusted NPC support changes the real probability of a risky choice',()=>{
  const weak=newGameState();
  Object.assign(weak,{skills:60,career:4,reputation:55,npcs:{irina:{id:'irina',score:20}}});
  const strong=structuredClone(weak);
  strong.npcs.irina.score=90;
  const check={base:45,weights:{skills:0.2,career:1.2},npcSupportId:'irina'};
  assert.ok(chanceForState(strong,check)>chanceForState(weak,check));
});

test('Artem returns later and relationship affects a recurring risky story',()=>{
  const state=newGameState();
  Object.assign(state,{seed:55,age:37,profession:'game_dev',specialization:'game_programming',career:5,skills:70,entrepreneurship:50,socialCapital:60,npcs:{artem:{id:'artem',name:'Артём',emoji:'🤝',role:'друг',score:80,status:'friend'}}});
  const event=currentEvent(state);
  assert.equal(event.id,'npc-artem-project-37');
  assert.match(event.title,/Артём/);
  assert.match(event.choices[0].text,/🎲 \d+%/);
  const outcome=applyChoice(state,event,0);
  assert.match(formatDeltas(outcome.deltas),/Проверка шанса/);
  assert.match(formatDeltas(outcome.deltas),/Отношения с людьми/);
});

test('several durable relationships contribute to achievements and score',()=>{
  const state=newGameState();
  state.npcs={
    artem:{id:'artem',score:80,status:'friend'},
    irina:{id:'irina',score:75,status:'mentor'},
    sasha:{id:'sasha',score:90,status:'close'},
  };
  const withPeople=scoreGame(state);
  assert.ok(achievementsFor(state).includes('🤝 Крепкий круг'));
  assert.ok(achievementsFor(state).includes('❤️ Связь на годы'));
  state.npcs={};
  assert.ok(withPeople>scoreGame(state));
});
