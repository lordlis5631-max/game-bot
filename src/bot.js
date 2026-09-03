import { Bot, Keyboard } from '@maxhub/max-bot-api';
import { config } from './config.js';
import {
  COMMUNITY_INTERESTS, COMMUNITY_TEXT, INTERNSHIP_INTERESTS, INTERNSHIP_TEXT,
  PARTY_TEXT, WELCOME_TEXT,
} from './content.js';
import {
  clearFlow, createGame, finishGame, getActiveGame, getAdminStats, getFlow,
  getInstitutionLeaderboard, getLeaderboard, getRank, saveApplication, saveGame,
  setFlow, upsertUser,
} from './db.js';
import { applyChoice, currentEvent, formatDeltas, formatState, newGameState } from './game/engine.js';
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
  const rows = [[cb(kind==='party'?'✅ Зарегистрироваться':kind==='internship'?'🚀 Подать заявку':'✍️ Заполнить анкету',`flow:start:${kind}`)]];
  if (config.privacyUrl) rows.push([Keyboard.button.link('🔐 Политика конфиденциальности',config.privacyUrl)]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ik(rows);
}

function contactKeyboard() {
  return ik([
    [Keyboard.button.requestContact('📱 Отправить мой номер')],
    [cb('⬅️ Отменить','menu')],
  ]);
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

async function ensureUser(ctx) {
  if (!ctx.user) throw new Error('MAX user is unavailable for this update');
  return upsertUser(ctx.user);
}

async function showMenu(ctx, callback=false) {
  const userId = await ensureUser(ctx);
  await clearFlow(userId);
  const payload = { text: WELCOME_TEXT, attachments:[mainKeyboard()] };
  return callback ? ctx.answerOnCallback({message:payload}) : ctx.reply(payload.text,{attachments:payload.attachments});
}

async function showInfo(ctx,kind) {
  let text;
  if (kind==='community') text=COMMUNITY_TEXT;
  else if (kind==='party') text=PARTY_TEXT(config.party);
  else text=INTERNSHIP_TEXT;
  return ctx.answerOnCallback({message:{text,attachments:[infoKeyboard(kind)]}});
}

async function startFlow(ctx,flowType) {
  const userId = await ensureUser(ctx);
  await setFlow(userId,flowType,'full_name',{});
  const intro = flowType==='party' ? 'Регистрация на тусовку' : flowType==='internship' ? 'Заявка на стажировку' : 'Анкета сообщества';
  return ctx.answerOnCallback({message:{text:`${intro}\n\nШаг 1/4. Напиши ФИО полностью.\n\nДанные используем для связи по твоей заявке.`,attachments:[backKeyboard()]}});
}

function cleanPhone(input='') {
  const digits = input.replace(/\D/g,'');
  if (digits.length<10 || digits.length>15) return null;
  return input.trim();
}

async function finishRegistration(ctx,userId,flow,data) {
  const kind = flow.flow_type;
  const eventCode = kind==='party' ? 'party-2026-09-18' : null;
  await saveApplication({
    userId, kind, fullName:data.fullName, phone:data.phone, institution:data.institution,
    interests:data.interests || [], eventCode,
  });
  await clearFlow(userId);
  let text='✅ Готово! Заявка сохранена. Мы сможем связаться с тобой по указанному номеру.';
  if (kind==='party') text += `\n\n🎉 Ждём тебя ${config.party.date}, старт в ${config.party.time}.\n📍 ${config.party.place}`;
  if (kind==='internship') text += '\n\n💼 Мы посмотрим выбранные направления и постараемся подобрать реальные задачи, на которых можно получить опыт и кейсы в портфолио.';
  if (kind==='community') text += '\n\n🤝 Добро пожаловать! Дальше будем звать тебя в проекты, игротеки, события и команды по интересам.';
  return ctx.reply(text,{attachments:[mainKeyboard()]});
}

async function handleFlowMessage(ctx,next) {
  const text = ctx.message?.body?.text?.trim() || '';
  if (text.startsWith('/')) return next();
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow) return next();
  const data = flow.data || {};

  if (flow.step==='full_name') {
    if (text.length<5) return ctx.reply('Напиши, пожалуйста, ФИО полностью.');
    data.fullName=text;
    await setFlow(userId,flow.flow_type,'phone',data);
    return ctx.reply('Шаг 2/4. Отправь номер телефона кнопкой ниже или напиши его сообщением.',{attachments:[contactKeyboard()]});
  }

  if (flow.step==='phone') {
    const phone = cleanPhone(ctx.contactInfo?.tel || text);
    if (!phone) return ctx.reply('Не получилось распознать номер. Отправь контакт кнопкой или напиши номер, например +7 999 123-45-67.',{attachments:[contactKeyboard()]});
    data.phone=phone;
    await setFlow(userId,flow.flow_type,'institution',data);
    return ctx.reply('Шаг 3/4. Напиши свой университет, колледж, школу или другое учебное заведение. Если сейчас нигде не учишься — так и напиши.');
  }

  if (flow.step==='institution') {
    if (text.length<2) return ctx.reply('Напиши название учебного заведения или «не учусь».');
    data.institution=text;
    if (flow.flow_type==='party') return finishRegistration(ctx,userId,flow,data);
    data.interests=[];
    await setFlow(userId,flow.flow_type,'interests',data);
    const dict = flow.flow_type==='internship' ? INTERNSHIP_INTERESTS : COMMUNITY_INTERESTS;
    return ctx.reply('Шаг 4/4. Выбери одно или несколько направлений, которые тебе интересны. После выбора нажми «Готово».',{attachments:[interestsKeyboard(dict,[])]});
  }

  return ctx.reply('Сейчас нужно выбрать варианты кнопками в предыдущем сообщении.');
}

