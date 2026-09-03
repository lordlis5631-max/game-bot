import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, formatDeltas, newGameState } from '../src/game/engine.js';
import { SCENARIO_COUNT } from '../src/game/scenarioBank.js';

test('regular scenario library has the actual 468 generated scenarios',()=>{
  assert.equal(SCENARIO_COUNT,468);
});

test('refusing the vape at age 18 does not remove money or create debt',()=>{
  const state=newGameState();
  Object.assign(state,{age:18,money:10000,debt:0,profession:null});
  const event=currentEvent(state);
  assert.equal(event.id,'vape-offer');
  assert.match(event.title,/вейп/i);
  assert.match(event.text,/личные границы|вредн/i);

  const outcome=applyChoice(state,event,0);
  assert.equal(state.money,10000);
  assert.equal(state.debt,0);

  const explanation=formatDeltas(outcome.deltas);
  assert.match(explanation,/Последствия твоего решения/);
  assert.match(explanation,/Здоровье: \+2/);
  assert.match(explanation,/Профессия ещё не выбрана/);
  assert.doesNotMatch(explanation,/Новый долг/);
});

test('vape choice explains direct spending separately from long-term consequences',()=>{
  const state=newGameState();
  Object.assign(state,{age:18,money:10000,debt:0,profession:null});
  const event=currentEvent(state);
  const outcome=applyChoice(state,event,3);
  const explanation=formatDeltas(outcome.deltas);

  assert.match(explanation,/Деньги: -3[\s\u00A0]?000/);
  assert.match(explanation,/прямые расходы на вейп/i);
  assert.match(explanation,/Риск зависимости: \+8/);
  assert.match(explanation,/Долгосрочные последствия/);
});

test('when spending exceeds cash the game explicitly explains why debt appears',()=>{
  const state=newGameState();
  Object.assign(state,{age:17,money:10000,debt:0});
  const event={
    id:'test-expense',
    title:'Большая покупка',
    text:'Тестовое событие',
    choices:[{text:'Купить',effects:{money:-50000},result:'Ты оплатил покупку.'}],
  };
  state.currentEventId=event.id;
  const outcome=applyChoice(state,event,0);

  assert.equal(state.money,0);
  assert.equal(state.debt,40000);
  assert.match(formatDeltas(outcome.deltas),/Новый долг: \+40[\s\u00A0]?000 ₽/);
  assert.match(formatDeltas(outcome.deltas),/расходы превысили доступные деньги/i);
});
