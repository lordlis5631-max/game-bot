import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, formatDeltas, newGameState } from '../src/game/engine.js';
import { SCENARIO_COUNT } from '../src/game/scenarioBank.js';

test('regular scenario library has the actual 468 generated scenarios',()=>{
  assert.equal(SCENARIO_COUNT,468);
});

test('university preparation explains exactly why money and stress change',()=>{
  const state=newGameState();
  Object.assign(state,{age:16,money:10000,debt:0});
  const event=currentEvent(state);
  assert.equal(event.id,'school-finish');
  assert.match(event.text,/материал|пробн|занят/i);

  const outcome=applyChoice(state,event,0);
  assert.equal(state.money,5000);
  assert.equal(state.debt,0);
  const explanation=formatDeltas(outcome.deltas);

  assert.match(outcome.result,/5[\s\u00A0]?000 ₽/);
  assert.match(explanation,/Деньги: -5[\s\u00A0]?000/);
  assert.match(explanation,/учебные материалы|пробные тесты/i);
  assert.match(explanation,/Стресс: \+4/);
  assert.match(explanation,/дополнительн|нагрузк/i);
  assert.match(explanation,/Навыки: \+8/);
  assert.doesNotMatch(explanation,/Деньги: -5[\s\u00A0]?000.*Ты вложился в подготовку/i);
});

test('refusing the vape at age 18 does not remove money or create debt',()=>{
  const state=newGameState();
  Object.assign(state,{age:18,money:10000,debt:0,profession:null});
  const event=currentEvent(state);
  assert.equal(event.id,'vape-offer');
  assert.match(event.title,/вейп/i);
  assert.match(event.text,/бесплатно|денег.*не платишь/i);

  const outcome=applyChoice(state,event,0);
  assert.equal(state.money,10000);
  assert.equal(state.debt,0);

  const explanation=formatDeltas(outcome.deltas);
  assert.match(explanation,/Почему изменились показатели/);
  assert.match(explanation,/Здоровье: \+2/);
  assert.match(explanation,/Профессия ещё не выбрана/);
  assert.doesNotMatch(explanation,/Новый долг/);
});

test('trying a freely offered vape does not invent a purchase or immediate long-term charge',()=>{
  const state=newGameState();
  Object.assign(state,{age:18,money:10000,debt:0,profession:null});
  const event=currentEvent(state);
  const outcome=applyChoice(state,event,3);
  const explanation=formatDeltas(outcome.deltas);

  assert.equal(state.money,10000);
  assert.equal(state.debt,0);
  assert.equal(state.addiction,8);
  assert.match(outcome.result,/Денег это не стоило/i);
  assert.match(explanation,/Риск зависимости: \+8/);
  assert.doesNotMatch(explanation,/Деньги: -3[\s\u00A0]?000/);
  assert.doesNotMatch(explanation,/Закрепившаяся привычка/);
  assert.doesNotMatch(explanation,/Новый долг/);
});

test('a one-time vape episode decays on later turns instead of immediately charging money',()=>{
  const state=newGameState();
  Object.assign(state,{age:17,money:10000,debt:0,profession:null,addiction:8});
  const event={
    id:'test-next-year',
    title:'Обычный год',
    text:'Нейтральное событие',
    choices:[{text:'Продолжить свои дела',effects:{skills:1},result:'Год прошёл спокойно.'}],
  };
  state.currentEventId=event.id;
  const outcome=applyChoice(state,event,0);
  const explanation=formatDeltas(outcome.deltas);

  assert.equal(state.money,10000);
  assert.equal(state.addiction,6);
  assert.match(explanation,/Риск привычки: -2/);
  assert.match(explanation,/не закрепилась/i);
});

test('generic direct spending states that the selected action required money',()=>{
  const state=newGameState();
  Object.assign(state,{age:17,money:10000,debt:0});
  const event={
    id:'test-expense-reason',
    title:'Покупка',
    text:'Тестовое событие',
    choices:[{text:'Купить оборудование',effects:{money:-5000,skills:2},result:'Ты купил оборудование.'}],
  };
  state.currentEventId=event.id;
  const outcome=applyChoice(state,event,0);
  const explanation=formatDeltas(outcome.deltas);

  assert.match(explanation,/Деньги: -5[\s\u00A0]?000/);
  assert.match(explanation,/прямые расходы/i);
  assert.match(explanation,/Купить оборудование/i);
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
  assert.match(formatDeltas(outcome.deltas),/превысили доступные деньги/i);
});
