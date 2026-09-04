import { eventForState } from './events.js';
import { scoreGame } from './scoring.js';
import { careerLabel, estimateAnnualIncome } from './careers.js';
import { careerMove, careerProgress, careerTitle } from './careerTitles.js';
import { applySpecializationIncome, specializationLabel } from './specializations.js';
import { chanceForState, resolveChance } from './chanceChecks.js';
import { evaluateGoal, goalProgressText, goalSelectionForState, startGoal } from './goals.js';
import { applyProjectAction, projectEventForState, projectProgressText, projectSelectionForState } from './projects.js';
import { applyNpcChoice, decorateNpcEvent, ensureNpcState, npcEventForState, npcSummaryText } from './npcs.js';
import { decorateChoiceCosts, hydrateEventReasons, clarifyEventContent } from './explanations.js';
import { applyTimeAndEnergy, decorateTimeChoices, formatTimeEnergyOutcome, timeEnergySummary } from './energy.js';

const STAT_KEYS = ['health','happiness','skills','reputation','relationships','stress','financialLiteracy','socialCapital','entrepreneurship','addiction','risk'];
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));
const RESERVED_PROJECT_AGES = new Set([16,18,19,20,21,22,23,25,27,29,30,35,38,40,41,45,49,50,54,55,59]);
export const QUICK_AGES=[16,17,18,19,20,21,22,24,26,31,35,40,45,50,55,59];

const DETAIL_LABELS = {
  money:'💰 Деньги', debt:'💳 Долг', health:'❤️ Здоровье', happiness:'😊 Счастье',
  skills:'🧠 Навыки', reputation:'👥 Репутация', career:'📈 Карьера', relationships:'🤝 Отношения',
  stress:'😰 Стресс', financialLiteracy:'📚 Финансовая грамотность', socialCapital:'🌐 Полезные связи',
  entrepreneurship:'🚀 Предпринимательский опыт', addiction:'⚠️ Риск привычки', risk:'🎲 Риск',
};

const formatSigned = (value) => `${value>0?'+':''}${Math.round(value).toLocaleString('ru-RU')}`;
const rub = (value) => `${Math.round(Number(value)||0).toLocaleString('ru-RU')} ₽`;

function gameMode(options={}) {
  const mode=typeof options==='string'?options:options?.mode;
  return mode==='quick'?'quick':'classic';
}

function habitStage(risk=0) {
  const value=Number(risk||0);
  if (value<=0) return 'none';
  if (value<20) return 'tried';
  if (value<40) return 'occasional';
  if (value<70) return 'regular';
  return 'dependent';
}

function ensureHabitState(state) {
  if (!state.habits || typeof state.habits!=='object') state.habits={};
  state.habits.vape={
    ...(state.habits.vape||{}),
    risk:Number(state.addiction||0),
    stage:habitStage(state.addiction),
  };
}

function appendFinance(state,entry) {
  if (!entry || !Number(entry.amount)) return;
  if (!Array.isArray(state.financeLog)) state.financeLog=[];
  state.financeLog.push({age:Number(entry.age??state.age),...entry,amount:Math.round(Number(entry.amount))});
  if (state.financeLog.length>40) state.financeLog=state.financeLog.slice(-40);
}

export function newGameState(options={}) {
  return {
    age:16,
    mode:gameMode(options),
    seed:Math.floor(Math.random()*100000),
    money:10000,
    debt:0,
    health:80,
    happiness:60,
    skills:10,
    reputation:10,
    career:0,
    profession:null,
    specialization:null,
    careerFamily:null,
    relationships:50,
    stress:10,
    financialLiteracy:10,
    socialCapital:10,
    entrepreneurship:5,
    addiction:0,
    risk:5,
    energy:75,
    activeGoal:null,
    goalHistory:[],
    goalsCompleted:0,
    activeProject:null,
    projectHistory:[],
    completedProjects:0,
    npcs:{},
    habits:{vape:{stage:'none',risk:0}},
    financeLog:[],
    lastTurn:null,
    flags:[],
    seenEvents:[],
    currentEventId:null,
  };
}

