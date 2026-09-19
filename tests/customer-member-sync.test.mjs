import fs from 'node:fs';
import assert from 'node:assert/strict';

const app=fs.readFileSync('customer-public/app.js','utf8');
const member=fs.readFileSync('worker_member.js','utf8');

assert.ok(app.includes("const memberAll=await paidTodayEnter(o.date);"),'CLUB ENTER must be fetched regardless of easy/PRO mode');
assert.ok(!app.includes("if(pro)memberAll=await paidTodayEnter"),'CLUB ENTER must never be PRO-only');
assert.ok(app.includes("if(d==='ENTER'&&publicRecord(r?.record||{}))return'ENTER'"),'formal ENTER must override public pending/watch state');
assert.ok(app.includes("function mergeMemberVenue(v)"),'venue races must merge CLUB formal decisions');
assert.ok(app.includes("function mergeMemberOverview(o)"),'venue overview must merge CLUB formal decisions');
assert.ok(app.includes("function memberRecordIsBuyable(x)"),'buyable CLUB ENTER list must be deadline-aware');
assert.ok(app.includes("const freshMember=await paidTodayEnter(date);"),'open venue must refresh CLUB decisions live');
assert.ok(app.includes("MEMBER_SYNC_STATE==='paid_error'"),'paid-member sync failures must fail closed');
assert.ok(app.includes("CLUB正式判定を再取得中"),'sync failure must not fall back to a misleading pending decision');
assert.ok(app.includes("memberSyncBlocked?[]:usingClub"),'buyable list must be blocked while paid sync is unavailable');
assert.ok(member.includes("p?.input_snapshot?.deadline_at"),'member ENTER records must preserve formal deadline fallback');
assert.ok(member.includes("decision==='ENTER'&&stake>0"),'member today list must remain ENTER + positive stake only');

console.log('customer member decision sync invariant ok');
