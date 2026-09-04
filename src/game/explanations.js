const stripAction = (text='') => text
  .replace(/[\u{1F000}-\u{1FAFF}\u2600-\u27BF]/gu,'')
  .replace(/·\s*🎲\s*\d+%/g,'')
  .replace(/·\s*⏱\s*\d+/g,'')
  .replace(/·\s*(💸|💰)\s*[+−-]?\s*[\d\s ]+\s*₽/g,'')
  .trim();

const rub=(value)=>Math.abs(Math.round(Number(value)||0)).toLocaleString('ru-RU');

function fallbackReason(key,value,choice) {
  const positive=Number(value)>0;
  const action=stripAction(choice?.text || 'выбранное действие');
  const amount=Number(value)||0;
  const reasons={
    money: positive
      ? `Доход по действию «${action}»: +${rub(amount)} ₽.`
      : `Расход по действию «${action}»: -${rub(amount)} ₽.`,
    health: positive
      ? `«${action}» улучшило восстановление или снизило нагрузку на организм.`
      : `«${action}» добавило нагрузку на организм или ухудшило восстановление.`,
    happiness: positive
      ? `«${action}» добавило удовлетворение, свободу или приятный опыт.`
      : `«${action}» уменьшило комфорт или ощущение контроля.`,
    skills: positive
      ? `«${action}» дало практику, обучение или новый опыт.`
      : `«${action}» сократило практику или актуальность навыков.`,
    reputation: positive
      ? `После действия «${action}» выросло доверие к твоей работе и решениям.`
      : `После действия «${action}» доверие к твоей надёжности снизилось.`,
    career: positive
      ? `«${action}» приблизило к большей ответственности и следующей карьерной ступени.`
      : `«${action}» отдалило от текущей карьерной траектории.`,
    relationships: positive
      ? `«${action}» добавило времени и внимания отношениям.`
      : `«${action}» оставило меньше времени или внимания для близких.`,
    stress: positive
      ? `«${action}» добавило сроков, нагрузки или ответственности.`
      : `«${action}» уменьшило нагрузку и вернуло больше контроля.`,
    financialLiteracy: positive
      ? `В этом решении ты разобрался в деньгах, рисках или планировании.`
      : `Это решение ухудшило финансовую дисциплину.`,
    socialCapital: positive
      ? `«${action}» расширило или укрепило круг полезных контактов.`
      : `«${action}» ослабило часть полезных связей.`,
    entrepreneurship: positive
      ? `В действии «${action}» ты сам отвечал за идею, ресурсы или результат.`
      : `«${action}» уменьшило участие в самостоятельных проектах.`,
    addiction: positive
      ? `После этого эпизода появился риск повторения и закрепления привычки.`
      : `Риск закрепления вредной привычки снизился.`,
    risk: positive
      ? `В действии «${action}» больше неопределённости и риска неудачи.`
      : `«${action}» сделало ситуацию более предсказуемой.`,
    debt: positive
      ? `Доступных денег не хватило, поэтому часть расходов перешла в долг.`
      : `Часть долга была погашена.`,
  };
  return reasons[key] || choice?.result || 'Прямое последствие выбранного действия.';
}

