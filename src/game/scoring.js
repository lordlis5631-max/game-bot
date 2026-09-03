const clamp = (v,min,max) => Math.max(min,Math.min(max,v));

export function achievementsFor(state) {
  const result = [];
  if (state.money >= 1_000_000) result.push('💰 Миллионер');
  if (state.health >= 90) result.push('❤️ ЗОЖ');
  if (state.skills >= 90) result.push('🧠 Вечный ученик');
  if (state.career >= 9) result.push('💼 Карьерный максимум');
  if (state.entrepreneurship >= 60) result.push('🚀 Предприниматель');
  if (state.relationships >= 90) result.push('👨‍👩‍👧 Человек отношений');
  if (state.reputation >= 90) result.push('🌟 Репутация');
  if ((state.flags || []).includes('mentor')) result.push('🧭 Наставник');
  if ((state.flags || []).includes('legacy')) result.push('🏛 Проект-наследие');
  if (state.debt === 0 && state.financialLiteracy >= 70) result.push('📈 Финансовый стратег');
  return result;
}

export function scoreGame(state) {
  const netWorth = state.money - state.debt;
  const points =
    clamp(netWorth / 5000, -500, 2500) +
    state.health * 15 +
    state.happiness * 15 +
    state.skills * 12 +
    state.reputation * 8 +
    state.career * 120 +
    state.relationships * 10 +
    state.financialLiteracy * 5 +
    state.socialCapital * 4 +
    state.entrepreneurship * 3 +
    achievementsFor(state).length * 180 -
    state.stress * 4 -
    state.addiction * 8 -
    clamp(state.debt / 5000,0,1000);
  return Math.round(clamp(points,0,10000));
}

export function lifeType(state) {
  const options = [
    ['Предприниматель', state.entrepreneurship + state.risk * 0.2],
    ['Карьерист', state.career * 10 + state.reputation * 0.4],
    ['Исследователь', state.skills + state.financialLiteracy * 0.3],
    ['Человек сообщества', state.socialCapital + state.reputation * 0.5],
    ['Человек баланса', state.health * 0.6 + state.happiness * 0.6 + state.relationships * 0.6 - state.stress * 0.3],
    ['Авантюрист', state.risk + state.happiness * 0.35],
  ];
  return options.sort((a,b)=>b[1]-a[1])[0][0];
}
