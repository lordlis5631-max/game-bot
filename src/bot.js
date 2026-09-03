import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { config } from './config.js';
import {
  COMMUNITY_INTERESTS, COMMUNITY_TEXT, INTERNSHIP_INTERESTS, INTERNSHIP_TEXT,
  PARTY_INTERESTS, PARTY_TEXT, REGISTRATION_TEXT, WELCOME_TEXT,
} from './content.js';
import {
  clearFlow, createGame, finishGame, getActiveGame, getAdminStats, getFlow,
  getInstitutionLeaderboard, getLeaderboard, getRank, getUserProfile, isProfileComplete,
  saveApplication, saveGame, saveUserProfile, setFlow, upsertUser,
} from './db.js';
import { applyChoice, currentEvent, formatDeltas, formatState, newGameState } from './game/engine.js';
import { applyTimeAndEnergy, decorateTimeChoices, formatTimeEnergyOutcome, timeEnergySummary } from './game/energy.js';
import { achievementsFor, lifeType, scoreGame } from './game/scoring.js';

export const bot = new Bot(config.botToken);

const ik = (rows) => Keyboard.inlineKeyboard(rows);
const cb = (text,payload) => Keyboard.button.callback(text,payload);

const mainKeyboard = () => ik([
  [cb('🎮 Игра «Жизнь»','game:menu')],
  [cb('🤝 Стать частью сообщества','info:community')],
  [cb('🎉 Тусовка 18 сентября','info:party')],
  [cb('💼 Стажировка','info:internship')],
  [cb('🏆 Рейтинг','top:global')],
]);

const backKeyboard = () => ik([[cb('⬅️ Главное меню','menu')]]);

function infoKeyboard(kind) {
  const label = kind==='party'
    ? '✅ Да, хочу на мероприятие'
    : kind==='internship'
      ? '🚀 Да, хочу на стажировку'
      : '🤝 Да, хочу в команду';
  const rows = [[cb(label,`flow:start:${kind}`)]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ik(rows);
}

function contactKeyboard() {
  const rows = [[Keyboard.button.requestContact('📱 Поделиться контактом MAX')]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  return ik(rows);
}

function registrationInfoKeyboard() {
  if (!config.privacyUrl) return null;
  return ik([[Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]]);
}

function interestsKeyboard(dictionary,selected=[]) {
  const rows = Object.entries(dictionary).map(([key,label]) => [cb(`${selected.includes(key)?'✅':'▫️'} ${label}`,`interest:${key}`)]);
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

function applicationDictionary(kind) {
  if (kind==='party') return PARTY_INTERESTS;
  if (kind==='internship') return INTERNSHIP_INTERESTS;
  return COMMUNITY_INTERESTS;
}

function applicationTitle(kind) {
  if (kind==='party') return '🎉 Регистрация на мероприятие';
  if (kind==='internship') return '💼 Заявка на стажировку';
  return '🤝 Вступление в команду';
}

function applicationPrompt(kind) {
  if (kind==='party') return 'Выбери, что тебе интереснее всего на встрече. Можно отметить несколько вариантов.';
  if (kind==='internship') return 'Выбери направления, которыми хочешь заниматься на стажировке. Можно несколько.';
  return 'Выбери, чем ты хочешь заниматься в команде и сообществе. Можно несколько направлений.';
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
  const attachments=privacy?[privacy]:[];
  return sendMessage(ctx,`${REGISTRATION_TEXT}\n\nШаг 1/3. Напиши ФИО полностью.`,attachments,callback);
}

async function showMenu(ctx, callback=false) {
  const userId = await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,callback,null);
  await clearFlow(userId);
  return sendMessage(ctx,WELCOME_TEXT,[mainKeyboard()],callback);
}

async function showInfo(ctx,kind) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,true,null);
  let text;
  if (kind==='community') text=COMMUNITY_TEXT;
  else if (kind==='party') text=PARTY_TEXT(config.party);
  else text=INTERNSHIP_TEXT;
  return ctx.answerOnCallback({message:{text,attachments:[infoKeyboard(kind)]}});
}

async function startApplicationMessage(ctx,userId,kind) {
  await setFlow(userId,kind,'interests',{interests:[]});
  const dict=applicationDictionary(kind);
  return ctx.reply(`${applicationTitle(kind)}\n\n${applicationPrompt(kind)}\n\nФИО, телефон и учебное заведение уже взяты из твоего профиля — повторно вводить их не нужно.`,{
    attachments:[interestsKeyboard(dict,[])],
  });
}