const EVENT_REASONS={
  'school-finish':[
    {
      skills:'Регулярная подготовка, пробные задания и учебные материалы дали больше практики перед поступлением.',
      stress:'К обычной учёбе добавились дополнительные занятия и подготовка к экзаменам.',
      money:'5 000 ₽ ушли на учебные материалы, пробные тесты и подготовку к поступлению.',
    },
    {
      skills:'Ты изучал прикладные программы и требования колледжей и получил больше практического контекста.',
      happiness:'Появился более понятный и прикладной маршрут после школы.',
    },
    {
      money:'Это первые деньги, которые ты заработал на подработке.',
      career:'Ты получил первый рабочий опыт и ответственность за реальные задачи.',
      skills:'Работа дала базовую практику общения, сроков и выполнения задач.',
    },
    {
      entrepreneurship:'Ты самостоятельно отвечал за идею и первые решения собственного проекта.',
      skills:'Пришлось учиться делать реальный продукт, а не только изучать теорию.',
      money:'8 000 ₽ ушли на материалы, сервисы и первые расходы проекта.',
      risk:'У собственного проекта нет гарантированного результата.',
    },
  ],
  'vape-offer':[
    {
      health:'Ты не стал подвергать организм воздействию вейпа.',
      reputation:'Ты спокойно обозначил личные границы и не поддался давлению компании.',
    },
    {
      socialCapital:'Ты избежал конфликта и сохранил нормальное общение с компанией.',
      happiness:'Ситуация закончилась без ссоры и лишнего напряжения.',
    },
    {
      health:'Ты вышел из ситуации и не стал пробовать вейп.',
      stress:'Ты прекратил неприятное давление со стороны компании.',
    },
    {
      happiness:'Любопытство дало кратковременное ощущение участия в общей активности.',
      health:'Разовая проба немного ухудшила самочувствие.',
      addiction:'После одного эпизода появился риск повторения и закрепления привычки.',
    },
  ],
};

export function choiceEffectReason(event,choiceIndex,key,value,choice) {
  if (choice?.reasons?.[key]) return choice.reasons[key];
  const eventReason=EVENT_REASONS[event?.id]?.[choiceIndex]?.[key];
  return eventReason || fallbackReason(key,value,choice);
}

export function hydrateEventReasons(event) {
  if (!event?.choices) return event;
  return {
    ...event,
    choices:event.choices.map((choice,choiceIndex)=>{
      const reasons={...(choice.reasons||{})};
      for (const [key,value] of Object.entries(choice.effects||{})) {
        if (Number(value)===0 || reasons[key]) continue;
        reasons[key]=choiceEffectReason(event,choiceIndex,key,Number(value),{...choice,reasons});
      }
      return {...choice,reasons};
    }),
  };
}

export function decorateChoiceCosts(event) {
  if (!event?.choices) return event;
  return {
    ...event,
    choices:event.choices.map((choice)=>{
      if (/(💸|💰)\s*[+−-]?\s*[\d\s ]+\s*₽/.test(choice.text)) return choice;
      const money=Number(choice.effects?.money||0);
      if (!money) return choice;
      const marker=money<0?`💸 ${rub(money)} ₽`:`💰 +${rub(money)} ₽`;
      return {...choice,text:`${choice.text} · ${marker}`};
    }),
  };
}

export function clarifyEventContent(event) {
  if (!event) return event;

  if (event.id==='school-finish') {
    return {
      ...event,
      text:'Тебе 16. Школа подходит к концу. Если готовиться к вузу, понадобятся дополнительные занятия, пробные задания и учебные материалы. Прямые расходы видны на кнопках до выбора.',
      choices:event.choices.map((choice,index)=>index===0 ? {
        ...choice,
        result:'Ты начал регулярно готовиться к поступлению: купил учебные материалы и пробные тесты на 5 000 ₽. Подготовка дала больше практики, но добавила нагрузку к обычной учёбе.',
      } : choice),
    };
  }

  if (event.id==='vape-offer') {
    return {
      ...event,
      title:'Предлагают попробовать вейп',
      text:'На встрече знакомые предлагают бесплатно попробовать вейп и говорят: «Один раз ничего не будет». Денег за разовую пробу ты не платишь. Выбор влияет на самочувствие, личные границы и риск повторения.',
      choices:event.choices.map((choice,index)=>{
        const labels=['🙅 Спокойно отказаться','🗣 Перевести разговор на другую тему','🚶 Уйти из ситуации','💨 Попробовать один раз'];
        if (index!==3) return {...choice,text:labels[index]||choice.text};
        const effects={...(choice.effects||{})};
        delete effects.money;
        return {
          ...choice,
          text:labels[index],
          effects,
          result:'Ты согласился попробовать один раз. Денег это не стоило — вейп предложили знакомые. В игре это немного снижает здоровье и создаёт риск повторения.',
        };
      }),
    };
  }

  return event;
}
