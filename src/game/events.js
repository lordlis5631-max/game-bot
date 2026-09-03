import { scenarioForState, storylineForState } from './scenarioBank.js';
import { careerSelectionForState, careerStoryForState } from './careers.js';

const c = (text, effects, result, extra = {}) => ({ text, effects, result, ...extra });

const MILESTONES = {
  16: {
    id: 'school-finish', title: 'Первый большой выбор',
    text: 'Тебе 16. Школа подходит к концу, и впервые кажется, что следующий шаг действительно зависит от тебя.',
    choices: [
      c('🎓 Готовиться к вузу',{skills:8,stress:4,money:-5000},'Ты вложился в подготовку и расширил выбор на будущее.',{addFlags:['university_path']}),
      c('🛠 Смотреть колледжи',{skills:6,happiness:2},'Ты выбрал более прикладной путь и начал раньше собирать практические навыки.',{addFlags:['college_path']}),
      c('💼 Искать первую работу',{money:18000,career:1,skills:2},'Первые деньги дали самостоятельность, но времени на учёбу стало меньше.',{addFlags:['work_early']}),
      c('🚀 Делать свой проект',{entrepreneurship:10,skills:5,money:-8000,risk:5},'Ты начал первый собственный проект. Пока маленький, зато настоящий.',{addFlags:['creator_path']})
    ]
  },
  18: {
    id:'vape-offer', title:'Компания и давление',
    text:'На встрече знакомые предлагают попробовать вейп: «Да один раз ничего не будет». Как поступишь?',
    choices:[
      c('🙅 Отказаться',{health:2,reputation:1},'Ты спокойно отказался и не дал компании решать за тебя.'),
      c('🗣 Перевести тему',{socialCapital:2,happiness:1},'Ты сменил тему без конфликта и сохранил атмосферу.'),
      c('🚶 Уйти',{health:2,stress:-2},'Ты выбрал выйти из ситуации, которая тебе не подходит.'),
      c('💨 Попробовать',{happiness:1,health:-3,money:-3000,addiction:8},'Любопытство победило. Теперь важно, станет ли это разовым эпизодом.',{addFlags:['vape_tried']})
    ]
  },
  21: {
    id:'internship-choice', title:'Первая серьёзная практика',
    text:'Появилась возможность пройти стажировку на реальном проекте. Оплата небольшая, но можно собрать сильный кейс.',
    choices:[
      c('💼 Идти на стажировку',{skills:9,career:2,reputation:4,money:10000,stress:4},'Ты получил реальный опыт и новый кейс для портфолио.',{addFlags:['internship_done']}),
      c('📚 Сосредоточиться на учёбе',{skills:7,stress:-1},'Ты укрепил фундамент и закрыл важные учебные задачи.'),
      c('🎮 Сделать свой проект',{skills:6,entrepreneurship:8,reputation:2,money:-7000},'Ты выбрал собственный проект и научился отвечать за результат.',{addFlags:['game_project']}),
      c('😌 Взять паузу',{happiness:7,health:3,stress:-6},'Ты восстановился и не стал брать ещё одну нагрузку.')
    ]
  },
  23: {
    id:'first-career', title:'Первый карьерный разворот',
    text:'Тебе предлагают стабильную работу, но параллельно есть интересный творческий проект без гарантий.',
    choices:[
      c('🏢 Выбрать стабильность',{career:2,money:60000,stress:2},'Ты получил устойчивый доход и понятную траекторию.',{addFlags:['career_growth']}),
      c('🎨 Выбрать креативный проект',{skills:6,reputation:5,entrepreneurship:5,money:20000,risk:4},'Проект дал портфолио и новые связи.',{addFlags:['creator_path']}),
      c('⚖️ Совмещать',{career:1,skills:5,money:40000,stress:8},'Ты взял оба направления. Рост быстрый, но нагрузка тоже.'),
      c('✈️ Искать возможности в другом городе',{socialCapital:5,skills:4,money:-25000,risk:5},'Ты расширил горизонт и познакомился с новой средой.')
    ]
  },
  25: {
    id:'dropper-scam', title:'Слишком лёгкие деньги',
    text:'Знакомый предлагает «просто дать карту для переводов» и обещает процент. Звучит как лёгкий заработок.',
    choices:[
      c('🚫 Отказаться',{reputation:3,financialLiteracy:4},'Ты не стал участвовать в сомнительной схеме.'),
      c('🔎 Проверить информацию',{financialLiteracy:7,skills:2},'Проверка быстро показала, что риск несоразмерен обещанной выгоде.'),
      c('🛡 Предупредить друзей',{reputation:5,socialCapital:3},'Ты помог другим не попасть в неприятную историю.'),
      c('💸 Согласиться',{money:15000,reputation:-12,stress:12,risk:15},'Быстрые деньги обернулись проблемами и потерей доверия.',{addFlags:['financial_risk']})
    ]
  },
  30: {
    id:'housing', title:'Жильё и свобода',
    text:'У тебя накопился капитал. Можно вложиться в жильё, оставить подушку или рискнуть ради роста.',
    choices:[
      c('🏠 Первый взнос',{money:-250000,relationships:4,financialLiteracy:3},'Ты вложился в собственное жильё.',{addFlags:['home']}),
      c('🛟 Оставить подушку',{financialLiteracy:7,stress:-4},'Запас денег дал спокойствие и свободу выбора.',{addFlags:['emergency_fund']}),
      c('📈 Инвестировать часть',{money:-80000,financialLiteracy:8,risk:3},'Ты начал формировать долгосрочный капитал.',{addFlags:['investor']}),
      c('🚀 Вложить в проект',{money:-120000,entrepreneurship:10,risk:8,skills:4},'Ты направил деньги в собственную идею.',{addFlags:['business_attempt','startup_mvp']})
    ]
  },
  35: {
    id:'burnout', title:'Темп стал слишком высоким',
    text:'Работа и проекты идут хорошо, но ты всё чаще просыпаешься уставшим.',
    choices:[
      c('🧘 Снизить нагрузку',{health:8,happiness:7,stress:-12,career:-1},'Ты освободил место для восстановления.'),
      c('🏃 Добавить спорт',{health:10,stress:-6,money:-10000},'Регулярная активность помогла вернуть энергию.'),
      c('🗓 Делегировать',{career:2,skills:4,stress:-7,reputation:2},'Ты перестал тащить всё на себе и вырос как руководитель.',{addFlags:['leader_path']}),
      c('🔥 Продолжить без изменений',{career:2,money:70000,health:-10,happiness:-7,stress:14},'Результаты выросли, но организм выставил счёт.')
    ]
  },
  40: {
    id:'mentor', title:'Передавать опыт?',
    text:'К тебе начинает обращаться молодёжь за советами. Можно стать наставником, но это требует времени.',
    choices:[
      c('🧭 Стать наставником',{reputation:10,socialCapital:8,happiness:5,stress:3},'Ты помог другим быстрее пройти путь, который сам осваивал годами.',{addFlags:['mentor']}),
      c('🎤 Проводить открытые встречи',{reputation:8,skills:3,socialCapital:5},'Публичные встречи расширили твоё профессиональное окружение.'),
      c('📚 Написать материалы',{reputation:6,skills:5},'Ты систематизировал опыт и сделал его доступным другим.'),
      c('🙅 Пока отказаться',{stress:-4,happiness:2},'Ты сохранил время для своих задач.')
    ]
  },
  45: {
    id:'career-reset', title:'Смена траектории',
    text:'Ты понимаешь, что можешь ещё двадцать лет делать привычную работу — или попробовать новое направление.',
    choices:[
      c('🔁 Сменить сферу',{skills:8,happiness:8,career:-2,risk:5},'Ты снова оказался новичком, но почувствовал интерес к работе.'),
      c('📈 Расти в текущей сфере',{career:3,money:100000,reputation:4},'Опыт начал работать на тебя ещё сильнее.',{addFlags:['career_growth']}),
      c('🚀 Запустить своё дело',{entrepreneurship:12,money:-100000,risk:9,career:1},'Ты превратил накопленный опыт в собственный продукт.',{addFlags:['startup_mvp']}),
      c('⚖️ Перейти на спокойный режим',{health:5,happiness:6,stress:-8,money:-20000},'Ты выбрал больше времени для жизни вне работы.')
    ]
  },
  50: {
    id:'health-check', title:'Ресурс на следующие годы',
    text:'Организм напоминает, что здоровье тоже требует инвестиций.',
    choices:[
      c('🩺 Пройти чекап',{health:10,money:-20000,stress:-3},'Ты вовремя занялся профилактикой.'),
      c('🥗 Изменить привычки',{health:12,happiness:3,stress:-4},'Небольшие ежедневные изменения дали заметный эффект.'),
      c('🏃 Начать регулярно двигаться',{health:13,happiness:4,stress:-5},'Тело быстро ответило на регулярную нагрузку.'),
      c('⏳ Отложить',{health:-8,stress:3},'Проблемы не исчезли сами и стали сильнее мешать.')
    ]
  },
  55: {
    id:'legacy-project', title:'Проект, который останется после тебя',
    text:'Есть ресурсы и опыт, чтобы сделать большой общественный или творческий проект.',
    choices:[
      c('🎮 Создать игру с командой',{skills:5,reputation:10,happiness:7,money:-60000},'Ты собрал людей вокруг идеи и довёл её до релиза.',{addFlags:['legacy','game_released']}),
      c('🏫 Запустить образовательную программу',{reputation:12,socialCapital:8,money:-50000},'Программа помогла новым людям войти в профессию.',{addFlags:['legacy','mentor']}),
      c('🤝 Поддержать молодые проекты',{reputation:8,happiness:6,money:-80000,financialLiteracy:3},'Ты стал тем человеком, который когда-то был нужен тебе самому.',{addFlags:['legacy']}),
      c('🌿 Сосредоточиться на себе',{health:6,happiness:8,stress:-8},'Ты выбрал спокойный и внимательный к себе период.')
    ]
  },
  59: {
    id:'final-year', title:'Последний ход',
    text:'До финального подсчёта остался один год. На что потратить его?',
    choices:[
      c('❤️ На близких',{relationships:12,happiness:10,stress:-5},'Ты вложил время в людей, которые были рядом.'),
      c('🧠 На новый навык',{skills:10,happiness:4},'Ты доказал себе, что учиться можно в любом возрасте.'),
      c('🤝 На общественный проект',{reputation:10,socialCapital:10,money:-30000},'Ты сделал полезный проект вместе с другими.'),
      c('🌍 На мечту',{happiness:14,money:-70000,health:2},'Ты реализовал то, что долго откладывал.')
    ]
  }
};

export function eventForState(state) {
  const careerSelection = careerSelectionForState(state);
  if (careerSelection) return careerSelection;

  const careerStory = careerStoryForState(state);
  if (careerStory) return careerStory;

  const milestone = MILESTONES[state.age];
  if (milestone) return milestone;
  return storylineForState(state) || scenarioForState(state);
}
