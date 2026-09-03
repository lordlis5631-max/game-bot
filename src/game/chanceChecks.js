const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export function chanceForState(state,check={}) {
  let chance = Number(check.base ?? 50);
  for (const [key,weight] of Object.entries(check.weights || {})) {
    const value = Number(state?.[key] ?? 50);
    chance += (value - 50) * Number(weight || 0);
  }

  if ((state?.stress || 0) >= 75) chance -= 8;
  else if ((state?.stress || 0) >= 55) chance -= 4;
  if ((state?.health || 100) <= 35) chance -= 6;

  return Math.round(clamp(chance,10,95));
}

function deterministicRoll(seedText) {
  let hash = 2166136261;
  for (let i=0;i<seedText.length;i++) {
    hash ^= seedText.charCodeAt(i);
    hash = Math.imul(hash,16777619);
  }
  return (Math.abs(hash >>> 0) % 100) + 1;
}

export function resolveChance(state,eventId,choiceIndex,check) {
  if (!check) return null;
  const chance = chanceForState(state,check);
  const roll = deterministicRoll(`${state?.seed || 0}:${state?.age || 0}:${eventId}:${choiceIndex}`);
  const success = roll <= chance;
  return {
    chance,
    roll,
    success,
    effects: { ...(success ? check.successEffects : check.failureEffects) },
    result: success
      ? (check.successResult || 'Проверка прошла успешно.')
      : (check.failureResult || 'Проверка не удалась.'),
  };
}
