import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { config } from './config.js';
import {
  COMMUNITY_INTERESTS, COMMUNITY_TEXT, INTERNSHIP_INTERESTS, INTERNSHIP_TEXT,
  REGISTRATION_TEXT, WELCOME_TEXT,
} from './content.js';
import {
  clearFlow, createGame, finishGame, getActiveGame, getAdminStats, getEvent, getFlow,
  getInstitutionLeaderboard, getLeaderboard, getOpenEvents, getRank, getUserProfile, isProfileComplete,
  saveApplication, saveGame, saveUserProfile, setFlow, upsertUser,
} from './db.js';
import { institutionByKey, normalizeInstitution, POPULAR_INSTITUTIONS } from './institutions.js';
import {
  applyChoice, currentEvent, formatCompactOutcome, formatFinanceLog, formatLastTurnDetails,
  formatState, newGameState,
} from './game/engine.js';
import { achievementsFor, lifeType, scoreGame } from './game/scoring.js';

export const bot = new Bot(config.botToken);

const ik = (rows) => Keyboard.inlineKeyboard(rows);
const cb = (text,payload) => Keyboard.button.callback(text,payload);

function eventButtonLabel(event) {
  const title=String(event.title||'Мероприятие').trim();
  return `🎉 ${title}`.slice(0,48);
}

function formatEventText(event) {
  const description=String(event?.description||'').trim();
  return [
    `🎉 ${event.title}`,
    '',
    description,
    '',
    `📅 ${event.date_label}`,
    `🕒 ${event.time_label}`,
    `📍 ${event.place}`,
  ].filter((line,index,lines)=>line!=='' || (index>0 && lines[index-1]!=='' && lines[index+1]!=='')).join('\n').replace(/\n{3,}/g,'\n\n').trim();
}

function buildMainKeyboard(events=[]) {
  const rows=[
    [cb('🎮 Игра «Жизнь»','game:menu')],
    [cb('🤝 Стать частью сообщества','info:community')],
  ];
  for (const event of events.slice(0,3)) rows.push([cb(eventButtonLabel(event),`event:open:${event.code}`)]);
  rows.push([cb('💼 Стажировка','info:internship')]);
  rows.push([cb('🏆 Рейтинг','top:global')]);
  return ik(rows);
}

async function mainKeyboard() {
  return buildMainKeyboard(await getOpenEvents());
}

const backKeyboard = () => ik([[cb('⬅️ Главное меню','menu')]]);

