import { chanceForState } from './chanceChecks.js';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const NPCS={
  artem:{id:'artem',name:'Артём',emoji:'🤝',role:'друг',baseScore:35},
  irina:{id:'irina',name:'Ирина',emoji:'🧭',role:'наставник',baseScore:30},
  sasha:{id:'sasha',name:'Саша',emoji:'❤️',role:'близкий человек',baseScore:30},
  kirill:{id:'kirill',name:'Кирилл',emoji:'💼',role:'коллега',baseScore:30},
};

function c(text,effects,result,npcEffects=[],extra={}) {
  return {text,effects,result,npcEffects,...extra};
}

export function ensureNpcState(state) {
  if (!state.npcs||typeof state.npcs!=='object'||Array.isArray(state.npcs)) state.npcs={};
  return state.npcs;
}

export function npcById(id) {
  return NPCS[id]||null;
}

export function relationshipLevel(score) {
  const value=Number(score||0);
  if (value>=85) return 'очень близкие отношения';
  if (value>=65) return 'близкий контакт';
  if (value>=45) return 'хороший контакт';
  if (value>=25) return 'знакомые';
  return 'дистанция';
}

function ensureNpc(state,id,status=null) {
  ensureNpcState(state);
  const config=NPCS[id];
  if (!config) return null;
  if (!state.npcs[id]) {
    state.npcs[id]={
      id,
      name:config.name,
      emoji:config.emoji,
      role:config.role,
      score:config.baseScore,
      status:status||'active',
      metAge:Number(state.age||16),
      lastInteractionAge:Number(state.age||16),
    };
  }
  if (status) state.npcs[id].status=status;
  return state.npcs[id];
}

export function applyNpcChoice(state,choice) {
  const notes=[];
  for (const effect of choice?.npcEffects||[]) {
    const npc=ensureNpc(state,effect.id,effect.status||null);
    if (!npc) continue;
    const before=Number(npc.score||0);
    npc.score=clamp(before+Number(effect.delta||0),0,100);
    npc.lastInteractionAge=Number(state.age||0);
    if (effect.role) npc.role=effect.role;
    if (effect.status) npc.status=effect.status;
    const delta=npc.score-before;
    const sign=delta>0?'+':'';
    notes.push(`${npc.emoji} ${npc.name}: ${sign}${delta} к отношениям → ${npc.score}/100 (${relationshipLevel(npc.score)}).${effect.reason?` ${effect.reason}`:''}`);
  }
  return notes;
}

export function strongestNpc(state,minScore=0) {
  ensureNpcState(state);
  const entries=Object.values(state.npcs||{}).filter((npc)=>Number(npc.score||0)>=minScore&&npc.status!=='gone');
  entries.sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  return entries[0]||null;
}

export function npcSummaryText(state,limit=4) {
  ensureNpcState(state);
  const entries=Object.values(state.npcs||{}).filter((npc)=>npc.status!=='gone');
  entries.sort((a,b)=>Number(b.score||0)-Number(a.score||0));
  if (!entries.length) return null;
  return entries.slice(0,limit).map((npc)=>`${npc.emoji} ${npc.name} · ${npc.role}: ${npc.score}/100`).join(' · ');
}

export function npcRelationshipScore(state) {
  ensureNpcState(state);
  return Object.values(state.npcs||{}).reduce((sum,npc)=>sum+Number(npc.score||0),0);
}

export function closeNpcCount(state,threshold=65) {
  ensureNpcState(state);
  return Object.values(state.npcs||{}).filter((npc)=>Number(npc.score||0)>=threshold&&npc.status!=='gone').length;
}

export function decorateNpcEvent(event,state) {
  if (!event) return event;
  ensureNpcState(state);
  if (event.id!=='internship-choice') return event;
  return {
    ...event,
    title:'Первая серьёзная практика и знакомство с Ириной',
    text:'На реальном проекте появляется куратор Ирина. Она спокойно разбирает ошибки и знает людей из индустрии. Даже если ты не пойдёшь на стажировку, это может стать полезным профессиональным знакомством.',
    choices:event.choices.map((choice,index)=>({
      ...choice,
      npcEffects:[...(choice.npcEffects||[]),[
        {id:'irina',delta:22,status:'mentor',reason:'Совместная стажировка быстро укрепила профессиональное доверие.'},
        {id:'irina',delta:10,status:'mentor',reason:'Ты сохранил контакт и можешь вернуться за советом позже.'},
        {id:'irina',delta:14,status:'mentor',reason:'Ирина увидела твою самостоятельность и интерес к собственным проектам.'},
        {id:'irina',delta:4,status:'mentor',reason:'Ты отказался от нагрузки, но не оборвал знакомство.'},
      ][index]].filter(Boolean),
    })),
  };
}