function normalize(state) {
  for (const key of STAT_KEYS) state[key]=clamp(Number(state[key]||0),0,100);
  state.energy=clamp(Number(state.energy??75),0,100);
  state.career=clamp(Number(state.career||0),0,10);
  state.mode=state.mode==='quick'?'quick':'classic';
  if (state.money<0) {
    state.debt+=Math.abs(state.money);
    state.money=0;
  }
  state.money=Math.round(state.money);
  state.debt=Math.max(0,Math.round(state.debt));
  state.goalsCompleted=Math.max(0,Number(state.goalsCompleted||0));
  state.completedProjects=Math.max(0,Number(state.completedProjects||0));
  state.flags=[...new Set(state.flags||[])];
  state.seenEvents=[...new Set(state.seenEvents||[])];
  state.goalHistory=Array.isArray(state.goalHistory)?state.goalHistory:[];
  state.projectHistory=Array.isArray(state.projectHistory)?state.projectHistory:[];
  state.financeLog=Array.isArray(state.financeLog)?state.financeLog:[];
  ensureNpcState(state);
  ensureHabitState(state);
  return state;
}

function applyEffects(state,effects={}) {
  for (const [key,value] of Object.entries(effects)) state[key]=Number(state[key]||0)+Number(value||0);
}

export function annualIncomeForState(state) {
  return applySpecializationIncome(state,estimateAnnualIncome(state));
}

function yearlyEconomy(state,age) {
  if (age<18 || !state.profession) return null;
  const income=annualIncomeForState(state);
  const fixedLivingCost=135000+Math.max(0,age-20)*7000;
  const variableLivingCost=Math.round(income*0.56);
  const netBeforeDebt=income-fixedLivingCost-variableLivingCost;
  state.money+=netBeforeDebt;

  let debtPayment=0;
  let debtInterest=0;
  if (state.debt>0) {
    debtPayment=Math.min(state.money>0?Math.round(state.money*0.12):0,state.debt);
    state.money-=debtPayment;
    state.debt-=debtPayment;
    const beforeInterest=state.debt;
    state.debt=Math.round(state.debt*1.03);
    debtInterest=state.debt-beforeInterest;
  }
  return {income,fixedLivingCost,variableLivingCost,netBeforeDebt,debtPayment,debtInterest};
}

function economyForPeriod(state,fromAge,toAge) {
  const total={applied:false,years:0,fromAge,toAge,income:0,fixedLivingCost:0,variableLivingCost:0,netBeforeDebt:0,debtPayment:0,debtInterest:0};
  for (let age=fromAge;age<toAge;age++) {
    const year=yearlyEconomy(state,age);
    if (!year) continue;
    total.applied=true;
    total.years+=1;
    for (const key of ['income','fixedLivingCost','variableLivingCost','netBeforeDebt','debtPayment','debtInterest']) total[key]+=Number(year[key]||0);
  }
  if (total.applied) {
    appendFinance(state,{age:fromAge,kind:'economy',amount:total.netBeforeDebt-total.debtPayment,reason:`Баланс работы и обычных расходов за ${total.years} г.`});
  }
  return total;
}

