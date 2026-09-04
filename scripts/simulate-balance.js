import { applyChoice, currentEvent, newGameState } from '../src/game/engine.js';
import { scoreGame } from '../src/game/scoring.js';

const arg=(name,fallback)=>{
  const raw=process.argv.find((item)=>item.startsWith(`--${name}=`));
  return raw?raw.slice(name.length+3):fallback;
};
const runs=Math.max(10,Math.min(50000,Number(arg('runs','2000'))||2000));
const mode=arg('mode','classic')==='quick'?'quick':'classic';

function value(choice,key) { return Number(choice.effects?.[key]||0); }

const STRATEGIES={
  random:(event,_,run)=>run%event.choices.length,
  wellbeing:(event)=>best(event,(choice)=>value(choice,'health')*5+value(choice,'happiness')*4-value(choice,'stress')*3+value(choice,'relationships')*2),
  career:(event)=>best(event,(choice)=>value(choice,'career')*15+value(choice,'skills')*3+value(choice,'reputation')*2+value(choice,'money')/10000-value(choice,'stress')),
  balanced:(event)=>best(event,(choice)=>value(choice,'health')*3+value(choice,'happiness')*3+value(choice,'skills')*2+value(choice,'career')*7+value(choice,'reputation')+value(choice,'relationships')*2+value(choice,'money')/15000-value(choice,'stress')*2-value(choice,'risk')),
};

function best(event,score) {
  let bestIndex=0;
  let bestScore=-Infinity;
  event.choices.forEach((choice,index)=>{
    const result=score(choice);
    if (result>bestScore) { bestScore=result; bestIndex=index; }
  });
  return bestIndex;
}

function simulateOne(strategyName,run) {
  const state=newGameState({mode});
  let turns=0;
  while (state.age<60 && turns<100) {
    const event=currentEvent(state);
    const index=STRATEGIES[strategyName](event,state,run+turns);
    applyChoice(state,event,index);
    turns+=1;
  }
  return {
    score:scoreGame(state),money:state.money,debt:state.debt,health:state.health,happiness:state.happiness,
    stress:state.stress,energy:state.energy,career:state.career,turns,
  };
}

function summarize(rows) {
  const avg=(key)=>Math.round(rows.reduce((sum,row)=>sum+Number(row[key]||0),0)/rows.length);
  const sorted=rows.map((row)=>row.score).sort((a,b)=>a-b);
  const percentile=(p)=>sorted[Math.min(sorted.length-1,Math.floor(sorted.length*p))];
  return {
    runs:rows.length,
    avgScore:avg('score'),p10:percentile(0.10),median:percentile(0.50),p90:percentile(0.90),
    avgMoney:avg('money'),avgDebt:avg('debt'),debtRate:Number((rows.filter((r)=>r.debt>0).length/rows.length*100).toFixed(1)),
    avgHealth:avg('health'),avgHappiness:avg('happiness'),avgStress:avg('stress'),avgEnergy:avg('energy'),avgCareer:avg('career'),avgTurns:avg('turns'),
    exhaustedRate:Number((rows.filter((r)=>r.energy<=20).length/rows.length*100).toFixed(1)),
  };
}

const report={mode,runs,strategies:{}};
for (const strategy of Object.keys(STRATEGIES)) {
  const rows=[];
  for (let i=0;i<runs;i++) rows.push(simulateOne(strategy,i));
  report.strategies[strategy]=summarize(rows);
}

console.log(JSON.stringify(report,null,2));