function infoKeyboard(kind) {
  const label=kind==='internship'?'🚀 Да, хочу на стажировку':'🤝 Да, хочу в команду';
  const rows=[[cb(label,`flow:start:${kind}`)]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ik(rows);
}

function eventInfoKeyboard(event) {
  const rows=[[cb('✅ Да, хочу на мероприятие',`flow:start:event:${event.code}`)]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ik(rows);
}

function contactKeyboard() {
  const rows=[[Keyboard.button.requestContact('📱 Поделиться контактом MAX')]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  return ik(rows);
}

function registrationInfoKeyboard() {
  if (!config.privacyUrl) return null;
  return ik([[Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]]);
}

function institutionKeyboard() {
  const rows=POPULAR_INSTITUTIONS.map((item)=>[cb(`🏫 ${item.label}`,`profile:institution:${item.key}`)]);
  rows.push([cb('🎓 Другое учебное заведение','profile:institution:other')]);
  rows.push([cb('— Сейчас не учусь','profile:institution:not_studying')]);
  return ik(rows);
}

function interestsKeyboard(dictionary,selected=[]) {
  const rows=Object.entries(dictionary).map(([key,label])=>[cb(`${selected.includes(key)?'✅':'▫️'} ${label}`,`interest:${key}`)]);
  rows.push([cb('Готово →','interest:done')]);
  rows.push([cb('⬅️ Отменить','menu')]);
  return ik(rows);
}

function topKeyboard() {
  return ik([
    [cb('🌍 Общий','top:global'),cb('🏫 Учебные заведения','top:institutions')],
    [cb('⬅️ Главное меню','menu')],
  ]);
}

function gameModeKeyboard() {
  return ik([
    [cb('⚡ Быстрая жизнь · ~17 решений','game:start:quick')],
    [cb('🧭 Полная жизнь · каждый год','game:start:classic')],
    [cb('⬅️ Назад','game:menu')],
  ]);
}

function applicationTitle(kind,event=null) {
  if (kind==='party') return `🎉 ${event?.title||'Регистрация на мероприятие'}`;
  if (kind==='internship') return '💼 Заявка на стажировку';
  return '🤝 Вступление в команду';
}

function applicationPrompt(kind) {
  if (kind==='party') return 'Выбери, что тебе интересно на мероприятии. Можно отметить несколько вариантов.';
  if (kind==='internship') return 'Выбери направления, которыми хочешь заниматься на стажировке. Можно несколько.';
  return 'Выбери, чем ты хочешь заниматься в команде и сообществе. Можно несколько направлений.';
}

async function applicationContext(flow) {
  if (flow.flow_type!=='party') {
    return {
      dictionary:flow.flow_type==='internship'?INTERNSHIP_INTERESTS:COMMUNITY_INTERESTS,
      event:null,
    };
  }
  const event=flow.data?.eventCode?await getEvent(flow.data.eventCode):null;
  return {dictionary:event?.interests||{},event};
}

async function ensureUser(ctx) {
  if (!ctx.user) throw new Error('MAX user is unavailable for this update');
  return upsertUser(ctx.user);
}

async function sendMessage(ctx,text,attachments=[],callback=false) {
  const message={text};
  if (attachments.length) message.attachments=attachments;
  return callback ? ctx.answerOnCallback({message}) : ctx.reply(text,attachments.length?{attachments}:undefined);
}

async function startProfileRegistration(ctx,userId,callback=false,afterAction=null) {
  await setFlow(userId,'profile','full_name',{afterAction});
  const privacy=registrationInfoKeyboard();
  return sendMessage(ctx,`${REGISTRATION_TEXT}\n\nШаг 1/3. Напиши ФИО полностью.`,privacy?[privacy]:[],callback);
}

async function showMenu(ctx,callback=false) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,callback,null);
  await clearFlow(userId);
  return sendMessage(ctx,WELCOME_TEXT,[await mainKeyboard()],callback);
}

async function showInfo(ctx,kind) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,true,kind);
  const text=kind==='community'?COMMUNITY_TEXT:INTERNSHIP_TEXT;
  return ctx.answerOnCallback({message:{text,attachments:[infoKeyboard(kind)]}});
}

async function showEvent(ctx,code) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,true,`event:${code}`);
  const event=await getEvent(code);
  if (!event || !event.registration_open) return ctx.answerOnCallback({message:{text:'Регистрация на это мероприятие сейчас недоступна.',attachments:[await mainKeyboard()]}});
  return ctx.answerOnCallback({message:{text:formatEventText(event),attachments:[eventInfoKeyboard(event)]}});
}

function cleanPhone(input='') {
  const digits=String(input).replace(/\D/g,'');
  if (digits.length<10 || digits.length>15) return null;
  return String(input).trim();
}

async function finishProfile(ctx,userId,data,institution,institutionKey=null) {
  await saveUserProfile({userId,fullName:data.fullName,phone:data.phone,institution,institutionKey});
  const afterAction=data.afterAction||null;
  await clearFlow(userId);
  return continueAfterProfile(ctx,userId,afterAction);
}

async function continueAfterProfile(ctx,userId,afterAction) {
  if (afterAction?.startsWith('event:')) return startApplicationMessage(ctx,userId,'party',afterAction.slice(6));
  if (['community','internship'].includes(afterAction)) return startApplicationMessage(ctx,userId,afterAction,null);
  if (afterAction==='game') return ctx.reply('✅ Профиль готов. Выбери режим игры.',{attachments:[gameModeKeyboard()]});
  return ctx.reply(`✅ Регистрация завершена!\n\n${WELCOME_TEXT}`,{attachments:[await mainKeyboard()]});
}

async function startApplicationMessage(ctx,userId,kind,eventCode=null) {
  const data={interests:[],eventCode};
  await setFlow(userId,kind,'interests',data);
  const flow={flow_type:kind,data};
  const {dictionary,event}=await applicationContext(flow);
  return ctx.reply(`${applicationTitle(kind,event)}\n\n${applicationPrompt(kind)}\n\nЛичные данные уже сохранены. Здесь нужно выбрать только то, чем ты хочешь заниматься или что тебе интересно.`,{
    attachments:[interestsKeyboard(dictionary,[])],
  });
}