function persistentConsequences(state,before,yearsElapsed=1) {
  const notes=[];
  const previousAddiction=Number(before?.addiction||0);
  const stage=habitStage(previousAddiction);

  if (stage==='tried') {
    const decay=Math.min(Math.max(1,yearsElapsed*2),Number(state.addiction||0));
    if (decay>0) {
      state.addiction-=decay;
      notes.push(`⚠️ Риск повторения: -${decay}. Разовый эпизод не закрепился и со временем риск снижается.`);
    }
  } else if (stage==='occasional') {
    const moneyLoss=1500*yearsElapsed;
    state.money-=moneyLoss;
    state.addiction=Math.max(0,Number(state.addiction||0)-yearsElapsed);
    appendFinance(state,{age:before.age,kind:'habit',amount:-moneyLoss,reason:'Эпизодические расходы на привычку.'});
    notes.push(`⚠️ Эпизодическая привычка: -${moneyLoss.toLocaleString('ru-RU')} ₽ за период. Риск пока не стал регулярной зависимостью.`);
  } else if (stage==='regular' || stage==='dependent') {
    const multiplier=stage==='dependent'?2:1;
    const healthLoss=Math.max(1,Math.ceil(previousAddiction/30))*yearsElapsed;
    const moneyLoss=6000*multiplier*yearsElapsed;
    const stressGain=multiplier*yearsElapsed;
    state.health-=healthLoss;
    state.money-=moneyLoss;
    state.stress+=stressGain;
    appendFinance(state,{age:before.age,kind:'habit',amount:-moneyLoss,reason:'Регулярные расходы на закрепившуюся привычку.'});
    notes.push(`⚠️ ${stage==='dependent'?'Зависимость':'Регулярная привычка'}: -${healthLoss} здоровье, -${moneyLoss.toLocaleString('ru-RU')} ₽ и +${stressGain} стресс за период.`);
  }

  if (state.stress>=75) {
    state.health-=3;
    state.happiness-=4;
    notes.push('😰 Очень высокий стресс: -3 здоровье и -4 счастье — организм не успевает восстанавливаться.');
  } else if (state.stress>=55) {
    state.health-=1;
    state.happiness-=2;
    notes.push('😰 Повышенный стресс: -1 здоровье и -2 счастье — накопленная нагрузка влияет на самочувствие.');
  }
  if ((state.relationships||0)>=80) {
    state.stress-=1;
    notes.push('🤝 Сильные отношения: -1 стресс — поддержка близких помогает справляться с нагрузкой.');
  }
  if ((state.flags||[]).includes('emergency_fund')&&state.debt>0) {
    state.stress-=1;
    notes.push('🛟 Финансовая подушка: -1 стресс — запас снижает тревогу из-за долга.');
  }
  ensureHabitState(state);
  return notes;
}

function decorateChanceChoices(event,state) {
  if (!event?.choices?.some((choice)=>choice.check)) return event;
  return {
    ...event,
    choices:event.choices.map((choice)=>{
      if (!choice.check||choice.text.includes('🎲')) return choice;
      return {...choice,text:`${choice.text} · 🎲 ${chanceForState(state,choice.check)}%`};
    }),
  };
}

function dynamicEventForState(state) {
  const goal=goalSelectionForState(state);
  if (goal) return goal;
  const projectSelection=projectSelectionForState(state);
  if (projectSelection) return projectSelection;
  const npc=npcEventForState(state);
  if (npc) return npc;
  if (!RESERVED_PROJECT_AGES.has(Number(state.age))) {
    const project=projectEventForState(state);
    if (project) return project;
  }
  return null;
}

function directChoiceDetails(event,choice,choiceIndex) {
  return Object.entries(choice.effects||{})
    .filter(([,value])=>Number(value)!==0)
    .map(([key,value])=>({
      key,
      value:Number(value),
      label:DETAIL_LABELS[key]||key,
      reason:choice.reasons?.[key] || 'Прямое последствие выбранного действия.',
    }));
}

function effectLines(effects={},reason='Результат игрового события.') {
  return Object.entries(effects)
    .filter(([,value])=>Number(value)!==0)
    .map(([key,value])=>`${DETAIL_LABELS[key]||key}: ${formatSigned(Number(value))} — ${reason}`);
}

function nextAgeForState(state) {
  if (state.mode!=='quick') return Math.min(60,Number(state.age)+1);
  return QUICK_AGES.find((age)=>age>Number(state.age)) ?? 60;
}

export function currentEvent(state) {
  normalize(state);
  const base=dynamicEventForState(state)||eventForState(state);
  let event=clarifyEventContent(base);
  event=decorateNpcEvent(event,state);
  event=hydrateEventReasons(event);
  event=decorateChanceChoices(event,state);
  event=decorateChoiceCosts(event);
  event=decorateTimeChoices(event,state);
  state.currentEventId=event.id;
  return event;
}