async function continueAfterProfile(ctx,userId,afterAction) {
  if (['community','party','internship'].includes(afterAction)) return startApplicationMessage(ctx,userId,afterAction);
  if (afterAction==='game') {
    return ctx.reply('✅ Профиль готов. Теперь можно начинать игру.',{attachments:[ik([[cb('🎮 Открыть игру','game:menu')],[cb('⬅️ Главное меню','menu')]])]});
  }
  return ctx.reply(`✅ Регистрация завершена!\n\n${WELCOME_TEXT}`,{attachments:[mainKeyboard()]});
}

async function startFlow(ctx,flowType) {
  const userId = await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (!isProfileComplete(profile)) return startProfileRegistration(ctx,userId,true,flowType);
  await setFlow(userId,flowType,'interests',{interests:[]});
  const dict=applicationDictionary(flowType);
  return ctx.answerOnCallback({message:{
    text:`${applicationTitle(flowType)}\n\n${applicationPrompt(flowType)}\n\nЛичные данные уже сохранены в профиле. Здесь нужно выбрать только интересующие направления.`,
    attachments:[interestsKeyboard(dict,[])],
  }});
}

function cleanPhone(input='') {
  const digits = String(input).replace(/\D/g,'');
  if (digits.length<10 || digits.length>15) return null;
  return String(input).trim();
}

async function finishApplication(ctx,userId,flow,data) {
  const kind = flow.flow_type;
  const eventCode = kind==='party' ? 'party-2026-09-18' : null;
  await saveApplication({userId,kind,interests:data.interests || [],eventCode});
  await clearFlow(userId);
  let text='✅ Готово! Заявка сохранена. ФИО, контакт и учебное заведение взяты из твоего единого профиля.';
  if (kind==='party') text += `\n\n🎉 Ждём тебя ${config.party.date}, старт в ${config.party.time}.\n📍 ${config.party.place}`;
  if (kind==='internship') text += '\n\n💼 Мы посмотрим выбранные направления и постараемся подобрать реальные задачи, на которых можно получить опыт и кейсы в портфолио.';
  if (kind==='community') text += '\n\n🤝 Добро пожаловать! Теперь понятно, чем тебе интересно заниматься — будем звать в подходящие проекты, игротеки, события и команды.';
  return ctx.reply(text,{attachments:[mainKeyboard()]});
}

async function handleFlowMessage(ctx,next) {
  const text = ctx.message?.body?.text?.trim() || '';
  if (text.startsWith('/')) return next();
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow) return next();
  const data = flow.data || {};

  if (flow.flow_type==='profile' && flow.step==='full_name') {
    if (text.length<5 || !text.includes(' ')) return ctx.reply('Напиши, пожалуйста, ФИО полностью — фамилию, имя и отчество (если оно есть).');
    data.fullName=text;
    await setFlow(userId,'profile','phone',data);
    return ctx.reply('Шаг 2/3. Номер печатать не нужно. Нажми кнопку «Поделиться контактом MAX» — бот получит номер, привязанный к твоему аккаунту.',{attachments:[contactKeyboard()]});
  }

  if (flow.flow_type==='profile' && flow.step==='phone') {
    const phone = cleanPhone(ctx.contactInfo?.tel || '');
    if (!phone) return ctx.reply('Для регистрации нужно именно поделиться контактом через кнопку MAX. Вручную номер вводить не нужно.',{attachments:[contactKeyboard()]});
    data.phone=phone;
    await setFlow(userId,'profile','institution',data);
    return ctx.reply('Шаг 3/3. Напиши название университета, колледжа, школы или другого учебного заведения. Если сейчас нигде не учишься — напиши «не учусь».');
  }

  if (flow.flow_type==='profile' && flow.step==='institution') {
    if (text.length<2) return ctx.reply('Напиши название учебного заведения или «не учусь».');
    data.institution=text;
    await saveUserProfile({userId,fullName:data.fullName,phone:data.phone,institution:data.institution});
    const afterAction=data.afterAction || null;
    await clearFlow(userId);
    return continueAfterProfile(ctx,userId,afterAction);
  }

  if (flow.step==='interests') return ctx.reply('Здесь ничего печатать не нужно — выбери подходящие направления кнопками в предыдущем сообщении и нажми «Готово».');
  return next();
}

async function toggleInterest(ctx,key) {
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow || flow.step!=='interests' || !['community','party','internship'].includes(flow.flow_type)) {
    return ctx.answerOnCallback({notification:'Заявка уже завершена или была отменена.'});
  }
  const dict = applicationDictionary(flow.flow_type);
  if (!dict[key]) return ctx.answerOnCallback({notification:'Неизвестное направление'});
  const data = flow.data || {};
  const selected = new Set(data.interests || []);
  selected.has(key) ? selected.delete(key) : selected.add(key);
  data.interests=[...selected];
  await setFlow(userId,flow.flow_type,'interests',data);
  return ctx.answerOnCallback({message:{
    text:`${applicationTitle(flow.flow_type)}\n\n${applicationPrompt(flow.flow_type)}\n\nВыбрано: ${data.interests.length}. После выбора нажми «Готово».`,
    attachments:[interestsKeyboard(dict,data.interests)],
  }});
}