async function toggleInterest(ctx,key) {
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow || flow.step!=='interests') return ctx.answerOnCallback({notification:'Анкета уже завершена или была отменена.'});
  const dict = flow.flow_type==='internship' ? INTERNSHIP_INTERESTS : COMMUNITY_INTERESTS;
  if (!dict[key]) return ctx.answerOnCallback({notification:'Неизвестное направление'});
  const data = flow.data || {};
  const selected = new Set(data.interests || []);
  selected.has(key) ? selected.delete(key) : selected.add(key);
  data.interests=[...selected];
  await setFlow(userId,flow.flow_type,'interests',data);
  return ctx.answerOnCallback({message:{text:'Шаг 4/4. Выбери одно или несколько направлений, затем нажми «Готово».',attachments:[interestsKeyboard(dict,data.interests)]}});
}

async function completeInterests(ctx) {
  const userId = await ensureUser(ctx);
  const flow = await getFlow(userId);
  if (!flow || flow.step!=='interests') return ctx.answerOnCallback({notification:'Анкета уже завершена или была отменена.'});
  if (!(flow.data?.interests || []).length) return ctx.answerOnCallback({notification:'Выбери хотя бы одно направление.'});
  await ctx.answerOnCallback({notification:'Сохраняем заявку…'});
  return finishRegistration(ctx,userId,flow,flow.data);
}

async function gameMenu(ctx) {
  const userId = await ensureUser(ctx);
  const active = await getActiveGame(userId);
  const rows=[];
  if (active) rows.push([cb(`▶️ Продолжить: ${active.age} лет`,'game:continue')]);
  rows.push([cb(active?'🔄 Начать жизнь заново':'▶️ Начать жизнь','game:new')]);
  rows.push([cb('🏆 Рейтинг','top:global')]);
  rows.push([cb('⬅️ Главное меню','menu')]);
  return ctx.answerOnCallback({message:{text:'🎮 ИГРА «ЖИЗНЬ»\n\nОдин ход = один год жизни. Игра начинается в 16 лет и заканчивается в 60. Каждый год ты выбираешь одно из четырёх действий.\n\nДеньги — не единственная цель: на итог влияют здоровье, счастье, навыки, карьера, отношения, репутация, финансовые решения и достижения.\n\nЦель — набрать как можно больше очков и попасть в рейтинг.',attachments:[ik(rows)]}});
}

async function newGame(ctx) {
  const userId = await ensureUser(ctx);
  const active = await getActiveGame(userId);
  if (active) return ctx.answerOnCallback({message:{text:'У тебя уже есть незавершённая жизнь. Начать заново? Текущая партия будет закрыта.',attachments:[ik([[cb('Да, начать заново','game:restart')],[cb('Нет, продолжить','game:continue')]])]}});
  const game = await createGame(userId,newGameState());
  return renderTurn(ctx,game,true);
}

async function restartGame(ctx) {
  const userId = await ensureUser(ctx);
  const game = await createGame(userId,newGameState());
  return renderTurn(ctx,game,true);
}