async function startFlow(ctx,kind,eventCode=null) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  const afterAction=kind==='party'?`event:${eventCode}`:kind;
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,true,afterAction);
  const data={interests:[],eventCode};
  await setFlow(userId,kind,'interests',data);
  const {dictionary,event}=await applicationContext({flow_type:kind,data});
  return ctx.answerOnCallback({message:{
    text:`${applicationTitle(kind,event)}\n\n${applicationPrompt(kind)}\n\nФИО, телефон и учебное заведение повторно не спрашиваем.`,
    attachments:[interestsKeyboard(dictionary,[])],
  }});
}

async function handleFlowMessage(ctx,next) {
  const text=ctx.message?.body?.text?.trim()||'';
  if (text.startsWith('/')) return next();
  const userId=await ensureUser(ctx);
  const flow=await getFlow(userId);
  if (!flow) return next();
  const data=flow.data||{};

  if (flow.flow_type==='profile' && flow.step==='full_name') {
    if (text.length<5 || !text.includes(' ')) return ctx.reply('Напиши ФИО полностью: фамилию и имя, отчество — если оно есть.');
    data.fullName=text;
    await setFlow(userId,'profile','phone',data);
    return ctx.reply('Шаг 2/3. Номер печатать не нужно. Нажми «Поделиться контактом MAX».',{attachments:[contactKeyboard()]});
  }

  if (flow.flow_type==='profile' && flow.step==='phone') {
    const phone=cleanPhone(ctx.contactInfo?.tel||'');
    if (!phone) return ctx.reply('Для регистрации поделись контактом через кнопку MAX.',{attachments:[contactKeyboard()]});
    data.phone=phone;
    await setFlow(userId,'profile','institution',data);
    return ctx.reply('Шаг 3/3. Выбери учебное заведение. Если его нет в списке — нажми «Другое».',{attachments:[institutionKeyboard()]});
  }

  if (flow.flow_type==='profile' && flow.step==='institution') {
    if (!text) return ctx.reply('Выбери учебное заведение кнопкой или нажми «Другое».',{attachments:[institutionKeyboard()]});
    const normalized=normalizeInstitution(text);
    return finishProfile(ctx,userId,data,normalized.display,normalized.key);
  }

  if (flow.flow_type==='profile' && flow.step==='institution_custom') {
    if (text.length<2) return ctx.reply('Напиши полное или привычное название учебного заведения.');
    const normalized=normalizeInstitution(text);
    return finishProfile(ctx,userId,data,normalized.display,normalized.key);
  }

  if (flow.step==='interests') return ctx.reply('Здесь ничего печатать не нужно — выбери направления кнопками и нажми «Готово».');
  return next();
}

async function chooseInstitution(ctx,key) {
  const userId=await ensureUser(ctx);
  const flow=await getFlow(userId);
  if (!flow || flow.flow_type!=='profile' || flow.step!=='institution') return ctx.answerOnCallback({notification:'Этот шаг регистрации уже завершён.'});
  const data=flow.data||{};
  if (key==='other') {
    await setFlow(userId,'profile','institution_custom',data);
    return ctx.answerOnCallback({message:{text:'Напиши название университета, колледжа, школы или другого учебного заведения.'}});
  }
  if (key==='not_studying') {
    await ctx.answerOnCallback({notification:'Сохраняю профиль…'});
    return finishProfile(ctx,userId,data,'Не учусь','not_studying');
  }
  const institution=institutionByKey(key);
  if (!institution) return ctx.answerOnCallback({notification:'Неизвестное учебное заведение.'});
  await ctx.answerOnCallback({notification:'Сохраняю профиль…'});
  return finishProfile(ctx,userId,data,institution.full,institution.key);
}

async function toggleInterest(ctx,key) {
  const userId=await ensureUser(ctx);
  const flow=await getFlow(userId);
  if (!flow || flow.step!=='interests' || !['community','party','internship'].includes(flow.flow_type)) return ctx.answerOnCallback({notification:'Заявка уже завершена или отменена.'});
  const {dictionary,event}=await applicationContext(flow);
  if (!dictionary[key]) return ctx.answerOnCallback({notification:'Неизвестное направление'});
  const data=flow.data||{};
  const selected=new Set(data.interests||[]);
  selected.has(key)?selected.delete(key):selected.add(key);
  data.interests=[...selected];
  await setFlow(userId,flow.flow_type,'interests',data);
  return ctx.answerOnCallback({message:{
    text:`${applicationTitle(flow.flow_type,event)}\n\n${applicationPrompt(flow.flow_type)}\n\nВыбрано: ${data.interests.length}.`,
    attachments:[interestsKeyboard(dictionary,data.interests)],
  }});
}