export function applyChoice(state,event,choiceIndex) {
  normalize(state);
  if (!event||event.id!==state.currentEventId) throw new Error('This event is no longer active');
  const choice=event.choices[choiceIndex];
  if (!choice) throw new Error('Unknown choice');

  const before=structuredClone(state);
  const scoreBefore=scoreGame(before);
  const direct=directChoiceDetails(event,choice,choiceIndex);
  const chance=resolveChance(before,event.id,choiceIndex,choice.check);

  const directMoney=Number(choice.effects?.money||0);
  if (directMoney) appendFinance(state,{age:before.age,kind:'choice',amount:directMoney,reason:choice.reasons?.money||choice.result});
  applyEffects(state,choice.effects||{});
  if (chance) {
    applyEffects(state,chance.effects);
    if (Number(chance.effects?.money||0)) appendFinance(state,{age:before.age,kind:'chance',amount:Number(chance.effects.money),reason:chance.result});
  }

  if (choice.set) for (const [key,value] of Object.entries(choice.set)) state[key]=value;
  if (choice.addFlags) state.flags.push(...choice.addFlags);
  if (choice.removeFlags) state.flags=state.flags.filter((flag)=>!choice.removeFlags.includes(flag));

  const npc=applyNpcChoice(state,choice);
  const project=applyProjectAction(state,choice,chance);
  if (Number(project?.rewardEffects?.money||0)) appendFinance(state,{age:before.age,kind:'project',amount:Number(project.rewardEffects.money),reason:'Награда за завершённый проект.'});
  const goalStarted=choice.startGoal?startGoal(state,choice.startGoal):null;
  state.seenEvents.push(event.id);

  const nextAge=nextAgeForState(state);
  const yearsElapsed=Math.max(1,nextAge-before.age);
  const economy=economyForPeriod(state,before.age,nextAge);
  const persistent=persistentConsequences(state,before,yearsElapsed);
  const timeEnergy=applyTimeAndEnergy(state,choice,before);

  state.age=nextAge;
  state.currentEventId=null;
  const goalResolution=evaluateGoal(state);
  if (Number(goalResolution?.rewardEffects?.money||0)) appendFinance(state,{age:state.age,kind:'goal',amount:Number(goalResolution.rewardEffects.money),reason:'Награда за выполненную долгосрочную цель.'});

  const debtBeforeNormalize=Number(state.debt||0);
  const negativeCashBeforeNormalize=Math.max(0,-Number(state.money||0));
  normalize(state);
  const debtCreated=negativeCashBeforeNormalize>0?Math.max(0,Number(state.debt||0)-debtBeforeNormalize):0;
  if (debtCreated>0) appendFinance(state,{age:before.age,kind:'debt',amount:debtCreated,reason:'Расходы превысили доступные деньги и недостающая сумма стала долгом.'});

  const deltas=buildDeltas(before,state);
  deltas.details={direct,chance,npc,project,goalStarted,goalResolution,economy,persistent,timeEnergy,yearsElapsed,debtCreated};

  const result=chance?.result||choice.result;
  const score=scoreGame(state);
  const outcome={state,result,deltas,score,scoreBefore,scoreDelta:score-scoreBefore,finished:state.age>=60,ageBefore:before.age,yearsElapsed};
  state.lastTurn={result,deltas,score,scoreBefore,scoreDelta:score-scoreBefore,ageBefore:before.age,ageAfter:state.age,yearsElapsed};
  return outcome;
}

function buildDeltas(before,after) {
  const keys=['money','debt','health','happiness','skills','reputation','career','relationships','energy'];
  const changes=keys.map((key)=>({key,delta:Number(after[key]||0)-Number(before[key]||0)})).filter((item)=>item.delta!==0);
  const move=careerMove(before,after);
  if (move) changes.unshift({key:'careerTitle',delta:0,...move});
  return changes;
}