function turnKeyboard(gameId,event) {
  return ik(event.choices.map((choice,index)=>[cb(choice.text,`game:choice:${gameId}:${event.id}:${index}`)]));
}

async function renderTurn(ctx,game,callback=true) {
  const state=game.state;
  const event=currentEvent(state);
  const score=scoreGame(state);
  await saveGame(game.id,state,game.event_history || [],score);
  const text=`📅 ${state.age} лет\n\n${formatState(state,score)}\n\n🎲 ${event.title}\n${event.text}\n\nЧто выберешь?`;
  const message={text,attachments:[turnKeyboard(game.id,event)]};
  return callback ? ctx.answerOnCallback({message}) : ctx.reply(text,{attachments:message.attachments});
}

async function continueGame(ctx) {
  const userId = await ensureUser(ctx);
  const game = await getActiveGame(userId);
  if (!game) return ctx.answerOnCallback({message:{text:'Активной игры нет. Начнём новую?',attachments:[ik([[cb('▶️ Начать','game:new')],[cb('⬅️ Меню','menu')]])]}});
  return renderTurn(ctx,game,true);
}

async function chooseGame(ctx,gameId,eventId,choiceIndex) {
  const userId = await ensureUser(ctx);
  const game = await getActiveGame(userId);
  if (!game || String(game.id)!==String(gameId)) return ctx.answerOnCallback({notification:'Эта партия уже не активна.'});
  const state=game.state;
  const event=currentEvent(state);
  if (event.id!==eventId) return ctx.answerOnCallback({notification:'Этот ход уже завершён.'});
  const ageBefore=state.age;
  const outcome=applyChoice(state,event,Number(choiceIndex));
  const history=[...(game.event_history || []),{age:ageBefore,eventId,choice:Number(choiceIndex)}];

  if (outcome.finished) {
    const score=scoreGame(state);
    await finishGame(game.id,state,history,score);
    const ach=achievementsFor(state);
    const type=lifeType(state);
    const rank=await getRank(userId);
    const rankText=rank ? `\n🏆 Место в рейтинге: ${rank.rank} из ${rank.total}` : '';
    return ctx.answerOnCallback({message:{text:`🏁 Жизнь завершена\n\n${outcome.result}\n\n${formatState(state,score)}\n\n🧭 Тип жизни: ${type}\n🏅 Достижения: ${ach.length?ach.join(', '):'пока без особых достижений'}${rankText}\n\nИтог: ⭐ ${score} очков`,attachments:[ik([[cb('🏆 Рейтинг','top:global')],[cb('🔄 Прожить другую жизнь','game:restart')],[cb('⬅️ Главное меню','menu')]])]}});
  }

  await saveGame(game.id,state,history,outcome.score);
  const deltas=formatDeltas(outcome.deltas);
  return ctx.answerOnCallback({message:{text:`✅ ${outcome.result}\n\n${deltas || 'Характеристики почти не изменились.'}\n\nТебе исполнилось ${state.age}.\n⭐ Текущие очки: ${outcome.score}`,attachments:[ik([[cb('➡️ Следующий год','game:continue')],[cb('📊 Показатели','game:continue')]])]}});
}

async function showTop(ctx,mode) {
  const userId = await ensureUser(ctx);
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
bot.command('game',async(ctx)=>{ await ensureUser(ctx); const active=await getActiveGame(String(ctx.user.user_id)); const rows=[]; if(active) rows.push([cb(`▶️ Продолжить: ${active.age} лет`,'game:continue')]); rows.push([cb('🎮 Открыть игру','game:menu')]); return ctx.reply('🎮 Игра «Жизнь»',{attachments:[ik(rows)]}); });
bot.command('top',async(ctx)=>{ await ensureUser(ctx); return ctx.reply('🏆 Открой рейтинг кнопкой:',{attachments:[topKeyboard()]}); });
bot.command('stats',async(ctx)=>{ const userId=await ensureUser(ctx); if(!config.adminIds.has(userId)) return ctx.reply('Команда доступна только администраторам.'); const s=await getAdminStats(); return ctx.reply(`📊 Статистика\nПользователи: ${s.users}\nСообщество: ${s.community}\nТусовка: ${s.party}\nСтажировки: ${s.internships}\nЗавершённые игры: ${s.finished_games}`); });

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
