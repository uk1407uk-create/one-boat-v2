import assert from 'node:assert/strict';
import {OBPE_POLICY,trifectaTickets,normalizeDistribution,validateDistribution,marketProbabilities,candidateRows,allocateMutuallyExclusive} from '../engine_obpe.js';

const tickets=trifectaTickets();
assert.equal(tickets.length,120,'6艇3連単は120通り');
assert.equal(new Set(tickets).size,120,'重複なし');

const raw=Object.fromEntries(tickets.map((t,i)=>[t,i+1]));
const dist=normalizeDistribution(raw);
assert.equal(validateDistribution(dist),true,'確率分布は合計1');
assert.ok(Math.abs(Object.values(dist).reduce((a,b)=>a+b,0)-1)<1e-9);

const odds=Object.fromEntries(tickets.map((t,i)=>[t,20+i/2]));
const market=marketProbabilities(odds);
assert.ok(Math.abs(Object.values(market).reduce((a,b)=>a+b,0)-1)<1e-9,'市場評価も正規化');

const rows=candidateRows(dist,odds,0.25);
assert.equal(rows.length,120,'120通りを評価');
const alloc=allocateMutuallyExclusive(rows);
assert.ok(alloc.total<=OBPE_POLICY.max_race_stake_yen,'1R上限5000円を超えない');
assert.ok(alloc.bets.every(x=>x.stake_yen%100===0),'100円単位');

const flat=Object.fromEntries(tickets.map(t=>[t,1]));
const flatDist=normalizeDistribution(flat);
const badOdds=Object.fromEntries(tickets.map(t=>[t,2]));
const badRows=candidateRows(flatDist,badOdds,0.6);
const noBet=allocateMutuallyExclusive(badRows);
assert.equal(noBet.total,0,'安全側期待値が低い場合は0円');
assert.equal(noBet.bets.length,0,'固定点数を強制しない');

console.log('OBPE tests passed');
