import { eventForState } from './events.js';
import { scoreGame } from './scoring.js';
import { careerLabel, estimateAnnualIncome } from './careers.js';
import { careerMove, careerProgress, careerTitle } from './careerTitles.js';
import { applySpecializationIncome, specializationLabel } from './specializations.js';

const STAT_KEYS = ['health','happiness','skills','reputation','relationships','stress','financialLiteracy','socialCapital','entrepreneurship','addiction','risk'];
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

const DETAIL_LABELS = {
  money:'💰 Деньги',
  debt:'💳 Долг',
  health:'❤️ Здоровье',
  happiness:'😊 Счастье',
  skills:'🧠 Навыки',
  reputation:'👥 Репутация',
  career:'📈 Карьера',
  relationships:'🤝 Отношения',
  stress:'😰 Стресс',
  financialLiteracy:'📚 Финансовая грамотность',
  socialCapital:'🌐 Полезные связи',
  entrepreneurship:'🚀 Предпринимательский опыт',
  addiction:'⚠️ Риск зависимости',
  risk:'🎲 Риск',
};

const formatSigned = (value) => `${value>0?'+':''}${Math.round(value).toLocaleString('ru-RU')}`;

export function newGameState() {
  return {
    age: 16,
    seed: Math.floor(Math.random()*100000),
    money: 10000,
    debt: 0,
    health: 80,
    happiness: 60,
    skills: 10,
    reputation: 10,
    career: 0,
    profession: null,
    specialization: null,
    careerFamily: null,
    relationships: 50,
    stress: 10,
    financialLiteracy: 10,
    socialCapital: 10,
    entrepreneurship: 5,
    addiction: 0,
    risk: 5,
    flags: [],
    seenEvents: [],
    currentEventId: null,
  };
}

function normalize(state) {
  for (const key of STAT_KEYS) state[key] = clamp(Number(state[key] || 0),0,100);
  state.career = clamp(Number(state.career || 0),0,10);
  if (state.money < 0) {
    state.debt += Math.abs(state.money);
    state.money = 0;
  }
  state.money = Math.round(state.money);
  state.debt = Math.max(0,Math.round(state.debt));
  state.flags = [...new Set(state.flags || [])];
  state.seenEvents = [...new Set(state.seenEvents || [])];
  return state;
}

export function annualIncomeForState(state) {
  return applySpecializationIncome(state,estimateAnnualIncome(state));
}

function yearlyEconomy(state) {
  // Before the player has chosen a profession we do not silently charge annual living costs.
  // Earlier this created confusing debt at ages 18-19 even when the chosen event had no money effect.
  if (state.age < 18) return { applied:false, reason:'До 18 лет годовая экономика ещё не рассчитывается.' };
  if (!state.profession) return { applied:false, reason:'Профессия ещё не выбрана — автоматические годовые расходы пока не списываются.' };

  const income = annualIncomeForState(state);
  const fixedLivingCost = 135000 + Math.max(0,state.age-20) * 7000;
  const variableLivingCost = Math.round(income * 0.56);
  const netBeforeDebt = income - fixedLivingCost - variableLivingCost;
  state.money += netBeforeDebt;

  let debtPayment = 0;
  let debtInterest = 0;
  if (state.debt > 0) {
    debtPayment = Math.min(state.money > 0 ? Math.round(state.money * 0.12) : 0, state.debt);
    state.money -= debtPayment;
    state.debt -= debtPayment;
    const beforeInterest = state.debt;
    state.debt = Math.round(state.debt * 1.03);
    debtInterest = state.debt - beforeInterest;
  }

  return { applied:true, income, fixedLivingCost, variableLivingCost, netBeforeDebt, debtPayment, debtInterest };
}

function persistentConsequences(state) {
  const notes=[];

  if (state.addiction > 0) {
    const healthLoss = Math.ceil(state.addiction / 28);
    const moneyLoss = Math.round(state.addiction * 180);
    const stressGain = Math.ceil(state.addiction / 40);
    state.health -= healthLoss;
    state.money -= moneyLoss;
    state.stress += stressGain;
    notes.push(`⚠️ Накопленная зависимость: -${healthLoss} здоровье, -${moneyLoss.toLocaleString('ru-RU')} ₽ и +${stressGain} стресс. Это долгосрочный эффект прежних решений.`);
  }

  if (state.stress >= 75) {
    state.health -= 3;
    state.happiness -= 4;
    notes.push('😰 Очень высокий стресс: -3 здоровье и -4 счастье — организм не успевает восстанавливаться.');
  } else if (state.stress >= 55) {
    state.health -= 1;
    state.happiness -= 2;
    notes.push('😰 Повышенный стресс: -1 здоровье и -2 счастье — накопленная нагрузка начинает влиять на самочувствие.');
  }

  if ((state.relationships || 0) >= 80) {
    state.stress -= 1;
    notes.push('🤝 Сильные отношения: -1 стресс — поддержка близких помогает справляться с нагрузкой.');
  }
  if ((state.flags || []).includes('emergency_fund') && state.debt > 0) {
    state.stress -= 1;
    notes.push('🛟 Финансовая подушка: -1 стресс — запас снижает тревогу из-за долга.');
  }

  return notes;
}

