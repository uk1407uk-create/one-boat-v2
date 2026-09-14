import assert from 'node:assert/strict';
import {evaluateRace,selectInitialTheory,auxiliaryContext,DEFAULT_POLICY} from '../engine_v51.js';

const base={score:68,stake_total_yen:2000,points:4,theory_sample:100,theory_roi:130,odds:25};

const single=evaluateRace({...base,motor_player_fit_score:100});
assert.equal(single.decision,'WATCH');
assert.equal(single.auxiliary_adjustment,0);
assert.equal(single.monitor.aux_supportive_count,1);

const multi=evaluateRace({...base,wind_match_score:90,motor_player_fit_score:90});
assert.equal(multi.decision,'ENTER');
assert.ok(multi.value_score>=70);
assert.ok(multi.auxiliary_adjustment>0);

const negative=evaluateRace({...base,score:72,wind_match_score:0,motor_player_fit_score:0});
assert.notEqual(negative.decision,'ENTER');
assert.ok(negative.auxiliary_adjustment<0);

const windIn=[1,1,1,1,2].map(winner_lane=>({winner_lane,wind_direction:'北',wind_speed:3}));
const initialIn=selectInitialTheory({race_no:1,wind_direction:'北',wind_speed:3,wind_history_14d:windIn},'壱−弐−参型');
assert.equal(initialIn.theory,'イン信頼＋風14日補正');

const windOut=[2,3,4,2,1].map(winner_lane=>({winner_lane,wind_direction:'南',wind_speed:4}));
const initialOut=selectInitialTheory({race_no:1,wind_direction:'南',wind_speed:4,wind_history_14d:windOut},'壱−弐−参型');
assert.equal(initialOut.theory,'イン飛び＋風14日補正');

const freshwater=auxiliaryContext({water_type:'淡水',tide_score:100},'壱−弐−参型');
assert.equal(freshwater.signals.some(x=>x.key==='tide'),false);
const seawater=auxiliaryContext({water_type:'海水',tide_score:100},'壱−弐−参型');
assert.equal(seawater.signals.some(x=>x.key==='tide'),true);

const noStake=evaluateRace({score:80,stake_total_yen:0,points:4,theory_sample:100,theory_roi:130,odds:25});
assert.equal(noStake.decision,'WATCH');
assert.equal(noStake.stake_total_yen,0);
assert.equal(noStake.reason,'投資額未確定');

const cap=evaluateRace({score:85,stake_total_yen:2000,points:4,theory_sample:100,theory_roi:130,odds:80},DEFAULT_POLICY,{daily_hole_enter_count:5,sample:100,roi:130});
assert.equal(cap.decision,'SKIP');
assert.equal(cap.reason,'穴系は1日最大5Rに到達');

console.log('ONE BOAT V5.1 auxiliary tests passed');