async function completeInterests(ctx) {
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow || flow.step!=='interests' || !['community','party','internship'].includes(flow.flow_type)) {
    return ctx.answerOnCallback({notification:'Заявка уже завершена или была отменена.'});
  }
  if (!(flow.data?.interests || []).length) return ctx.answerOnCallback({notification:'Выбери хотя бы одно направление.'});
  await ctx.answerOnCallback({notification:'Сохраняем заявку…'});
  return finishApplication(ctx,userId,flow,flow.data);
}

async function requireProfileForCallback(ctx,afterAction=null) {
  const userId=await ensureUser(ctx);
  const profile=await getUserProfile(userId);
  if (isProfileComplete(profile)) return userId;
  await startProfileRegistration(ctx,userId,true,afterAction);
  return null;
}

async function gameMenu(ctx) {
  const userId = await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const active = await getActiveGame(userId);
  const rows=[];
  if (active) rows.push([cb(`▶️ Продолжить: ${active.age} лет`,'game:continue')]);
  rows.push([cb(active?'🔄 Начать жизнь заново':'▶️ Начать жизнь','game:new')]);
  rows.push([cb('🏆 Рейтинг','top:global')]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ctx.answerOnCallback({message:{text:'🎮 ИГРА «ЖИЗНЬ»\n\nОдин ход = один год жизни. Игра начинается в 16 лет и заканчивается в 60. Каждый год ты выбираешь одно из четырёх действий.\n\nТеперь у тебя есть ещё два ограниченных ресурса: ⚡ энергия и 🕒 время. Работа, проекты, близкие люди и высокая ответственность занимают часть года. Если выбранное действие не помещается в оставшееся время, растут усталость и стресс.\n\nЦель — набрать как можно больше очков и построить жизнь, которая не развалится от перегрузки.',attachments:[ik(rows)]}});
}

function freshGameState() {
  return {...newGameState(),energy:75};
}

async function newGame(ctx) {
  const userId = await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const active = await getActiveGame(userId);
  if (active) return ctx.answerOnCallback({message:{text:'У тебя уже есть незавершённая жизнь. Начать заново? Текущая партия будет закрыта.',attachments:[ik([[cb('Да, начать заново','game:restart')],[cb('Нет, продолжить','game:continue')]])]}});
  const game = await createGame(userId,freshGameState());
  return renderTurn(ctx,game,true);
}

async function restartGame(ctx) {
  const userId = await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game = await createGame(userId,freshGameState());
  return renderTurn(ctx,game,true);
}

function turnKeyboard(gameId,event) {
  return ik(event.choices.map((choice,index)=>[cb(choice.text,`game:choice:${gameId}:${event.id}:${index}`)]));
}

async function renderTurn(ctx,game,callback=true) {
  const state=game.state;
  if (!Number.isFinite(Number(state.energy))) state.energy=75;
  const event=decorateTimeChoices(currentEvent(state),state);
  const score=scoreGame(state);
  await saveGame(game.id,state,game.event_history || [],score);
  const text=`📅 ${state.age} лет\n\n${formatState(state,score)}\n${timeEnergySummary(state)}\n\n🎲 ${event.title}\n${event.text}\n\n⏱ Число на кнопке — сколько единиц времени потребует решение в этом году.\nЧто выберешь?`;
  const message={text,attachments:[turnKeyboard(game.id,event)]};
  return callback ? ctx.answerOnCallback({message}) : ctx.reply(text,{attachments:message.attachments});
}

async function continueGame(ctx) {
  const userId = await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game = await getActiveGame(userId);
  if (!game) return ctx.answerOnCallback({message:{text:'Активной игры нет. Начнём новую?',attachments:[ik([[cb('▶️ Начать','game:new')],[cb('⬅️ Меню','menu')]])]}});
  return renderTurn(ctx,game,true);
}

async function chooseGame(ctx,gameId,eventId,choiceIndex) {
  const userId = await requireProfileForCallback(ctx,'game');
  if (!userId) return;
  const game = await getActiveGame(userId);
  if (!game || String(game.id)!==String(gameId)) return ctx.answerOnCallback({notification:'Эта партия уже не активна.'});
  const state=game.state;
  if (!Number.isFinite(Number(state.energy))) state.energy=75;
  const beforeTurn=structuredClone(state);
  const event=decorateTimeChoices(currentEvent(state),state);
  if (event.id!==eventId) return ctx.answerOnCallback({notification:'Этот ход уже завершён.'});
  const ageBefore=state.age;
  const choiceIndexNumber=Number(choiceIndex);
  const outcome=applyChoice(state,event,choiceIndexNumber);
  const timeEnergy=applyTimeAndEnergy(state,event.choices[choiceIndexNumber],beforeTurn);
  outcome.score=scoreGame(state);
  const history=[...(game.event_history || []),{age:ageBefore,eventId,choice:choiceIndexNumber}];

  if (outcome.finished) {
    const score=outcome.score;
    await finishGame(game.id,state,history,score);
    const ach=achievementsFor(state);
    const type=lifeType(state);
    const rank=await getRank(userId);
    const rankText=rank ? `\n🏆 Место в рейтинге: ${rank.rank} из ${rank.total}` : '';
    return ctx.answerOnCallback({message:{text:`🏁 Жизнь завершена\n\n${outcome.result}\n\n${formatTimeEnergyOutcome(timeEnergy)}\n\n${formatState(state,score)}\n${timeEnergySummary(state)}\n\n🧭 Тип жизни: ${type}\n🏅 Достижения: ${ach.length?ach.join(', '):'пока без особых достижений'}${rankText}\n\nИтог: ⭐ ${score} очков`,attachments:[ik([[cb('🏆 Рейтинг','top:global')],[cb('🔄 Прожить другую жизнь','game:restart')],[cb('⬅️ Главное меню','menu')]])]}});
  }

  await saveGame(game.id,state,history,outcome.score);
  const deltas=formatDeltas(outcome.deltas);
  const timeText=formatTimeEnergyOutcome(timeEnergy);
  return ctx.answerOnCallback({message:{text:`✅ ${outcome.result}\n\n${deltas || 'Характеристики почти не изменились.'}\n\n${timeText}\n\nТебе исполнилось ${state.age}.\n⚡ Энергия: ${state.energy}/100\n⭐ Текущие очки: ${outcome.score}`,attachments:[ik([[cb('➡️ Следующий год','game:continue')],[cb('📊 Показатели','game:continue')]])]}});
}

async function showTop(ctx,mode) {
  const userId = await requireProfileForCallback(ctx,null);
  if (!userId) return;
  let text;
  if (mode==='institutions') {
    const rows=await getInstitutionLeaderboard(10);
    text='🏫 Рейтинг учебных заведений\n\n'+(rows.length?rows.map((r,i)=>`${i+1}. ${r.institution} — ${r.score} ⭐ (${r.players} игр.)`).join('\n'):'Пока недостаточно завершённых игр с указанным учебным заведением.');
  } else {
    const rows=await getLeaderboard(10);
    const mine=await getRank(userId);
    text='🏆 Общий рейтинг\n\n'+(rows.length?rows.map((r,i)=>`${i+1}. ${r.name} — ${r.score} ⭐`).join('\n'):'Пока никто не завершил игру. Будь первым!');
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
  if(active) rows.push([cb(`▶️ Продолжить: ${active.age} лет`,'game:continue')]);
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
  if(!config.adminIds.has(userId)) return ctx.reply('Команда доступна только администраторам.');
  const s=await getAdminStats();
  return ctx.reply(`📊 Статистика\nПользователи: ${s.users}\nЗарегистрированные профили: ${s.registered_users}\nСообщество: ${s.community}\nТусовка: ${s.party}\nСтажировки: ${s.internships}\nЗавершённые игры: ${s.finished_games}`);
});

bot.action('menu',(ctx)=>showMenu(ctx,true));
bot.action('info:community',(ctx)=>showInfo(ctx,'community'));
bot.action('info:party',(ctx)=>showInfo(ctx,'party'));
bot.action('info:internship',(ctx)=>showInfo(ctx,'internship'));
bot.action(/flow:start:(community|party|internship)/,(ctx)=>startFlow(ctx,ctx.match[1]));
bot.action(/interest:(.+)/,(ctx)=>ctx.match[1]==='done'?completeInterests(ctx):toggleInterest(ctx,ctx.match[1]));
bot.action('game:menu',(ctx)=>gameMenu(ctx));
bot.action('game:new',(ctx)=>newGame(ctx));
bot.action('game:restart',(ctx)=>restartGame(ctx));
bot.action('game:continue',(ctx)=>continueGame(ctx));
bot.action(/^game:choice:(\d+):(.+):([0-3])$/,(ctx)=>chooseGame(ctx,ctx.match[1],ctx.match[2],ctx.match[3]));
bot.action('top:global',(ctx)=>showTop(ctx,'global'));
bot.action('top:institutions',(ctx)=>showTop(ctx,'institutions'));
bot.on('message_created',handleFlowMessage);
