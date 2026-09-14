import fs from 'node:fs';
import assert from 'node:assert/strict';

const html=fs.readFileSync('public/index.html','utf8');
const css=fs.readFileSync('public/styles.css','utf8');
const m=html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(m,'inline app script must exist');
new Function(m[1]);

for(const token of ['screen-home','screen-venues','screen-races','screen-detail','screen-result','screen-performance','未判定','予想完了 / ENTER','直前情報','データ分析','production_picks','stake_total_yen']) assert.ok(html.includes(token),`missing UI token: ${token}`);
assert.ok(html.includes("r.phase==='future'"),'future races must have an explicit pending branch');
assert.ok(html.includes("if(r.phase==='future')return"),'future race taps must not trigger prediction/detail');
assert.ok(html.includes("d==='ENTER'&&stake!==null&&stake>0"),'ENTER display must require positive stake');
assert.ok(html.includes("/api/live/predict?race_code="),'prediction endpoint must be used lazily for selected/current races');
assert.ok(!html.includes('setInterval(ensurePrediction'),'must not poll prediction endpoint globally');
assert.ok(css.includes('env(safe-area-inset-bottom)'),'iPhone safe area must be supported');
assert.ok(css.includes('.venues{display:grid;grid-template-columns:repeat(2'),'venue grid must be iPhone-first two columns');
console.log('UI syntax/rule checks passed');