async function completeInterests(ctx) {
  const userId=await ensureUser(ctx);
  const flow=await getFlow(userId);
  if (!flow || flow.step!=='interests' || !['community','party','internship'].includes(flow.flow_type)) return ctx.answerOnCallback({notification:'Заявка уже завершена или отменена.'});
  if (!(flow.data?.interests||[]).length) return ctx.answerOnCallback({notification:'Выбери хотя бы одно направление.'});
  await ctx.answerOnCallback({notification:'Сохраняем заявку…'});
  const event=flow.flow_type==='party'&&flow.data.eventCode?await getEvent(flow.data.eventCode):null;
  await saveApplication({userId,kind:flow.flow_type,interests:flow.data.interests,eventCode:flow.data.eventCode||null});
  await clearFlow(userId);
  let text='✅ Готово! Заявка сохранена.';
  if (flow.flow_type==='party'&&event) text+=`\n\n🎉 Ждём тебя ${event.date_label}, старт в ${event.time_label}.\n📍 ${event.place}`;
  if (flow.flow_type==='internship') text+='\n\n💼 Мы посмотрим выбранные направления и подберём подходящие реальные задачи.';
  if (flow.flow_type==='community') text+='\n\n🤝 Теперь понятно, чем тебе интересно заниматься — будем звать в подходящие проекты и команды.';
  return ctx.reply(text,{attachments:[await mainKeyboard()]});
}

async function requireProfileForCallback(ctx,afterAction=null) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (isProfileComplete(profile)) return userId;
  await startProfileRegistration(ctx,userId,true,afterAction);
  return null;
}

async function gameMenu(ctx) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const active=await getActiveGame(userId);
  const rows=[];
  if (active) rows.push([cb(`▶️ Продолжить · ${active.age} лет`,'game:continue')]);
  rows.push([cb(active?'🔄 Начать другую жизнь':'⚡ Быстрая жизнь · ~17 решений','game:mode')]);
  if (!active) rows.push([cb('🧭 Полная жизнь · каждый год','game:start:classic')]);
  rows.push([cb('🏆 Рейтинг','top:global')]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  const text='🎮 ИГРА «ЖИЗНЬ»\n\nВ каждом эпизоде ты принимаешь решение. Прямые расходы видны заранее на кнопке. После выбора бот показывает только главное, а полный расчёт доступен по кнопке «Подробнее».\n\n⚡ Быстрый режим — около 17 ключевых решений.\n🧭 Полный режим — один ход на каждый год.';
  return ctx.answerOnCallback({message:{text,attachments:[ik(rows)]}});
}

async function showGameMode(ctx) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  return ctx.answerOnCallback({message:{text:'Выбери режим новой жизни:',attachments:[gameModeKeyboard()]}});
}

async function startGameByMode(ctx,mode) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const active=await getActiveGame(userId);
  if (active) {
    return ctx.answerOnCallback({message:{
      text:'У тебя есть незавершённая жизнь. Начать новую и закрыть текущую?',
      attachments:[ik([[cb('Да, начать новую',`game:restart:${mode}`)],[cb('Нет, продолжить','game:continue')]])],
    }});
  }
  const game=await createGame(userId,newGameState({mode}));
  return renderTurn(ctx,game,true);
}

async function restartGame(ctx,mode) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game=await createGame(userId,newGameState({mode}));
  return renderTurn(ctx,game,true);
}

function turnKeyboard(gameId,event) {
  return ik(event.choices.map((choice,index)=>[cb(choice.text,`game:choice:${gameId}:${event.id}:${index}`)]));
}

function compactTurnHeader(state,score) {
  return `📅 ${state.age} лет · ⚡ ${Math.round(state.energy??75)}/100 · 💰 ${Math.round(state.money||0).toLocaleString('ru-RU')} ₽ · ❤️ ${Math.round(state.health||0)}/100 · ⭐ ${score}`;
}