function friendIntro() {
  return {
    id:'npc-artem-intro-17',
    title:'🤝 Новый человек в компании',
    text:'На игротеке ты знакомишься с Артёмом. Он тоже любит игры и постоянно придумывает небольшие проекты. Такие знакомства иногда остаются случайными, а иногда проходят через десятилетия жизни.',
    choices:[
      c('🎮 Сесть с Артёмом в одну команду',{skills:2,happiness:2},'Вы быстро сработались и после встречи продолжили общаться.',[{id:'artem',delta:24,status:'friend',reason:'Общее дело стало хорошим началом дружбы.'}]),
      c('📱 Обменяться контактами',{socialCapital:3},'Вы обменялись контактами без больших обещаний.',[{id:'artem',delta:15,status:'friend',reason:'Контакт сохранился и может пригодиться позже.'}]),
      c('🏁 Посоревноваться',{skills:3,stress:1},'Соперничество оказалось азартным и запомнилось вам обоим.',[{id:'artem',delta:8,status:'friend',reason:'Вы уважаете друг друга, хотя пока больше соперничаете.'}]),
      c('🌿 Остаться в стороне',{stress:-1},'Ты не стал активно сближаться, но знакомство всё равно состоялось.',[{id:'artem',delta:-5,status:'acquaintance',reason:'Контакт остался поверхностным.'}]),
    ],
  };
}

function sashaIntro() {
  return {
    id:'npc-sasha-intro-31',
    title:'❤️ Разговор, который неожиданно затянулся',
    text:'После мероприятия ты знакомишься с Сашей. Разговор продолжается намного дольше, чем планировалось. Это может стать дружбой, близкими отношениями, совместным проектом — или просто хорошим вечером.',
    choices:[
      c('❤️ Предложить встретиться ещё раз',{happiness:5,relationships:5,stress:1},'Вы начинаете проводить больше времени вместе.',[{id:'sasha',delta:28,status:'close',role:'близкий человек',reason:'Ты сделал явный шаг навстречу.'}]),
      c('🤝 Оставить это дружбой',{socialCapital:4,relationships:3},'Вы становитесь хорошими друзьями без лишних ожиданий.',[{id:'sasha',delta:20,status:'friend',role:'друг',reason:'Спокойная дружба быстро стала устойчивой.'}]),
      c('🛠 Позвать в совместный проект',{skills:2,socialCapital:3,stress:1},'Общий проект становится способом узнать друг друга через дело.',[{id:'sasha',delta:14,status:'project_partner',role:'партнёр по проекту',reason:'Совместная работа укрепила контакт.'}]),
      c('🌿 Не продолжать знакомство',{stress:-1},'Ты решил не развивать новое знакомство.',[{id:'sasha',delta:-8,status:'acquaintance',reason:'Контакт постепенно остаётся в прошлом.'}]),
    ],
  };
}

function kirillIntro() {
  return {
    id:'npc-kirill-intro-34',
    title:'💼 Сильный коллега рядом',
    text:'В команде появляется Кирилл — амбициозный специалист примерно твоего уровня. Он может стать союзником, конкурентом или человеком, с которым вы постоянно спорите за влияние.',
    choices:[
      c('🤝 Делать сложные задачи вместе',{career:1,skills:3,stress:1},'Совместная работа ускорила обоих.',[{id:'kirill',delta:22,status:'ally',role:'коллега-союзник',reason:'Вы научились усиливать друг друга.'}]),
      c('🏁 Конкурировать',{skills:4,career:1,stress:3},'Конкуренция заставила работать сильнее, но добавила напряжения.',[{id:'kirill',delta:8,status:'rival',role:'коллега-соперник',reason:'Между вами есть уважение, но и постоянное сравнение.'}]),
      c('🧭 Помогать и делиться опытом',{reputation:4,socialCapital:2},'Ты сделал ставку на сотрудничество вместо борьбы за статус.',[{id:'kirill',delta:17,status:'ally',role:'коллега-союзник',reason:'Поддержка создала взаимное доверие.'}]),
      c('⚡ Войти в открытый конфликт',{reputation:-2,stress:5},'Спор стал личным и теперь влияет на атмосферу команды.',[{id:'kirill',delta:-20,status:'rival',role:'коллега-соперник',reason:'Конфликт серьёзно снизил доверие.'}]),
    ],
  };
}

