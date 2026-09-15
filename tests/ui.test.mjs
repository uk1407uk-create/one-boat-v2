import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const worker=fs.readFileSync('worker.js','utf8');
const v52=fs.readFileSync('public/production-v52-enhancer.js','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m,'inline app script must exist');
new Function(m[1]);
new Function(v52);

for(const token of ['screen-home','screen-venues','screen-races','screen-detail','screen-result','screen-performance','未判定','予想完了 / ENTER','直前情報','データ分析','production_picks','stake_total_yen']) assert.ok(html.includes(token),`missing UI token: ${token}`);
assert.ok(html.includes("r.phase==='future'"),'future races must have an explicit pending branch');
assert.ok(html.includes("if(r.phase==='future')return"),'future race taps must not trigger prediction/detail');
assert.ok(html.includes("d==='ENTER'&&stake!==null&&stake>0"),'ENTER display must require positive stake');
assert.ok(html.includes("/api/live/predict?race_code="),'prediction endpoint must be used lazily for selected/current races');
assert.ok(!html.includes('setInterval(ensurePrediction'),'must not poll prediction endpoint globally');
assert.ok(css.includes('env(safe-area-inset-bottom)'),'iPhone safe area must be supported');
assert.ok(css.includes('.venues{display:grid;grid-template-columns:repeat(2'),'venue grid must be iPhone-first two columns');
assert.ok(worker.includes('evaluated.confidence_score>=70'),'production Worker must enforce confidence >=70 before ENTER');
assert.ok(worker.includes('pickAmount(x)<=2000'),'production Worker must enforce per-pick 2000 yen cap');
assert.ok(worker.includes('m<=5'),'production HTML patch must finalize at 5 minutes');
for(const token of ['総合評価点','推定的中確率','期待回収率','本日の運営状況','参加率','分類別実績']) assert.ok(v52.includes(token),`missing V5.2 UI token: ${token}`);
console.log('UI syntax/rule checks passed');
