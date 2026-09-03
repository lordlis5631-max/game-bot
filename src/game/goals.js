const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export const GOAL_SELECTION_AGES = [24,33,42,51];

export const GOALS = {
  finance: {
    emoji:'💰',
    title:'Финансовая подушка',
    description:'За несколько лет заметно увеличить чистый капитал и не жить от события к событию.',
    deadlineYears:5,
    createTarget(state) {
      const netWorth = Number(state.money || 0) - Number(state.debt || 0);
      return { netWorth: Math.max(300000,netWorth + 250000) };
    },
    achieved(state,goal) {
      return Number(state.money || 0) - Number(state.debt || 0) >= Number(goal.target.netWorth || 0);
    },
    rewardEffects:{ financialLiteracy:8, happiness:4, reputation:2 },
  },
  career: {
    emoji:'📈',
    title:'Карьерный рывок',
    description:'За пять лет перейти на несколько карьерных ступеней выше.',
    deadlineYears:5,
    createTarget(state) {
      return { career: clamp(Number(state.career || 0) + 3,3,10) };
    },
    achieved(state,goal) {
      return Number(state.career || 0) >= Number(goal.target.career || 0);
    },
    rewardEffects:{ skills:5, reputation:8, happiness:3 },
  },
  project: {
    emoji:'🚀',
    title:'Довести проект до результата',
    description:'Не просто придумать идею, а завершить хотя бы один настоящий проект.',
    deadlineYears:6,
    createTarget(state) {
      return { completedProjects: Number(state.completedProjects || 0) + 1 };
    },
    achieved(state,goal) {
      return Number(state.completedProjects || 0) >= Number(goal.target.completedProjects || 1);
    },
    rewardEffects:{ entrepreneurship:7, reputation:6, happiness:5 },
  },
  balance: {
    emoji:'⚖️',
    title:'Собрать устойчивую жизнь',
    description:'Поднять здоровье и счастье, одновременно снизив накопленный стресс.',
    deadlineYears:4,
    createTarget() {
      return { health:80, happiness:70, maxStress:45 };
    },
    achieved(state,goal) {
      return Number(state.health || 0) >= goal.target.health &&
        Number(state.happiness || 0) >= goal.target.happiness &&
        Number(state.stress || 0) <= goal.target.maxStress;
    },
    rewardEffects:{ health:4, happiness:6, relationships:4 },
  },
};

export function goalSelectionForState(state) {
  if (!GOAL_SELECTION_AGES.includes(Number(state.age))) return null;
  if (state.activeGoal) return null;
  return {
    id:`goal-selection-${state.age}`,
    title:'🎯 Цель на несколько лет',
    text:'Не все решения дают эффект сразу. Выбери одну большую цель: она будет отображаться в карточке жизни, а игра будет проверять прогресс каждый год. За выполнение цели до дедлайна ты получишь отдельную награду и бонус к итоговому результату.',
    choices:Object.entries(GOALS).map(([id,goal])=>({
      text:`${goal.emoji} ${goal.title}`,
      effects:{},
      result:`Ты выбрал цель «${goal.title}». Теперь у тебя есть несколько лет, чтобы довести её до результата.`,
      startGoal:id,
    })),
  };
}

export function startGoal(state,id) {
  const config = GOALS[id];
  if (!config) return null;
  const target = config.createTarget(state);
  state.activeGoal = {
    id,
    title:config.title,
    emoji:config.emoji,
    startedAge:Number(state.age),
    deadlineAge:Number(state.age) + config.deadlineYears,
    target,
  };
  return `🎯 Новая цель: ${config.emoji} ${config.title}. Дедлайн — до ${state.activeGoal.deadlineAge} лет.`;
}

function applyEffects(state,effects={}) {
  for (const [key,value] of Object.entries(effects)) {
    state[key] = Number(state[key] || 0) + Number(value || 0);
  }
}

export function evaluateGoal(state) {
  const goal = state.activeGoal;
  if (!goal) return null;
  const config = GOALS[goal.id];
  if (!config) return null;

  if (Number(state.age) <= Number(goal.startedAge) + 1) return null;

  if (config.achieved(state,goal)) {
    applyEffects(state,config.rewardEffects);
    state.goalsCompleted = Number(state.goalsCompleted || 0) + 1;
    state.goalHistory = [...(state.goalHistory || []),{
      ...goal,
      status:'completed',
      resolvedAge:Number(state.age),
    }];
    state.activeGoal = null;
    return {
      status:'completed',
      text:`🏆 Цель выполнена: ${goal.emoji} ${goal.title}. Ты уложился в срок и получил бонус за долгосрочный результат.`,
      rewardEffects:config.rewardEffects,
    };
  }

  if (Number(state.age) > Number(goal.deadlineAge)) {
    state.goalHistory = [...(state.goalHistory || []),{
      ...goal,
      status:'failed',
      resolvedAge:Number(state.age),
    }];
    state.activeGoal = null;
    return {
      status:'failed',
      text:`⌛ Срок цели «${goal.title}» закончился. Штрафа нет, но бонус за выполнение не получен.`,
      rewardEffects:{},
    };
  }

  return null;
}

export function goalProgressText(state) {
  const goal = state.activeGoal;
  if (!goal) return null;
  const yearsLeft = Math.max(0,Number(goal.deadlineAge) - Number(state.age));
  let progress='';
  if (goal.id === 'finance') {
    const netWorth = Number(state.money || 0) - Number(state.debt || 0);
    progress = `${Math.round(netWorth).toLocaleString('ru-RU')} / ${Math.round(goal.target.netWorth).toLocaleString('ru-RU')} ₽`;
  } else if (goal.id === 'career') {
    progress = `${Number(state.career || 0)}/${goal.target.career} уровня`;
  } else if (goal.id === 'project') {
    progress = `${Number(state.completedProjects || 0)}/${goal.target.completedProjects} завершённых проектов`;
  } else if (goal.id === 'balance') {
    progress = `❤️ ${state.health}/${goal.target.health} · 😊 ${state.happiness}/${goal.target.happiness} · 😰 ${state.stress}/${goal.target.maxStress} max`;
  }
  return `${goal.emoji} ${goal.title}: ${progress} · осталось ${yearsLeft} г.`;
}