function clarifyEvent(event) {
  if (event.id !== 'vape-offer') return event;
  return {
    ...event,
    title:'Предлагают попробовать вейп',
    text:'На встрече знакомые предлагают попробовать вейп и говорят: «Один раз ничего не будет». Ты можешь отказаться, мягко уйти от разговора, выйти из ситуации или согласиться. Здесь проверяются личные границы, стресс и риск формирования вредной привычки.',
    choices:event.choices.map((choice,index)=>({
      ...choice,
      text:[
        '🙅 Спокойно отказаться',
        '🗣 Перевести разговор на другую тему',
        '🚶 Уйти из ситуации',
        '💨 Попробовать вейп',
      ][index] || choice.text,
    })),
  };
}

function choiceReason(eventId,choiceIndex,key,choice) {
  if (eventId === 'vape-offer') {
    const reasons = [
      {
        health:'Игровой бонус за безопасный выбор: ты не добавил организму новый вредный фактор.',
        reputation:'Ты спокойно обозначил личные границы и не поддался давлению компании.',
      },
      {
        socialCapital:'Ты избежал конфликта и сохранил контакт с компанией.',
        happiness:'Ситуация закончилась без ссоры и лишнего напряжения.',
      },
      {
        health:'Ты прекратил контакт с потенциально вредной ситуацией.',
        stress:'Ты вышел из давления компании, поэтому напряжение снизилось.',
      },
      {
        happiness:'Кратковременный эмоциональный бонус от участия в общей активности.',
        health:'Вейп несёт риск для здоровья, поэтому показатель снижается.',
        money:'Это прямые расходы на вейп или расходники, а не штраф за событие.',
        addiction:'Появляется риск того, что разовая проба закрепится как привычка.',
      },
    ];
    if (reasons[choiceIndex]?.[key]) return reasons[choiceIndex][key];
  }
  return choice.result || 'Это прямое последствие выбранного действия.';
}

function directChoiceDetails(event,choice,choiceIndex) {
  return Object.entries(choice.effects || {})
    .filter(([,value])=>Number(value)!==0)
    .map(([key,value])=>({
      key,
      value:Number(value),
      label:DETAIL_LABELS[key] || key,
      reason:choiceReason(event.id,choiceIndex,key,choice),
    }));
}

export function currentEvent(state) {
  if (!Array.isArray(state.flags)) state.flags = [];
  if (!Array.isArray(state.seenEvents)) state.seenEvents = [];
  const event = clarifyEvent(eventForState(state));
  state.currentEventId = event.id;
  return event;
}

export function applyChoice(state,event,choiceIndex) {
  if (!event || event.id !== state.currentEventId) throw new Error('This event is no longer active');
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error('Unknown choice');

  if (!Array.isArray(state.flags)) state.flags = [];
  if (!Array.isArray(state.seenEvents)) state.seenEvents = [];

  const before = structuredClone(state);
  const direct = directChoiceDetails(event,choice,choiceIndex);
  for (const [key,value] of Object.entries(choice.effects || {})) {
    state[key] = Number(state[key] || 0) + Number(value || 0);
  }
  if (choice.set) {
    for (const [key,value] of Object.entries(choice.set)) state[key] = value;
  }
  if (choice.addFlags) state.flags.push(...choice.addFlags);
  if (choice.removeFlags) state.flags = state.flags.filter((f)=>!choice.removeFlags.includes(f));
  state.seenEvents.push(event.id);

  const economy = yearlyEconomy(state);
  const persistent = persistentConsequences(state);
  const debtBeforeNormalize = Number(state.debt || 0);
  const negativeCashBeforeNormalize = Math.max(0,-Number(state.money || 0));

  state.age += 1;
  state.currentEventId = null;
  normalize(state);

  const deltas = buildDeltas(before,state);
  deltas.details = {
    direct,
    economy,
    persistent,
    debtCreated: negativeCashBeforeNormalize > 0 ? Math.max(0,Number(state.debt||0)-debtBeforeNormalize) : 0,
  };

  return {
    state,
    result: choice.result,
    deltas,
    score: scoreGame(state),
    finished: state.age >= 60,
  };
}

function buildDeltas(before,after) {
  const keys = ['money','debt','health','happiness','skills','reputation','career','relationships'];
  const changes = keys
    .map((key)=>({key,delta:Number(after[key]||0)-Number(before[key]||0)}))
    .filter((x)=>x.delta!==0);
  const move = careerMove(before,after);
  if (move) changes.unshift({key:'careerTitle',delta:0,...move});
  return changes;
}

