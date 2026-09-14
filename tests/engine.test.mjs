import assert from 'node:assert/strict';import {evaluateRace,aggregateBacktest,walkForward} from '../engine.js';
const base={score:80,stake_total_yen:2000,points:4,theory_sample:100,theory_roi:130,odds:25};
const e=evaluateRace(base);assert.equal(e.decision,'ENTER');assert.equal(e.stake_total_yen,2000);assert.equal(e.category,'中穴');
const s=evaluateRace({...base,theory_roi:90});assert.equal(s.decision,'SKIP');assert.equal(s.stake_total_yen,0);
const w=evaluateRace({...base,theory_sample:10});assert.equal(w.decision,'WATCH');assert.equal(w.stake_total_yen,0);
const bt=aggregateBacktest([{theory:'A',bet_yen:1000,return_yen:2000},{theory:'A',bet_yen:1000,return_yen:0}]);assert.equal(bt[0].roi,100);
const wf=walkForward(Array.from({length:10},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,theory:'A',bet_yen:100,return_yen:i%2?0:200})));assert.equal(wf.train_size,7);assert.equal(wf.validation_size,3);
console.log('ONE BOAT engine tests passed');