import { chanceForState } from './chanceChecks.js';

const clamp = (value,min,max) => Math.max(min,Math.min(max,value));

export const PROJECT_SELECTION_AGES = [26,36,47,56];

export const PROJECTS = {
  indie_game: {
    emoji:'🎮', title:'Инди-игра',
    description:'Собрать прототип, протестировать его и довести до релиза.',
    startCost:20000,
    startEffects:{ skills:3, entrepreneurship:3, stress:2 },
    rewardEffects:{ money:120000, reputation:10, skills:8, happiness:5 },
  },
  digital_product: {
    emoji:'💻', title:'Цифровой продукт',
    description:'Сделать полезный сервис или приложение и найти первых пользователей.',
    startCost:15000,
    startEffects:{ skills:4, entrepreneurship:4, stress:2 },
    rewardEffects:{ money:160000, reputation:8, entrepreneurship:8 },
  },
  community_event: {
    emoji:'🎪', title:'Большое игровое событие',
    description:'Организовать игротеку, фестиваль или городской игровой проект.',
    startCost:10000,
    startEffects:{ socialCapital:4, reputation:2, stress:3 },
    rewardEffects:{ money:70000, reputation:14, socialCapital:12, happiness:5 },
  },
  creative_media: {
    emoji:'🎨', title:'Креативный медиа-проект',
    description:'Запустить медиа, серию материалов или креативный продукт с собственной аудиторией.',
    startCost:12000,
    startEffects:{ skills:3, socialCapital:3, reputation:2 },
    rewardEffects:{ money:90000, reputation:10, socialCapital:8, happiness:4 },
  },
};

function applyEffects(state,effects={}) {
  for (const [key,value] of Object.entries(effects)) {
    state[key] = Number(state[key] || 0) + Number(value || 0);
  }
}

export function projectSelectionForState(state) {
  if (!PROJECT_SELECTION_AGES.includes(Number(state.age))) return null;
  if (state.activeProject) return null;
  return {
    id:`project-selection-${state.age}`,
    title:'🛠 Проект, который будет жить несколько лет',
    text:'Теперь можно взять долгосрочный проект. Он не завершится одной кнопкой: каждые несколько лет придётся выбирать, как двигать его дальше. Некоторые решения будут рискованными — шанс успеха зависит от твоих навыков, связей, финансовой грамотности, стресса и других характеристик.',
    choices:Object.entries(PROJECTS).map(([id,project])=>({
      text:`${project.emoji} ${project.title}`,
      effects:{ money:-project.startCost, ...project.startEffects },
      result:`Ты запустил проект «${project.title}». Первый этап — 0/100, дальше придётся постепенно доводить его до результата.`,
      startProject:id,
    })),
  };
}

function projectCheck(kind) {
  if (kind === 'sprint') return {
    base:52,
    weights:{ skills:0.35, reputation:0.12 },
    successEffects:{ skills:2, reputation:2, stress:3 },
    failureEffects:{ stress:6, health:-2 },
    successResult:'Спринт сработал: команда закрыла важный кусок работы и проект заметно продвинулся.',
    failureResult:'Спринт оказался тяжелее, чем ожидалось: часть задач пришлось переделывать, а прогресс получился скромным.',
  };
  if (kind === 'partner') return {
    base:50,
    weights:{ socialCapital:0.35, reputation:0.2 },
    successEffects:{ socialCapital:3, reputation:3, happiness:2 },
    failureEffects:{ stress:3, reputation:-1 },
    successResult:'Ты нашёл сильного партнёра: часть задач распределилась, а проект получил новые связи.',
    failureResult:'Переговоры не дали нужного партнёра. Время потрачено, но ты лучше понял, кого именно не хватает проекту.',
  };
  if (kind === 'investment') return {
    base:62,
    weights:{ financialLiteracy:0.25, entrepreneurship:0.2 },
    successEffects:{ reputation:2, entrepreneurship:3 },
    failureEffects:{ stress:4 },
    successResult:'Вложение оказалось точным: деньги сняли главное ограничение и ускорили проект.',
    failureResult:'Деньги потрачены, но выбранное решение не сняло главную проблему проекта.',
  };
  return {
    base:38,
    weights:{ entrepreneurship:0.3, skills:0.15, risk:0.08 },
    successEffects:{ money:50000, reputation:6, entrepreneurship:5, happiness:3 },
    failureEffects:{ money:-20000, stress:8, reputation:-3 },
    successResult:'Рискованный рывок сработал: проект получил сильный результат и заметность.',
    failureResult:'Ставка не сыграла: пришлось потратить дополнительные ресурсы и разбирать последствия.',
  };
}