function formatCareerMoves(deltas) {
  return deltas.filter((change)=>change.key==='careerTitle').map((change)=>{
    if (change.kind === 'start') return `🎯 Карьера началась: ${change.to}`;
    if (change.kind === 'specialization') return `🧭 Специализация определена: ${change.to}`;
    if (change.kind === 'promotion') return `🎉 Повышение: ${change.from} → ${change.to}`;
    return `🔁 Новая должность: ${change.from} → ${change.to}`;
  });
}

export function formatDeltas(deltas) {
  const details = deltas?.details;
  if (details) {
    const sections=[];
    const careerMoves = formatCareerMoves(deltas);
    if (careerMoves.length) sections.push(careerMoves.join('\n'));

    if (details.direct.length) {
      sections.push(`🎯 Последствия твоего решения:\n${details.direct.map((item)=>`${item.label}: ${formatSigned(item.value)} — ${item.reason}`).join('\n')}`);
    }

    if (details.economy?.applied) {
      const e=details.economy;
      const lines=[
        `💵 Доход за год: +${e.income.toLocaleString('ru-RU')} ₽`,
        `🏠 Базовые расходы: -${e.fixedLivingCost.toLocaleString('ru-RU')} ₽`,
        `🧾 Повседневные расходы: -${e.variableLivingCost.toLocaleString('ru-RU')} ₽`,
        `⚖️ Баланс до обслуживания долга: ${formatSigned(e.netBeforeDebt)} ₽`,
      ];
      if (e.debtPayment>0) lines.push(`💳 Погашение долга: -${e.debtPayment.toLocaleString('ru-RU')} ₽ из свободных денег.`);
      if (e.debtInterest>0) lines.push(`📈 Проценты по долгу: +${e.debtInterest.toLocaleString('ru-RU')} ₽ к долгу.`);
      sections.push(`📆 Экономика года:\n${lines.join('\n')}`);
    } else if (details.economy?.reason) {
      sections.push(`📆 Экономика года: ${details.economy.reason}`);
    }

    if (details.persistent?.length) sections.push(`⏳ Долгосрочные последствия:\n${details.persistent.join('\n')}`);
    if (details.debtCreated>0) sections.push(`💳 Новый долг: +${Math.round(details.debtCreated).toLocaleString('ru-RU')} ₽ — расходы превысили доступные деньги, поэтому недостающая сумма перешла в долг.`);

    return sections.join('\n\n');
  }

  const labels = {money:'💰 Деньги',debt:'💳 Долг',health:'❤️ Здоровье',happiness:'😊 Счастье',skills:'🧠 Навыки',reputation:'👥 Репутация',career:'📈 Карьерный уровень',relationships:'🤝 Отношения'};
  return deltas.slice(0,7).map((change)=>{
    if (change.key === 'careerTitle') {
      if (change.kind === 'start') return `🎯 Карьера началась: ${change.to}`;
      if (change.kind === 'specialization') return `🧭 Специализация определена: ${change.to}`;
      if (change.kind === 'promotion') return `🎉 Повышение: ${change.from} → ${change.to}`;
      return `🔁 Новая должность: ${change.from} → ${change.to}`;
    }
    const {key,delta}=change;
    return `${delta>0?'+':''}${Math.round(delta).toLocaleString('ru-RU')} — ${labels[key]}`;
  }).join('\n');
}

export function formatState(state,score=scoreGame(state)) {
  const profession = careerLabel(state);
  const specialization = state.specialization ? `\n🧭 Специализация: ${specializationLabel(state)}` : '';
  const annualIncome = state.profession ? `\n💵 Игровой доход: ${annualIncomeForState(state).toLocaleString('ru-RU')} ₽/год` : '';
  const title = state.profession ? `\n🏷 Должность: ${careerTitle(state)}` : '';
  const progress = state.profession ? careerProgress(state) : null;
  const next = progress?.maxed
    ? '\n🏆 Карьерная вершина достигнута'
    : progress?.nextTitle
      ? `\n🎯 Следующая ступень: ${progress.nextTitle} (ещё ${progress.levelsToNext} ур.)`
      : '';
  return `👤 Возраст: ${state.age}\n💰 Деньги: ${state.money.toLocaleString('ru-RU')} ₽\n💳 Долг: ${state.debt.toLocaleString('ru-RU')} ₽\n❤️ Здоровье: ${state.health}/100\n😊 Счастье: ${state.happiness}/100\n🧠 Навыки: ${state.skills}/100\n👥 Репутация: ${state.reputation}/100\n💼 Профессия: ${profession}${specialization}${title}\n📈 Карьерный уровень: ${state.career}/10${next}${annualIncome}\n🤝 Отношения: ${state.relationships}/100\n⭐ Текущие очки: ${score}`;
}