async function renderTurn(ctx,game,callback=true) {
  const state=game.state;
  const event=currentEvent(state);
  const score=scoreGame(state);
  await saveGame(game.id,state,game.event_history||[],score);
  const text=`${compactTurnHeader(state,score)}\n\n🎲 ${event.title}\n${event.text}\n\n💸 Прямые траты и доходы видны на кнопках до выбора.\n⏱ Число времени показывает нагрузку решения.`;
  const message={text,attachments:[turnKeyboard(game.id,event)]};
  return callback?ctx.answerOnCallback({message}):ctx.reply(text,{attachments:message.attachments});
}

async function continueGame(ctx) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game=await getActiveGame(userId);
  if (!game) return ctx.answerOnCallback({message:{text:'Активной игры нет. Начнём новую?',attachments:[gameModeKeyboard()]}});
  return renderTurn(ctx,game,true);
}

async function chooseGame(ctx,gameId,eventId,choiceIndex) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game=await getActiveGame(userId);
  if (!game || String(game.id)!==String(gameId)) return ctx.answerOnCallback({notification:'Эта партия уже не активна.'});
  const state=game.state;
  const event=currentEvent(state);
  if (event.id!==eventId) return ctx.answerOnCallback({notification:'Этот ход уже завершён.'});
  const ageBefore=state.age;
  const index=Number(choiceIndex);
  const outcome=applyChoice(state,event,index);
  const history=[...(game.event_history||[]),{age:ageBefore,eventId,choice:index,mode:state.mode}];

  if (outcome.finished) {
    const score=outcome.score;
    await finishGame(game.id,state,history,score);
    const ach=achievementsFor(state);
    const type=lifeType(state);
    const rank=await getRank(userId);
    const rankText=rank?`\n🏆 Место в рейтинге: ${rank.rank} из ${rank.total}`:'';
    return ctx.answerOnCallback({message:{
      text:`🏁 Жизнь завершена\n\n✅ ${outcome.result}\n\n${formatCompactOutcome(outcome)}\n\n${formatState(state,score)}\n\n🧭 Тип жизни: ${type}\n🏅 Достижения: ${ach.length?ach.join(', '):'пока без особых достижений'}${rankText}`,
      attachments:[ik([[cb('🏆 Рейтинг','top:global')],[cb('🔄 Прожить другую жизнь','game:mode')],[cb('⬅️ Главное меню','menu')]])],
    }});
  }

  await saveGame(game.id,state,history,outcome.score);
  return ctx.answerOnCallback({message:{
    text:`✅ ${outcome.result}\n\n${formatCompactOutcome(outcome)}`,
    attachments:[ik([
      [cb('➡️ Следующий этап','game:continue')],
      [cb('📋 Подробнее о расчёте','game:details'),cb('📊 Показатели','game:stats')],
    ])],
  }});
}

async function showGameDetails(ctx) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game=await getActiveGame(userId);
  if (!game) return ctx.answerOnCallback({notification:'Активной игры нет.'});
  return ctx.answerOnCallback({message:{
    text:formatLastTurnDetails(game.state.lastTurn),
    attachments:[ik([[cb('➡️ Следующий этап','game:continue')],[cb('📊 Показатели','game:stats')]])],
  }});
}

async function showGameStats(ctx) {
  const userId=await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game=await getActiveGame(userId);
  if (!game) return ctx.answerOnCallback({notification:'Активной игры нет.'});
  const score=scoreGame(game.state);
  return ctx.answerOnCallback({message:{
    text:`📊 Твои показатели\n\n${formatState(game.state,score)}\n\n${formatFinanceLog(game.state,6)}`,
    attachments:[ik([[cb('➡️ К следующему этапу','game:continue')],[cb('📋 Последний расчёт','game:details')]])],
  }});
}

