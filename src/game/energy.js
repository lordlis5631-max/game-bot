const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export const BASE_TIME_CAPACITY=4;

function closePeopleCount(state) {
  return Object.values(state?.npcs || {}).filter((npc)=>Number(npc?.score || 0)>=70).length;
}

export function timeCapacityForState(state) {
  const energy=Number(state?.energy ?? 75);
  if (energy<=15) return 2;
  if (energy<=35) return 3;
  return BASE_TIME_CAPACITY;
}

export function commitmentTimeForState(state) {
  let used=0;
  const reasons=[];
  if (state?.profession) {
    used+=1;
    reasons.push('работа');
  }
  if (state?.activeProject) {
    used+=1;
    reasons.push('активный проект');
  }
  if (Number(state?.career || 0)>=7) {
    used+=1;
    reasons.push('высокая карьерная ответственность');
  }
  if (closePeopleCount(state)>=2) {
    used+=1;
    reasons.push('время на близких');
  }
  return {used:clamp(used,0,4),reasons};
}

export function estimateActionTime(choice={}) {
  if (Number.isFinite(Number(choice.timeCost))) return clamp(Math.round(Number(choice.timeCost)),1,3);
  const effects=choice.effects || {};
  let cost=1;
  if (choice.projectAction || choice.check) cost+=1;
  if (Number(effects.skills || 0)>=6 || Number(effects.career || 0)>=2 || Number(effects.entrepreneurship || 0)>=7) cost+=1;
  if (Number(effects.stress || 0)>=7) cost+=1;
  return clamp(cost,1,3);
}

export function energyPreviewForState(state) {
  const capacity=timeCapacityForState(state);
  const commitments=commitmentTimeForState(state);
  const free=Math.max(0,capacity-commitments.used);
  return {
    capacity,
    commitments:commitments.used,
    free,
    reasons:commitments.reasons,
  };
}

export function decorateTimeChoices(event,state) {
  if (!event?.choices) return event;
  return {
    ...event,
    choices:event.choices.map((choice)=>{
      if (/⏱\s*\d/.test(choice.text)) return choice;
      const cost=estimateActionTime(choice);
      return {...choice,text:`${choice.text} · ⏱ ${cost}`};
    }),
  };
}

function recoveryBonus(choice) {
  const effects=choice?.effects || {};
  let bonus=0;
  if (Number(effects.stress || 0)<=-4) bonus+=5;
  if (Number(effects.health || 0)>=5) bonus+=4;
  if (Number(effects.happiness || 0)>=7 && Number(effects.stress || 0)<=0) bonus+=2;
  return bonus;
}

export function applyTimeAndEnergy(state,choice,contextState=state) {
  const contextEnergy=Number.isFinite(Number(contextState?.energy))?Number(contextState.energy):75;
  if (!Number.isFinite(Number(state.energy))) state.energy=contextEnergy;
  const capacity=timeCapacityForState(contextState);
  const commitments=commitmentTimeForState(contextState);
  const actionTime=estimateActionTime(choice);
  const total=commitments.used+actionTime;
  const overload=Math.max(0,total-capacity);
  const spare=Math.max(0,capacity-total);

  let energyDelta=0;
  let stressDelta=0;
  let happinessDelta=0;
  let healthDelta=0;

  if (overload>0) {
    energyDelta-=overload*10;
    stressDelta+=overload*4;
    happinessDelta-=overload*2;
  } else {
    energyDelta+=spare*3;
    if (spare>0) stressDelta-=Math.min(2,spare);
  }

  energyDelta-=Math.max(0,actionTime-1)*3;
  energyDelta+=recoveryBonus(choice);

  state.energy=Number(state.energy)+energyDelta;
  state.stress=Number(state.stress || 0)+stressDelta;
  state.happiness=Number(state.happiness || 0)+happinessDelta;

  const projectedEnergy=clamp(state.energy,0,100);
  if (projectedEnergy<=15) {
    healthDelta-=3;
    happinessDelta-=2;
    state.health=Number(state.health || 0)-3;
    state.happiness=Number(state.happiness || 0)-2;
  } else if (projectedEnergy<=30) {
    healthDelta-=1;
    state.health=Number(state.health || 0)-1;
  }

  state.energy=projectedEnergy;
  state.stress=clamp(Number(state.stress || 0),0,100);
  state.happiness=clamp(Number(state.happiness || 0),0,100);
  state.health=clamp(Number(state.health || 0),0,100);

  let status='balanced';
  if (overload>=2) status='critical';
  else if (overload===1) status='overload';
  else if (spare>=2) status='recovery';

  return {
    capacity,
    commitments:commitments.used,
    commitmentReasons:commitments.reasons,
    actionTime,
    total,
    overload,
    spare,
    status,
    energyBefore:contextEnergy,
    energyAfter:state.energy,
    energyDelta:state.energy-contextEnergy,
    stressDelta,
    happinessDelta,
    healthDelta,
  };
}

export function formatTimeEnergyOutcome(outcome) {
  if (!outcome) return '';
  const reasons=outcome.commitmentReasons.length?`\nПостоянные обязательства: ${outcome.commitmentReasons.join(', ')}.`:'';
  const loadLine=`🕒 Время: обязательства ${outcome.commitments} + решение ${outcome.actionTime} = ${outcome.total}/${outcome.capacity}.${reasons}`;
  let explanation='Год получился сбалансированным: выбранное действие поместилось в доступное время.';
  if (outcome.status==='critical') explanation=`Ты взял на себя слишком много: перегрузка на ${outcome.overload} ед. времени сильно ударила по ресурсу.`;
  else if (outcome.status==='overload') explanation='Ты немного превысил доступное время. Часть результата оплачена усталостью и дополнительным стрессом.';
  else if (outcome.status==='recovery') explanation='После обязательств и выбранного действия осталось достаточно свободного времени на восстановление.';
  const changes=[`⚡ Энергия: ${outcome.energyBefore} → ${outcome.energyAfter} (${outcome.energyDelta>=0?'+':''}${outcome.energyDelta})`];
  if (outcome.stressDelta) changes.push(`😰 Стресс от нагрузки: ${outcome.stressDelta>0?'+':''}${outcome.stressDelta}`);
  if (outcome.healthDelta) changes.push(`❤️ Здоровье из-за уровня энергии: ${outcome.healthDelta}`);
  if (outcome.happinessDelta) changes.push(`😊 Счастье из-за нагрузки: ${outcome.happinessDelta}`);
  return `⚡ Энергия и время года:\n${loadLine}\n${explanation}\n${changes.join('\n')}`;
}

export function timeEnergySummary(state) {
  const energy=clamp(Number(state?.energy ?? 75),0,100);
  const preview=energyPreviewForState(state);
  const energyLabel=energy<=20?'истощение':energy<=40?'мало сил':energy<=70?'нормально':'много сил';
  const reasons=preview.reasons.length?` (${preview.reasons.join(', ')})`:'';
  return `⚡ Энергия: ${Math.round(energy)}/100 — ${energyLabel}\n🕒 Время года: занято ${preview.commitments}/${preview.capacity}${reasons}; свободно ${preview.free}`;
}
