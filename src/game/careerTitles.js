import { CAREERS } from './careers.js';

export const CAREER_RANKS = {
  game_dev: [
    { level: 0, title: 'Новичок в геймдеве' },
    { level: 1, title: 'Стажёр игровой команды' },
    { level: 2, title: 'Junior-разработчик игр' },
    { level: 4, title: 'Middle-разработчик игр' },
    { level: 6, title: 'Senior-разработчик игр' },
    { level: 8, title: 'Lead игровой команды' },
    { level: 10, title: 'Продюсер / креативный директор' },
  ],
  it: [
    { level: 0, title: 'Новичок в IT' },
    { level: 1, title: 'Стажёр IT-команды' },
    { level: 2, title: 'Junior IT-специалист' },
    { level: 4, title: 'Middle IT-специалист' },
    { level: 6, title: 'Senior IT-специалист' },
    { level: 8, title: 'Tech Lead / ведущий эксперт' },
    { level: 10, title: 'Архитектор / руководитель разработки' },
  ],
  petrochem: [
    { level: 0, title: 'Практикант нефтехимического направления' },
    { level: 1, title: 'Стажёр-технолог' },
    { level: 2, title: 'Инженер-технолог' },
    { level: 4, title: 'Ведущий инженер-технолог' },
    { level: 6, title: 'Старший технолог / эксперт' },
    { level: 8, title: 'Главный технолог / руководитель проекта' },
    { level: 10, title: 'Руководитель технологического направления' },
  ],
  engineering: [
    { level: 0, title: 'Практикант инженерной команды' },
    { level: 1, title: 'Инженер-стажёр' },
    { level: 2, title: 'Инженер' },
    { level: 4, title: 'Ведущий инженер' },
    { level: 6, title: 'Старший инженер / ведущий конструктор' },
    { level: 8, title: 'Главный инженер проекта' },
    { level: 10, title: 'Технический директор / главный конструктор' },
  ],
  medicine: [
    { level: 0, title: 'Студент-практикант' },
    { level: 1, title: 'Стажёр медицинской команды' },
    { level: 2, title: 'Молодой медицинский специалист' },
    { level: 4, title: 'Специалист' },
    { level: 6, title: 'Ведущий специалист' },
    { level: 8, title: 'Руководитель медицинского направления' },
    { level: 10, title: 'Эксперт / руководитель медицинской команды' },
  ],
  pedagogy: [
    { level: 0, title: 'Практикант в образовании' },
    { level: 1, title: 'Молодой педагог' },
    { level: 2, title: 'Педагог' },
    { level: 4, title: 'Ведущий педагог' },
    { level: 6, title: 'Методист / педагог-наставник' },
    { level: 8, title: 'Руководитель образовательных проектов' },
    { level: 10, title: 'Руководитель образовательного направления' },
  ],
  design_media: [
    { level: 0, title: 'Начинающий автор' },
    { level: 1, title: 'Стажёр креативной команды' },
    { level: 2, title: 'Junior-дизайнер / медиаспециалист' },
    { level: 4, title: 'Middle-дизайнер / медиаспециалист' },
    { level: 6, title: 'Senior-дизайнер / редактор' },
    { level: 8, title: 'Креативный лид / арт-директор' },
    { level: 10, title: 'Креативный директор / руководитель медиа' },
  ],
  entrepreneur: [
    { level: 0, title: 'Автор идеи' },
    { level: 1, title: 'Начинающий предприниматель' },
    { level: 2, title: 'Основатель проекта' },
    { level: 4, title: 'Предприниматель' },
    { level: 6, title: 'Руководитель растущего бизнеса' },
    { level: 8, title: 'Основатель компании / CEO' },
    { level: 10, title: 'Серийный предприниматель / инвестор проектов' },
  ],
  agro: [
    { level: 0, title: 'Практикант АПК' },
    { level: 1, title: 'Молодой специалист АПК' },
    { level: 2, title: 'Специалист АПК' },
    { level: 4, title: 'Ведущий специалист АПК' },
    { level: 6, title: 'Руководитель агропроекта' },
    { level: 8, title: 'Руководитель производственного направления' },
    { level: 10, title: 'Директор агротехнологического направления' },
  ],
  public_service: [
    { level: 0, title: 'Стажёр общественного проекта' },
    { level: 1, title: 'Молодой специалист' },
    { level: 2, title: 'Специалист' },
    { level: 4, title: 'Ведущий специалист' },
    { level: 6, title: 'Главный специалист / руководитель проекта' },
    { level: 8, title: 'Руководитель направления' },
    { level: 10, title: 'Руководитель программы / системный эксперт' },
  ],
};

const clampLevel = (value) => Math.max(0, Math.min(10, Number(value || 0)));

function ranksFor(stateOrKey) {
  const key = typeof stateOrKey === 'string' ? stateOrKey : stateOrKey?.profession;
  return CAREER_RANKS[key] || null;
}

export function careerRank(state) {
  const ranks = ranksFor(state);
  if (!ranks) return null;
  const level = clampLevel(state?.career);
  let current = ranks[0];
  for (const rank of ranks) {
    if (rank.level <= level) current = rank;
    else break;
  }
  return { ...current, index: ranks.indexOf(current) };
}

export function careerTitle(state) {
  if (!state?.profession || !CAREERS[state.profession]) return 'Должность ещё не выбрана';
  return careerRank(state)?.title || 'Начинающий специалист';
}

export function careerProgress(state) {
  const ranks = ranksFor(state);
  if (!ranks) return null;
  const current = careerRank(state);
  const next = ranks[current.index + 1] || null;
  return {
    currentTitle: current.title,
    currentLevel: clampLevel(state?.career),
    nextTitle: next?.title || null,
    nextLevel: next?.level ?? null,
    levelsToNext: next ? Math.max(0, next.level - clampLevel(state?.career)) : 0,
    maxed: !next,
  };
}

export function careerMove(before, after) {
  if (!after?.profession || !CAREERS[after.profession]) return null;

  const afterTitle = careerTitle(after);
  if (before?.profession !== after.profession) {
    return { kind: 'start', from: null, to: afterTitle };
  }

  const beforeTitle = careerTitle(before);
  if (beforeTitle === afterTitle) return null;
  const kind = Number(after.career || 0) > Number(before.career || 0) ? 'promotion' : 'change';
  return { kind, from: beforeTitle, to: afterTitle };
}

export function allCareerRanks() {
  return CAREER_RANKS;
}
