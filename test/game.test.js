import test from 'node:test';
import assert from 'node:assert/strict';
import { applyChoice, currentEvent, formatState, newGameState } from '../src/game/engine.js';
import { scoreGame } from '../src/game/scoring.js';
import { SCENARIO_BANK, SCENARIO_COUNT, STORY_EVENT_COUNT } from '../src/game/scenarioBank.js';
import { CAREERS, CAREER_LINE_EVENT_COUNT, estimateAnnualIncome } from '../src/game/careers.js';
import { CAREER_RANKS, careerMove, careerProgress, careerTitle } from '../src/game/careerTitles.js';

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
  assert.ok(state.profession,'a full run must establish a profession');
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

test('career system contains ten Bashkortostan-oriented profession tracks and forty dedicated career events',()=>{
  assert.equal(Object.keys(CAREERS).length,10);
  assert.equal(CAREER_LINE_EVENT_COUNT,40);
  for (const [key,career] of Object.entries(CAREERS)) {
    assert.ok(career.label.length>3,`${key} must have a label`);
    assert.ok(career.baseMonthly>0,`${key} must have income settings`);
  }
});

test('career family selection leads to a concrete profession',()=>{
  const state=newGameState();
  state.age=19;
  let event=currentEvent(state);
  assert.equal(event.id,'career-family-19');
  applyChoice(state,event,0);
  assert.equal(state.careerFamily,'creative');
  assert.equal(state.age,20);

  event=currentEvent(state);
  assert.equal(event.choices.length,4);
  applyChoice(state,event,0);
  assert.equal(state.profession,'game_dev');
  assert.equal(state.age,21);
});

test('all ten professions are reachable through the four career families',()=>{
  const reachable=new Set();
  for (const family of ['creative','industry','social','enterprise']) {
    const state=newGameState();
    state.age=20;
    state.careerFamily=family;
    const event=currentEvent(state);
    assert.equal(event.choices.length,4);
    for (const choice of event.choices) reachable.add(choice.set?.profession);
  }
  for (const key of Object.keys(CAREERS)) assert.ok(reachable.has(key),`${key} must be reachable`);
});

test('profession changes yearly income',()=>{
  const state=newGameState();
  Object.assign(state,{age:30,career:5,skills:60,entrepreneurship:40,reputation:50});
  state.profession='it';
  const itIncome=estimateAnnualIncome(state);
  state.profession='pedagogy';
  const pedagogyIncome=estimateAnnualIncome(state);
  assert.ok(itIncome>pedagogyIncome,'different careers must use different income curves');
});

test('profession-specific event replaces generic scenario on career years',()=>{
  const state=newGameState();
  Object.assign(state,{age:22,profession:'engineering',careerFamily:'industry'});
  const event=currentEvent(state);
  assert.equal(event.id,'career-engineering-22');
  assert.equal(event.choices.length,4);
  assert.match(event.title,/чертеж|издел/i);
});

test('every profession has a complete seven-step job title ladder',()=>{
  assert.deepEqual(Object.keys(CAREER_RANKS).sort(),Object.keys(CAREERS).sort());
  for (const [key,ranks] of Object.entries(CAREER_RANKS)) {
    assert.equal(ranks.length,7,`${key} must have seven career ranks`);
    assert.equal(ranks[0].level,0);
    assert.equal(ranks.at(-1).level,10);
    for (let i=1;i<ranks.length;i++) {
      assert.ok(ranks[i].level>ranks[i-1].level,`${key} ranks must increase`);
      assert.ok(ranks[i].title.length>4,`${key} rank must have a title`);
    }
  }
});

test('game development and pedagogy expose concrete titles instead of an abstract career number',()=>{
  const state=newGameState();
  Object.assign(state,{profession:'game_dev',career:1});
  assert.equal(careerTitle(state),'Стажёр игровой команды');
  state.career=4;
  assert.equal(careerTitle(state),'Middle-разработчик игр');
  state.career=8;
  assert.equal(careerTitle(state),'Lead игровой команды');
  state.career=10;
  assert.equal(careerTitle(state),'Продюсер / креативный директор');

  Object.assign(state,{profession:'pedagogy',career:1});
  assert.equal(careerTitle(state),'Молодой педагог');
  state.career=4;
  assert.equal(careerTitle(state),'Ведущий педагог');
  state.career=6;
  assert.equal(careerTitle(state),'Методист / педагог-наставник');
  state.career=10;
  assert.equal(careerTitle(state),'Руководитель образовательного направления');
});

test('career progress shows the next concrete position and distance to promotion',()=>{
  const state=newGameState();
  Object.assign(state,{profession:'engineering',career:4});
  const progress=careerProgress(state);
  assert.equal(progress.currentTitle,'Ведущий инженер');
  assert.equal(progress.nextTitle,'Старший инженер / ведущий конструктор');
  assert.equal(progress.levelsToNext,2);
  assert.equal(progress.maxed,false);
});

test('career movement detects a promotion and formatted player state shows the job title',()=>{
  const before=newGameState();
  Object.assign(before,{profession:'it',career:3});
  const after=structuredClone(before);
  after.career=4;
  const move=careerMove(before,after);
  assert.equal(move.kind,'promotion');
  assert.equal(move.from,'Junior IT-специалист');
  assert.equal(move.to,'Middle IT-специалист');
  assert.match(formatState(after),/🏷 Должность: Middle IT-специалист/);
  assert.match(formatState(after),/Следующая ступень: Senior IT-специалист/);
});