function formatCareerMoves(deltas) {
  return deltas.filter((change)=>change.key==='careerTitle').map((change)=>{
    if (change.kind==='start') return `🎯 Карьера началась: ${change.to}`;
    if (change.kind==='specialization') return `🧭 Специализация определена: ${change.to}`;
    if (change.kind==='promotion') return `🎉 Повышение: ${change.from} → ${change.to}`;
    return `🔁 Новая должность: ${change.from} → ${change.to}`;
  });
}

export function formatDeltas(deltas) {
  const details=deltas?.details;
  if (!details) return '';
  const sections=[];
  const careerMoves=formatCareerMoves(deltas);
  if (careerMoves.length) sections.push(careerMoves.join('\n'));
  if (details.goalStarted) sections.push(details.goalStarted);

  if (details.direct?.length) {
    sections.push(`🎯 Почему изменились показатели:\n${details.direct.map((item)=>`${item.label}: ${formatSigned(item.value)} — ${item.reason}`).join('\n')}`);
  }
  if (details.npc?.length) sections.push(`👥 Отношения с людьми:\n${details.npc.join('\n')}`);
  if (details.chance) {
    const status=details.chance.success?'✅ УСПЕХ':'❌ НЕУДАЧА';
    const lines=effectLines(details.chance.effects,details.chance.result);
    sections.push(`🎲 Проверка шанса: ${details.chance.chance}% · выпало ${details.chance.roll}/100 · ${status}\n${details.chance.result}${lines.length?`\n${lines.join('\n')}`:''}`);
  }
  if (details.project?.notes?.length) {
    const reward=effectLines(details.project.rewardEffects,'Награда за завершённый проект.');
    sections.push(`🛠 Проект:\n${details.project.notes.join('\n')}${reward.length?`\n${reward.join('\n')}`:''}`);
  }
  if (details.economy?.applied) {
    const e=details.economy;
    const period=e.years===1?'за год':`за ${e.years} года`;
    const lines=[
      `💵 Доход ${period}: +${rub(e.income)}`,
      `🏠 Базовые расходы: -${rub(e.fixedLivingCost)}`,
      `🧾 Повседневные расходы: -${rub(e.variableLivingCost)}`,
      `⚖️ Баланс до обслуживания долга: ${formatSigned(e.netBeforeDebt)} ₽`,
    ];
    if (e.debtPayment>0) lines.push(`💳 Погашение долга: -${rub(e.debtPayment)}`);
    if (e.debtInterest>0) lines.push(`📈 Проценты по долгу: +${rub(e.debtInterest)}`);
    sections.push(`💰 Денежный журнал периода:\n${lines.join('\n')}`);
  }
  if (details.persistent?.length) sections.push(`⏳ Последствия прошлых решений:\n${details.persistent.join('\n')}`);
  if (details.goalResolution) {
    const reward=effectLines(details.goalResolution.rewardEffects,'Награда за выполненную долгосрочную цель.');
    sections.push(`${details.goalResolution.text}${reward.length?`\n${reward.join('\n')}`:''}`);
  }
  if (details.timeEnergy) sections.push(formatTimeEnergyOutcome(details.timeEnergy));
  if (details.debtCreated>0) sections.push(`💳 Новый долг: +${rub(details.debtCreated)} — расходы превысили доступные деньги.`);
  return sections.join('\n\n');
}

export function formatCompactOutcome(outcome) {
  const details=outcome?.deltas?.details||{};
  const lines=[];
  for (const item of details.direct||[]) lines.push(`${item.label} ${formatSigned(item.value)} — ${item.reason}`);
  if (details.chance) lines.push(`🎲 ${details.chance.success?'Успех':'Неудача'}: ${details.chance.roll}/100 при шансе ${details.chance.chance}%.`);
  if (details.economy?.applied) lines.push(`💰 Баланс обычных доходов и расходов за период: ${formatSigned(details.economy.netBeforeDebt-details.economy.debtPayment)} ₽.`);
  if (details.timeEnergy?.overload>0) lines.push(`⚡ Перегрузка: энергия ${details.timeEnergy.energyBefore} → ${details.timeEnergy.energyAfter}.`);
  if (details.debtCreated>0) lines.push(`💳 Новый долг: +${rub(details.debtCreated)}.`);
  if (outcome?.yearsElapsed>1) lines.push(`⏩ Прошло ${outcome.yearsElapsed} года: ${outcome.ageBefore} → ${outcome.state.age}.`);
  lines.push(`⭐ Очки: ${outcome.scoreDelta>=0?'+':''}${outcome.scoreDelta} → ${outcome.score}`);
  return lines.join('\n');
}

