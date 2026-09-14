import assert from 'node:assert/strict';
import {evaluateRace,aggregateBacktest,walkForward,confidenceScore,classifyOdds,selectVenueTheory,DEFAULT_POLICY} from '../engine.js';

const base={score:80,stake_total_yen:2000,points:4,theory_sample:100,theory_roi:130,odds:25};
const e=evaluateRace(base);assert.equal(e.decision,'ENTER');assert.equal(e.stake_total_yen,2000);assert.equal(e.category,'中穴');assert.equal(e.strategy,'直前気配＋ST型');
const capped=evaluateRace({...base,stake_total_yen:10000,points:5});assert.equal(capped.decision,'ENTER');assert.equal(capped.stake_total_yen,5000);
const s=evaluateRace({...base,theory_roi:90});assert.equal(s.decision,'SKIP');assert.equal(s.stake_total_yen,0);
const w=evaluateRace({...base,theory_sample:10});assert.equal(w.decision,'WATCH');assert.equal(w.stake_total_yen,0);
const low=evaluateRace({...base,odds:2.8});assert.equal(low.decision,'SKIP');assert.equal(low.category,'対象外');

const c=confidenceScore({confidence_components:{axis_trust:100,exhibition_start:100,player_course:100,motor_foot:100,venue_water_weather:100,day_flow:100,value_edge:100}});assert.equal(c.confidence_score,100);assert.equal(c.breakdown.reduce((n,x)=>n+x.weight,0),100);
assert.equal(classifyOdds(18).strategy,'壱−弐−参型');assert.equal(classifyOdds(45).strategy,'イン飛び外頭理論');assert.equal(classifyOdds(75).category,'狙い目');assert.equal(classifyOdds(150).category,'高配当');assert.equal(classifyOdds(250).odds_bucket,'200-299');assert.equal(classifyOdds(1200).odds_bucket,'1000+');
assert.equal(selectVenueTheory([{winner_lane:1},{winner_lane:1}],'旧理論'),'イン信頼＋当日流れ');assert.equal(selectVenueTheory([{winner_lane:2},{winner_lane:3}],'旧理論'),'イン飛び＋当日流れ');assert.equal(selectVenueTheory([{winner_lane:1},{winner_lane:2}],'旧理論'),'旧理論');

const superWait=evaluateRace({...base,odds:250});assert.equal(superWait.decision,'WATCH');assert.equal(superWait.reason,'超高配当は穴スコア確認待ち');
const superSkip=evaluateRace({...base,odds:250,hole_score:65});assert.equal(superSkip.decision,'SKIP');
const superEnter=evaluateRace({...base,odds:250,hole_score:66});assert.equal(superEnter.decision,'ENTER');assert.equal(superEnter.category,'超高配当');
const dailyCap=evaluateRace({...base,odds:80},DEFAULT_POLICY,{daily_hole_enter_count:5,sample:100,roi:130});assert.equal(dailyCap.decision,'SKIP');assert.equal(dailyCap.reason,'穴系は1日最大5Rに到達');

const bt=aggregateBacktest([{theory:'A',odds:8,bet_yen:1000,return_yen:2000},{theory:'A',odds:12,bet_yen:1000,return_yen:0}]);assert.equal(bt[0].roi,100);assert.equal(bt[0].buckets['7-9.9'].sample,1);assert.equal(bt[0].buckets['10-14.9'].sample,1);
const wf=walkForward(Array.from({length:10},(_,i)=>({date:`2026-01-${String(i+1).padStart(2,'0')}`,theory:'A',odds:8,bet_yen:100,return_yen:i%2?0:200})));assert.equal(wf.train_size,7);assert.equal(wf.validation_size,3);
console.log('ONE BOAT engine tests passed');