function artemFollowup(state) {
  const npc=state.npcs?.artem;
  if (!npc) return null;
  const check={
    base:43,
    weights:{skills:0.2,entrepreneurship:0.2,socialCapital:0.12},
    npcSupportId:'artem',
    successEffects:{money:45000,reputation:5,happiness:3},
    failureEffects:{stress:5,money:-10000},
    successResult:'Совместная идея выстрелила: вы довели маленький проект до заметного результата.',
    failureResult:'Проект не взлетел, но вы получили опыт и поняли, где переоценили свои силы.',
  };
  return {
    id:'npc-artem-project-37',
    title:`🤝 Артём возвращается с идеей · отношения ${npc.score}/100`,
    text:'Артём пишет тебе поздно вечером: у него есть идея небольшого игрового проекта, которую можно проверить за несколько месяцев. Ваши прошлые отношения влияют на то, насколько легко вам будет работать вместе.',
    choices:[
      c(`🚀 Рискнуть вместе · 🎲 ${chanceForState(state,check)}%`,{risk:3,stress:2},'Вы решили проверить идею на практике.',[{id:'artem',delta:10,reason:'Совместный риск снова сделал вас командой.'}],{check}),
      c('🌙 Помогать по вечерам',{skills:4,stress:4,reputation:2},'Ты помог без полного погружения в проект.',[{id:'artem',delta:8,reason:'Артём оценил, что ты нашёл время помочь.'}]),
      c('🧭 Дать честную консультацию',{reputation:3,socialCapital:2},'Ты разобрал идею и помог увидеть слабые места.',[{id:'artem',delta:5,reason:'Честный совет сохранил доверие.'}]),
      c('🙅 Отказаться из-за своих задач',{stress:-2},'Ты выбрал свои приоритеты и не вошёл в новый проект.',[{id:'artem',delta:-10,reason:'Артём расстроился, хотя причины были понятны.'}]),
    ],
  };
}

function irinaFollowup(state) {
  const npc=state.npcs?.irina;
  if (!npc) return null;
  const check={
    base:48,
    weights:{skills:0.2,career:1.5,reputation:0.12},
    npcSupportId:'irina',
    successEffects:{career:2,reputation:6,money:70000},
    failureEffects:{skills:3,stress:5},
    successResult:'Рекомендация Ирины открыла дверь, а ты сумел доказать, что готов к следующему уровню.',
    failureResult:'Возможность оказалась выше текущего уровня, но собеседование показало, какие навыки нужно добрать.',
  };
  return {
    id:'npc-irina-opportunity-43',
    title:`🧭 Ирина рекомендует тебя · доверие ${npc.score}/100`,
    text:'Ирина предлагает твою кандидатуру на сложную роль. Сам факт рекомендации помогает, но дальше всё зависит от твоих навыков, репутации и накопленного профессионального уровня.',
    choices:[
      c(`🎯 Попробовать пройти отбор · 🎲 ${chanceForState(state,check)}%`,{stress:2},'Ты согласился пройти отбор.',[{id:'irina',delta:8,reason:'Ты не побоялся воспользоваться рекомендацией.'}],{check}),
      c('📚 Сначала попросить план развития',{skills:7,stress:-1},'Вы вместе разобрали пробелы и составили следующий профессиональный шаг.',[{id:'irina',delta:10,reason:'Совместная работа укрепила наставнический контакт.'}]),
      c('🧭 Вместе провести обучение для других',{reputation:6,socialCapital:5,happiness:2},'Вы превратили опыт в полезную программу для других.',[{id:'irina',delta:12,reason:'Вы стали уже не только учеником и наставником, но и коллегами.'}]),
      c('🌿 Отказаться от возможности',{stress:-3,happiness:1},'Ты решил не менять текущий темп жизни.',[{id:'irina',delta:-4,reason:'Контакт сохранился, но Ирина видит, что сейчас у тебя другие приоритеты.'}]),
    ],
  };
}

function sashaFollowup(state) {
  const npc=state.npcs?.sasha;
  if (!npc) return null;
  return {
    id:'npc-sasha-choice-46',
    title:`❤️ Важный разговор с Сашей · отношения ${npc.score}/100`,
    text:'Саша говорит, что ваши планы на ближайшие годы всё чаще пересекаются с работой, городом, деньгами и свободным временем. Неважно, сложилась между вами дружба, близкие отношения или совместная работа — дальше нужен честный выбор.',
    choices:[
      c('🏡 Строить больше совместных планов',{relationships:9,happiness:7,stress:1},'Вы решили чаще принимать большие решения вместе.',[{id:'sasha',delta:18,status:'close',reason:'Совместные планы сделали связь устойчивее.'}]),
      c('🗣 Честно обсудить границы',{relationships:6,stress:-4,happiness:2},'Вы договорились о том, сколько пространства нужно каждому.',[{id:'sasha',delta:12,reason:'Открытый разговор снял часть накопленного напряжения.'}]),
      c('💼 Сейчас поставить работу выше',{career:2,relationships:-5,stress:2},'Ты выбрал карьерный приоритет, и Саше пришлось с этим считаться.',[{id:'sasha',delta:-14,reason:'Времени на отношения стало заметно меньше.'}]),
      c('🚪 Сильно дистанцироваться',{happiness:-3,stress:4,relationships:-8},'Вы почти перестали быть частью повседневной жизни друг друга.',[{id:'sasha',delta:-32,status:'distant',reason:'Связь стала значительно слабее.'}]),
    ],
  };
}

