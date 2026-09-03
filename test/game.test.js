import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, newGameState } from '../src/game/engine.js';
import { scoreGame } from '../src/game/scoring.js';
import { SCENARIO_BANK, SCENARIO_COUNT, STORY_EVENT_COUNT } from '../src/game/scenarioBank.js';

test('a turn advances exactly one year',()=>{
  const state=newGameState();
  const event=currentEvent(state);
  const result=applyChoice(state,event,0);
  assert.equal(state.age,17);
  assert.equal(result.finished,false);
});

test('game finishes at age 60',()=>{
  const state=newGameState();
  state.age=59;
  const event=currentEvent(state);
  const result=applyChoice(state,event,0);
  assert.equal(state.age,60);
  assert.equal(result.finished,true);
});

test('score is bounded from 0 to 10000',()=>{
  const state=newGameState();
  assert.ok(scoreGame(state)>=0);
  Object.assign(state,{money:999999999,health:100,happiness:100,skills:100,reputation:100,career:10,relationships:100,financialLiteracy:100,socialCapital:100,entrepreneurship:100,stress:0,addiction:0});
  assert.ok(scoreGame(state)<=10000);
});

test('expanded library contains 300 to 500 regular scenarios',()=>{
  assert.ok(SCENARIO_COUNT >= 300, `expected at least 300 scenarios, got ${SCENARIO_COUNT}`);
  assert.ok(SCENARIO_COUNT <= 500, `expected no more than 500 scenarios, got ${SCENARIO_COUNT}`);
  assert.ok(STORY_EVENT_COUNT >= 10, `expected linked story events, got ${STORY_EVENT_COUNT}`);
});

test('every regular scenario has four meaningful choices',()=>{
  for (const event of SCENARIO_BANK) {
    assert.equal(event.choices.length,4,`${event.id} must contain 4 choices`);
    assert.ok(event.title.length>3);
    assert.ok(event.text.length>20);
    assert.ok(event.minAge<=event.maxAge);
    for (const choice of event.choices) {
      assert.ok(choice.text.length>2,`${event.id} has an empty choice`);
      assert.ok(choice.result.length>5,`${event.id} has an empty result`);
    }
  }
});

test('one complete life produces a valid four-choice event every year without repeating event ids',()=>{
  const state=newGameState();
  state.seed=4242;
  const ids=[];
  while(state.age<60){
    const event=currentEvent(state);
    assert.equal(event.choices.length,4,`age ${state.age} must have 4 choices`);
    ids.push(event.id);
    applyChoice(state,event,0);
  }
  assert.equal(ids.length,44);
  assert.equal(new Set(ids).size,ids.length,'a single run should not repeat event ids');
});

test('harmful habit has persistent yearly consequences',()=>{
  const state=newGameState();
  state.age=26;
  state.addiction=56;
  state.money=100000;
  const event=currentEvent(state);
  const beforeHealth=state.health;
  applyChoice(state,event,0);
  assert.ok(state.health < beforeHealth + 20,'persistent addiction should affect health each year');
});
