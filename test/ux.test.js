import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyChoice, currentEvent, formatCompactOutcome, formatDeltas, formatFinanceLog,
  newGameState,
} from '../src/game/engine.js';
import { decorateChoiceCosts, hydrateEventReasons } from '../src/game/explanations.js';
import { SCENARIO_BANK } from '../src/game/scenarioBank.js';
import { normalizeInstitution } from '../src/institutions.js';

test('rendered choices expose direct money cost and attach a reason for every direct effect',()=>{
  const state=newGameState();
  const event=currentEvent(state);
  assert.match(event.choices[0].text,/💸\s*5[\s\u00A0]?000\s*₽/);
  for (const choice of event.choices) {
    for (const [key,value] of Object.entries(choice.effects||{})) {
      if (!Number(value)) continue;
      assert.ok(choice.reasons?.[key],`${event.id}:${choice.text}:${key} must have a reason`);
    }
  }
});

test('all generated scenarios become self-explaining and expose direct money before selection',()=>{
  for (const raw of SCENARIO_BANK) {
    const event=decorateChoiceCosts(hydrateEventReasons(raw));
    for (const choice of event.choices) {
      for (const [key,value] of Object.entries(choice.effects||{})) {
        if (!Number(value)) continue;
        assert.ok(choice.reasons?.[key],`${event.id}:${choice.text}:${key} must have a reason`);
      }
      if (Number(choice.effects?.money||0)!==0) {
        assert.match(choice.text,/₽/,`${event.id}:${choice.text} must show direct money before choice`);
      }
    }
  }
});

test('time and energy are resolved inside the engine, not by the bot layer',()=>{
  const state=newGameState();
  Object.assign(state,{age:32,profession:'it',career:8,activeProject:{id:'digital_product',title:'Цифровой продукт',emoji:'💻',progress:20,status:'active',startedAge:26,lastActionAge:30},energy:70});
  const event=currentEvent(state);
  const outcome=applyChoice(state,event,0);
  assert.ok(outcome.deltas.details.timeEnergy);
  assert.ok(Number.isFinite(state.energy));
  assert.match(formatDeltas(outcome.deltas),/Энергия и время года/);
});

test('probability displayed on a button equals the probability actually resolved',()=>{
  const state=newGameState();
  Object.assign(state,{seed:777,age:28,profession:'game_dev',specialization:'game_programming',career:3,skills:65,reputation:55,socialCapital:50,financialLiteracy:45,entrepreneurship:40,risk:49,money:250000,activeProject:{id:'indie_game',title:'Инди-игра',emoji:'🎮',progress:20,status:'active',startedAge:26,lastActionAge:26}});
  const event=currentEvent(state);
  const index=3;
  const match=event.choices[index].text.match(/🎲\s*(\d+)%/);
  assert.ok(match,'choice must show probability');
  const outcome=applyChoice(state,event,index);
  assert.equal(outcome.deltas.details.chance.chance,Number(match[1]));
});

test('quick mode skips quiet years but preserves key early milestones',()=>{
  const state=newGameState({mode:'quick'});
  state.age=22;
  Object.assign(state,{profession:'game_dev',careerFamily:'creative',career:2});
  const event=currentEvent(state);
  assert.match(event.id,/specialization-game_dev-22/);
  const outcome=applyChoice(state,event,0);
  assert.equal(state.age,24);
  assert.equal(outcome.yearsElapsed,2);
  assert.match(formatCompactOutcome(outcome),/Прошло 2 года/);
});

test('years without automatic economy do not produce a technical economy paragraph',()=>{
  const state=newGameState();
  const event=currentEvent(state);
  const outcome=applyChoice(state,event,1);
  assert.doesNotMatch(formatDeltas(outcome.deltas),/Профессия ещё не выбрана|Экономика года/i);
});

test('money operations are kept in a readable finance log',()=>{
  const state=newGameState();
  const event=currentEvent(state);
  applyChoice(state,event,0);
  const log=formatFinanceLog(state,6);
  assert.match(log,/5[\s\u00A0]?000 ₽/);
  assert.match(log,/учебные материалы|подготовк|пробные/i);
});

test('common institution aliases collapse into one leaderboard key',()=>{
  assert.equal(normalizeInstitution('УГНТУ').key,'ugntu');
  assert.equal(normalizeInstitution('Уфимский нефтяной университет').key,'ugntu');
  assert.equal(normalizeInstitution('БГПУ им. Акмуллы').key,'bgpu');
  assert.equal(normalizeInstitution('не учусь').key,'not_studying');
});
