import { eventForState } from './events.js';
import { scoreGame } from './scoring.js';

const STAT_KEYS = ['health','happiness','skills','reputation','relationships','stress','financialLiteracy','socialCapital','entrepreneurship','addiction','risk'];
const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

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
    relationships: 50,
    stress: 10,
    financialLiteracy: 10,
    socialCapital: 10,
    entrepreneurship: 5,
    addiction: 0,
    risk: 5,
    flags: [],
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
  return state;
}

function yearlyEconomy(state) {
  if (state.age < 18) return;
  const income = Math.round(state.career * 22000 + state.skills * 700 + state.entrepreneurship * 180);
  const livingCost = 25000 + Math.max(0,state.age-25) * 600;
  state.money += income - livingCost;
  if (state.debt > 0) {
    const payment = Math.min(state.money > 0 ? Math.round(state.money * 0.12) : 0, state.debt);
    state.money -= payment;
    state.debt -= payment;
    state.debt = Math.round(state.debt * 1.03);
  }
}

export function currentEvent(state) {
  const event = eventForState(state);
  state.currentEventId = event.id;
  return event;
}

export function applyChoice(state,event,choiceIndex) {
  if (!event || event.id !== state.currentEventId) throw new Error('This event is no longer active');
  const choice = event.choices[choiceIndex];
  if (!choice) throw new Error('Unknown choice');

  const before = structuredClone(state);
  for (const [key,value] of Object.entries(choice.effects || {})) {
    state[key] = Number(state[key] || 0) + Number(value || 0);
  }
  if (choice.addFlags) state.flags.push(...choice.addFlags);
  if (choice.removeFlags) state.flags = state.flags.filter((f)=>!choice.removeFlags.includes(f));

  yearlyEconomy(state);
  state.age += 1;
  state.currentEventId = null;
  normalize(state);

  return {
    state,
    result: choice.result,
    deltas: buildDeltas(before,state),
    score: scoreGame(state),
    finished: state.age >= 60,
  };
}

function buildDeltas(before,after) {
  const keys = ['money','debt','health','happiness','skills','reputation','career','relationships'];
  return keys.map((key)=>({key,delta:Number(after[key]||0)-Number(before[key]||0)})).filter((x)=>x.delta!==0);
}

export function formatDeltas(deltas) {
  const labels = {money:'💰 Деньги',debt:'💳 Долг',health:'❤️ Здоровье',happiness:'😊 Счастье',skills:'🧠 Навыки',reputation:'👥 Репутация',career:'💼 Карьера',relationships:'🤝 Отношения'};
  return deltas.slice(0,6).map(({key,delta})=>`${delta>0?'+':''}${Math.round(delta).toLocaleString('ru-RU')} — ${labels[key]}`).join('\n');
}

export function formatState(state,score=scoreGame(state)) {
  return `👤 Возраст: ${state.age}\n💰 Деньги: ${state.money.toLocaleString('ru-RU')} ₽\n💳 Долг: ${state.debt.toLocaleString('ru-RU')} ₽\n❤️ Здоровье: ${state.health}/100\n😊 Счастье: ${state.happiness}/100\n🧠 Навыки: ${state.skills}/100\n👥 Репутация: ${state.reputation}/100\n💼 Карьера: ${state.career}/10\n🤝 Отношения: ${state.relationships}/100\n⭐ Текущие очки: ${score}`;
}