function actionChoice(state,kind,text,baseEffects,successProgress,failureProgress) {
  const check=projectCheck(kind);
  const chance=chanceForState(state,check);
  return {
    text:`${text} · 🎲 ${chance}%`,
    effects:baseEffects,
    result:'Ты сделал следующий шаг по проекту.',
    check,
    projectAction:{ kind, successProgress, failureProgress },
  };
}

export function projectEventForState(state) {
  const project=state.activeProject;
  if (!project || project.status !== 'active') return null;
  if (Number(project.progress || 0) >= 100) return null;
  if (Number(state.age) <= Number(project.startedAge)) return null;
  if (Number(state.age) - Number(project.lastActionAge || project.startedAge) < 2) return null;

  return {
    id:`project-${project.id}-${state.age}-${project.progress}`,
    title:`${project.emoji} Проект «${project.title}»: ${project.progress}/100`,
    text:'Проект не движется сам. Выбери способ продвинуть его на этом этапе. Проценты на кнопках — реальный игровой шанс успеха именно для твоего текущего состояния.',
    choices:[
      actionChoice(state,'sprint','🔥 Устроить рабочий спринт',{stress:2},28,8),
      actionChoice(state,'partner','🤝 Найти партнёра или эксперта',{money:-5000},24,6),
      actionChoice(state,'investment','💰 Вложить 30 000 ₽',{money:-30000},32,10),
      actionChoice(state,'bold','🚀 Сделать рискованный рывок',{risk:4},45,-5),
    ],
  };
}

export function startProject(state,id) {
  const config=PROJECTS[id];
  if (!config) return null;
  state.activeProject={
    id,
    title:config.title,
    emoji:config.emoji,
    progress:0,
    status:'active',
    startedAge:Number(state.age),
    lastActionAge:Number(state.age),
  };
  return `🛠 Проект запущен: ${config.emoji} ${config.title}. Прогресс 0/100.`;
}

export function applyProjectAction(state,choice,chanceOutcome) {
  if (choice.startProject) {
    const note=startProject(state,choice.startProject);
    return note ? [note] : [];
  }
  if (!choice.projectAction || !state.activeProject) return [];

  const action=choice.projectAction;
  const success=Boolean(chanceOutcome?.success);
  const progressDelta=success ? Number(action.successProgress || 0) : Number(action.failureProgress || 0);
  const project=state.activeProject;
  project.progress=clamp(Number(project.progress || 0)+progressDelta,0,100);
  project.lastActionAge=Number(state.age);
  const notes=[`${success?'✅':'⚠️'} Прогресс проекта: ${progressDelta>=0?'+':''}${progressDelta} → ${project.progress}/100.`];

  if (project.progress >= 100) {
    const config=PROJECTS[project.id];
    applyEffects(state,config?.rewardEffects || {});
    state.completedProjects=Number(state.completedProjects || 0)+1;
    state.projectHistory=[...(state.projectHistory || []),{
      ...project,
      status:'completed',
      completedAge:Number(state.age),
    }];
    state.flags=[...(state.flags || []),`project_completed_${project.id}`];
    notes.push(`🏁 Проект «${project.title}» завершён. Ты получил награду за доведённый до результата проект.`);
    state.activeProject=null;
  }
  return notes;
}

export function projectProgressText(state) {
  const project=state.activeProject;
  if (!project) return null;
  return `${project.emoji} ${project.title}: ${project.progress}/100`;
}