async function showTop(ctx,mode) {
  const userId=await requireProfileForCallback(ctx,null);
  if (!userId) return;
  let text;
  if (mode==='institutions') {
    const rows=await getInstitutionLeaderboard(10);
    text='🏫 Рейтинг учебных заведений\n\n'+(rows.length?rows.map((r,i)=>`${i+1}. ${r.institution} — ${r.score} ⭐ (${r.players} игр.)`).join('\n'):'Пока недостаточно завершённых игр.');
  } else {
    const rows=await getLeaderboard(10);
    const mine=await getRank(userId);
    text='🏆 Общий рейтинг\n\n'+(rows.length?rows.map((r,i)=>`${i+1}. ${r.name} — ${r.score} ⭐`).join('\n'):'Пока никто не завершил игру.');
    if (mine) text+=`\n\nТвой лучший результат: ${mine.score} ⭐\nТвоё место: ${mine.rank} из ${mine.total}`;
  }
  return ctx.answerOnCallback({message:{text,attachments:[topKeyboard()]}});
}

bot.api.setMyCommands([
  {name:'start',description:'Главное меню'},
  {name:'game',description:'Игра «Жизнь»'},
  {name:'top',description:'Рейтинг игроков'},
]);

bot.on('bot_started',(ctx)=>showMenu(ctx,false));
bot.command('start',(ctx)=>showMenu(ctx,false));
bot.command('menu',(ctx)=>showMenu(ctx,false));
bot.command('game',async(ctx)=>{
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,false,'game');
  const active=await getActiveGame(userId);
  const rows=[];
  if (active) rows.push([cb(`▶️ Продолжить · ${active.age} лет`,'game:continue')]);
  rows.push([cb('🎮 Открыть игру','game:menu')]);
  return ctx.reply('🎮 Игра «Жизнь»',{attachments:[ik(rows)]});
});
bot.command('top',async(ctx)=>{
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,false,null);
  return ctx.reply('🏆 Открой рейтинг кнопкой:',{attachments:[topKeyboard()]});
});
bot.command('stats',async(ctx)=>{
  const userId=await ensureUser(ctx);
  if (!config.adminIds.has(userId)) return ctx.reply('Команда доступна только администраторам.');
  const s=await getAdminStats();
  const events=await getOpenEvents();
  return ctx.reply(`📊 Статистика\nПользователи: ${s.users}\nЗарегистрированные профили: ${s.registered_users}\nСообщество: ${s.community}\nМероприятия: ${s.party}\nСтажировки: ${s.internships}\nОткрытых событий: ${events.length}\nЗавершённые игры: ${s.finished_games}`);
});

bot.action('menu',(ctx)=>showMenu(ctx,true));
bot.action('info:community',(ctx)=>showInfo(ctx,'community'));
bot.action('info:internship',(ctx)=>showInfo(ctx,'internship'));
bot.action('info:party',async(ctx)=>{const events=await getOpenEvents(); return events[0]?showEvent(ctx,events[0].code):ctx.answerOnCallback({notification:'Открытых мероприятий сейчас нет.'});});
bot.action(/^event:open:(.+)$/,(ctx)=>showEvent(ctx,ctx.match[1]));
bot.action(/flow:start:(community|internship)/,(ctx)=>startFlow(ctx,ctx.match[1],null));
bot.action(/^flow:start:event:(.+)$/,(ctx)=>startFlow(ctx,'party',ctx.match[1]));
bot.action(/^profile:institution:(.+)$/,(ctx)=>chooseInstitution(ctx,ctx.match[1]));
bot.action(/interest:(.+)/,(ctx)=>ctx.match[1]==='done'?completeInterests(ctx):toggleInterest(ctx,ctx.match[1]));
bot.action('game:menu',(ctx)=>gameMenu(ctx));
bot.action('game:mode',(ctx)=>showGameMode(ctx));
bot.action(/^game:start:(quick|classic)$/,(ctx)=>startGameByMode(ctx,ctx.match[1]));
bot.action(/^game:restart:(quick|classic)$/,(ctx)=>restartGame(ctx,ctx.match[1]));
bot.action('game:new',(ctx)=>showGameMode(ctx));
bot.action('game:restart',(ctx)=>showGameMode(ctx));
bot.action('game:continue',(ctx)=>continueGame(ctx));
bot.action('game:details',(ctx)=>showGameDetails(ctx));
bot.action('game:stats',(ctx)=>showGameStats(ctx));
bot.action(/^game:choice:(\d+):(.+):([0-3])$/,(ctx)=>chooseGame(ctx,ctx.match[1],ctx.match[2],ctx.match[3]));
bot.action('top:global',(ctx)=>showTop(ctx,'global'));
bot.action('top:institutions',(ctx)=>showTop(ctx,'institutions'));
bot.on('message_created',handleFlowMessage);