export function formatLastTurnDetails(lastTurn) {
  if (!lastTurn) return 'Подробностей последнего хода пока нет.';
  return `📋 Подробности хода ${lastTurn.ageBefore} → ${lastTurn.ageAfter}\n\n${lastTurn.result}\n\n${formatDeltas(lastTurn.deltas)}\n\n⭐ Очки: ${lastTurn.scoreBefore} → ${lastTurn.score} (${lastTurn.scoreDelta>=0?'+':''}${lastTurn.scoreDelta})`;
}

export function formatHabitSummary(state) {
  ensureHabitState(state);
  const vape=state.habits.vape;
  const labels={none:'нет привычки',tried:'разовый эпизод',occasional:'эпизодическая',regular:'регулярная',dependent:'зависимость'};
  if (vape.stage==='none') return '🚭 Вредные привычки: не закрепились';
  return `🚭 Вейп: ${labels[vape.stage]} · риск ${Math.round(vape.risk)}/100`;
}

export function formatFinanceLog(state,limit=6) {
  const rows=(state.financeLog||[]).slice(-limit);
  if (!rows.length) return '💰 Денежный журнал: пока нет операций';
  return `💰 Последние денежные операции:\n${rows.map((row)=>`${row.amount>0?'+':''}${rub(row.amount)} — ${row.reason}`).join('\n')}`;
}

export function formatState(state,score=scoreGame(state)) {
  normalize(state);
  const profession=careerLabel(state);
  const specialization=state.specialization?`\n🧭 Специализация: ${specializationLabel(state)}`:'';
  const annualIncome=state.profession?`\n💵 Игровой доход: ${annualIncomeForState(state).toLocaleString('ru-RU')} ₽/год`:'';
  const title=state.profession?`\n🏷 Должность: ${careerTitle(state)}`:'';
  const progress=state.profession?careerProgress(state):null;
  const next=progress?.maxed?'\n🏆 Карьерная вершина достигнута':progress?.nextTitle?`\n🎯 Следующая ступень: ${progress.nextTitle} (ещё ${progress.levelsToNext} ур.)`:'';
  const goal=goalProgressText(state);
  const project=projectProgressText(state);
  const people=npcSummaryText(state);
  const dynamics=`${goal?`\n🎯 Цель: ${goal}`:''}${project?`\n🛠 Активный проект: ${project}`:''}${people?`\n👥 Люди рядом: ${people}`:''}${state.goalsCompleted||state.completedProjects?`\n🏅 Выполнено целей: ${state.goalsCompleted||0} · завершено проектов: ${state.completedProjects||0}`:''}`;
  const mode=state.mode==='quick'?'⚡ Быстрая жизнь':'🧭 Полная жизнь';
  return `👤 Возраст: ${state.age}\n🎮 Режим: ${mode}\n💰 Деньги: ${state.money.toLocaleString('ru-RU')} ₽\n💳 Долг: ${state.debt.toLocaleString('ru-RU')} ₽\n❤️ Здоровье: ${state.health}/100\n😊 Счастье: ${state.happiness}/100\n🧠 Навыки: ${state.skills}/100\n👥 Репутация: ${state.reputation}/100\n💼 Профессия: ${profession}${specialization}${title}\n📈 Карьерный уровень: ${state.career}/10${next}${annualIncome}${dynamics}\n🤝 Общие отношения: ${state.relationships}/100\n${timeEnergySummary(state)}\n${formatHabitSummary(state)}\n⭐ Текущие очки: ${score}`;
}
