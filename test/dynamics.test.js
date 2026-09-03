import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, formatDeltas, formatState, newGameState } from '../src/game/engine.js';
import { chanceForState, resolveChance } from '../src/game/chanceChecks.js';
import { evaluateGoal, startGoal } from '../src/game/goals.js';
import { applyProjectAction } from '../src/game/projects.js';
import { scoreGame } from '../src/game/scoring.js';

test('probability checks are deterministic and improve with relevant stats',()=>{
  const low=newGameState();
  Object.assign(low,{seed:42,age:28,skills:20,reputation:20,stress:20});
  const high=structuredClone(low);
  Object.assign(high,{skills:90,reputation:80});
  const check={base:50,weights:{skills:0.4,reputation:0.2},successEffects:{reputation:2},failureEffects:{stress:2}};
  assert.ok(chanceForState(high,check)>chanceForState(low,check));
  const first=resolveChance(high,'project-test',0,check);
  const second=resolveChance(high,'project-test',0,check);
  assert.deepEqual(first,second);
  assert.ok(first.roll>=1&&first.roll<=100);
});

test('age 24 offers a multi-year goal and player card shows it',()=>{
  const state=newGameState();
  Object.assign(state,{age:24,profession:'it',specialization:'backend',career:2,skills:55,money:120000});
  const event=currentEvent(state);
  assert.equal(event.id,'goal-selection-24');
  assert.equal(event.choices.length,4);
  applyChoice(state,event,0);
  assert.equal(state.activeGoal?.id,'finance');
  assert.match(formatState(state),/Цель:/);
  assert.match(formatState(state),/Финансовая подушка/);
});

test('completed long-term goal gives a persistent completion bonus',()=>{
  const state=newGameState();
  Object.assign(state,{age:24,money:100000,debt:0});
  startGoal(state,'finance');
  state.money=state.activeGoal.target.netWorth;
  state.age=26;
  const before=scoreGame(state);
  const resolution=evaluateGoal(state);
  assert.equal(resolution.status,'completed');
  assert.equal(state.goalsCompleted,1);
  assert.equal(state.activeGoal,null);
  assert.ok(scoreGame(state)>before);
});

test('age 26 starts a persistent project and age 28 produces a risky project checkpoint',()=>{
  const state=newGameState();
  Object.assign(state,{seed:777,age:26,profession:'game_dev',specialization:'game_programming',career:3,skills:65,reputation:55,socialCapital:50,financialLiteracy:45,entrepreneurship:40,money:250000});
  let event=currentEvent(state);
  assert.equal(event.id,'project-selection-26');
  assert.equal(event.choices.length,4);
  applyChoice(state,event,0);
  assert.equal(state.activeProject?.id,'indie_game');
  assert.equal(state.activeProject?.progress,0);

  state.age=28;
  state.currentEventId=null;
  event=currentEvent(state);
  assert.match(event.id,/^project-indie_game-28-/);
  assert.equal(event.choices.length,4);
  assert.ok(event.choices.every((choice)=>/🎲 \d+%/.test(choice.text)));
  const outcome=applyChoice(state,event,0);
  assert.ok((state.activeProject?.progress ?? 100)!==0);
  assert.match(formatDeltas(outcome.deltas),/Проверка шанса/);
  assert.match(formatDeltas(outcome.deltas),/Прогресс проекта/);
});

test('finishing a project records completion and rewards the player',()=>{
  const state=newGameState();
  Object.assign(state,{age:32,money:100000,reputation:20,skills:30,happiness:50,activeProject:{id:'indie_game',title:'Инди-игра',emoji:'🎮',progress:90,status:'active',startedAge:26,lastActionAge:30}});
  const beforeMoney=state.money;
  const outcome=applyProjectAction(state,{projectAction:{successProgress:20,failureProgress:0}},{success:true});
  assert.equal(state.activeProject,null);
  assert.equal(state.completedProjects,1);
  assert.equal(state.projectHistory.length,1);
  assert.ok(state.money>beforeMoney);
  assert.ok(outcome.notes.some((note)=>/завершён/.test(note)));
});

test('project checkpoints do not replace major milestone events',()=>{
  const state=newGameState();
  Object.assign(state,{age:30,profession:'it',specialization:'backend',career:4,activeProject:{id:'digital_product',title:'Цифровой продукт',emoji:'💻',progress:40,status:'active',startedAge:26,lastActionAge:28}});
  const event=currentEvent(state);
  assert.equal(event.id,'housing');
});