function kirillFollowup(state) {
  const npc=state.npcs?.kirill;
  if (!npc) return null;
  const check={
    base:44,
    weights:{career:1.2,entrepreneurship:0.25,reputation:0.12},
    npcSupportId:'kirill',
    successEffects:{money:110000,reputation:5,entrepreneurship:4},
    failureEffects:{money:-25000,stress:6,reputation:-2},
    successResult:'Совместный продукт нашёл заказчиков и превратился в устойчивую новую линию работы.',
    failureResult:'Вы переоценили спрос. Пришлось закрыть идею раньше, чем она стала слишком дорогой.',
  };
  return {
    id:'npc-kirill-business-52',
    title:`💼 Кирилл предлагает объединить опыт · отношения ${npc.score}/100`,
    text:'Кирилл предлагает вместе запустить небольшое профессиональное направление. Если вы за годы научились доверять друг другу, это реально повышает шанс успеха. Старые конфликты, наоборот, мешают.',
    choices:[
      c(`🚀 Запустить совместный продукт · 🎲 ${chanceForState(state,check)}%`,{money:-30000,risk:3},'Вы решили проверить совместную бизнес-гипотезу.',[{id:'kirill',delta:10,reason:'Общее дело снова связало ваши траектории.'}],{check}),
      c('🤝 Работать как партнёры без общего бизнеса',{socialCapital:5,reputation:4,career:1},'Вы сохранили независимость, но регулярно помогаете друг другу.',[{id:'kirill',delta:12,status:'ally',reason:'Сотрудничество стало зрелым и устойчивым.'}]),
      c('🧭 Передавать опыт молодым вместе',{reputation:8,happiness:3,socialCapital:6},'Вы запустили формат, где делитесь опытом с молодыми специалистами.',[{id:'kirill',delta:8,reason:'Совместное наставничество сняло старое соперничество.'}]),
      c('👋 Разойтись по своим траекториям',{stress:-2},'Вы сохранили уважение, но перестали регулярно пересекаться.',[{id:'kirill',delta:-8,status:'distant',reason:'Связь ослабла без открытого конфликта.'}]),
    ],
  };
}

function legacyNpcEvent(state) {
  const npc=strongestNpc(state,20);
  if (!npc) return null;
  return {
    id:`npc-legacy-${npc.id}-57`,
    title:`${npc.emoji} Кто остаётся рядом спустя годы`,
    text:`Тебе 57. Среди множества знакомых особенно заметно, что ${npc.name} всё ещё рядом. Ваш текущий уровень отношений — ${npc.score}/100. Можно вложить этот год не только в показатели, но и в историю, которую вы оставите вместе.`,
    choices:[
      c('🏛 Сделать совместный проект-наследие',{reputation:9,socialCapital:8,happiness:5,money:-30000},`Вы с ${npc.name} сделали проект, который переживёт один сезон.`,[{id:npc.id,delta:14,reason:'Совместный большой результат закрепил отношения.'}],{addFlags:['legacy']}),
      c('❤️ Просто провести больше времени вместе',{relationships:10,happiness:9,stress:-5},`Вы с ${npc.name} выбрали время друг для друга без KPI и дедлайнов.`,[{id:npc.id,delta:16,reason:'Внимание оказалось важнее очередного достижения.'}]),
      c('🧭 Помочь с важной задачей',{reputation:5,happiness:4,stress:1},`Ты поддержал ${npc.name} в момент, когда это было особенно нужно.`,[{id:npc.id,delta:12,reason:'Помощь укрепила взаимное доверие.'}]),
      c('🌿 Сосредоточиться на себе',{health:5,stress:-5},'Ты выбрал спокойный год и свои собственные задачи.',[{id:npc.id,delta:-4,reason:'Контакта стало чуть меньше, но связь не исчезла.'}]),
    ],
  };
}

export function npcEventForState(state) {
  ensureNpcState(state);
  const age=Number(state.age);
  if (age===17&&!state.npcs.artem) return friendIntro();
  if (age===31&&!state.npcs.sasha) return sashaIntro();
  if (age===34&&!state.npcs.kirill) return kirillIntro();
  if (age===37&&state.npcs.artem) return artemFollowup(state);
  if (age===43&&state.npcs.irina) return irinaFollowup(state);
  if (age===46&&state.npcs.sasha) return sashaFollowup(state);
  if (age===52&&state.npcs.kirill) return kirillFollowup(state);
  if (age===57) return legacyNpcEvent(state);
  return null;
}
