import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, newGameState } from '../src/game/engine.js';
import { scoreGame } from '../src/game/scoring.js';

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
