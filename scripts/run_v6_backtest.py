#!/usr/bin/env python3
import argparse, concurrent.futures, datetime as dt, json, math, os, time
from collections import defaultdict
from urllib.request import Request, urlopen
from urllib.error import HTTPError

UA='ONE-BOAT-V6-BACKTEST/1.0'
CAPS={'壱−弐−参型':4,'直前気配＋ST型':6,'イン飛び外頭理論':8,'直前強一致・1号艇型':10,'強イン高配当理論':12,'展開強一致・超高配当型':20}
VENUES={1:'桐生',2:'戸田',3:'江戸川',4:'平和島',5:'多摩川',6:'浜名湖',7:'蒲郡',8:'常滑',9:'津',10:'三国',11:'びわこ',12:'住之江',13:'尼崎',14:'鳴門',15:'丸亀',16:'児島',17:'宮島',18:'徳山',19:'下関',20:'若松',21:'芦屋',22:'福岡',23:'唐津',24:'大村'}

def finite(v):
    try:
        x=float(v); return x if math.isfinite(x) else None
    except (TypeError,ValueError): return None

def avg(xs):
    z=[float(x) for x in xs if finite(x) is not None]
    return sum(z)/len(z) if z else None

def clamp(x,a=0,b=100): return max(a,min(b,float(x)))

def rank(rows,key,lower=False):
    vals=[]
    for i,r in enumerate(rows):
        v=finite(r.get(key))
        if v is not None: vals.append((i,v))
    vals.sort(key=lambda t:t[1], reverse=not lower)
    pts=[92,82,72,62,52,42]
    return {idx:pts[min(j,5)] for j,(idx,_) in enumerate(vals)}

def status(score):
    if score is None:return 'missing'
    if score>=65:return 'support'
    if score<=40:return 'oppose'
    return 'neutral'

def jget(obj,*keys):
    cur=obj
    for k in keys:
        if not isinstance(cur,dict):return None
        cur=cur.get(str(k)) if str(k) in cur else cur.get(k)
    return cur

def ticket_norm(s):
    digs=[c for c in str(s or '') if c in '123456']
    return '-'.join(digs[:3]) if len(digs)>=3 else ''

def http_json(url,retries=3,timeout=30):
    last=None
    for n in range(retries):
        try:
            req=Request(url,headers={'User-Agent':UA,'Accept':'application/json'})
            with urlopen(req,timeout=timeout) as r:return json.load(r)
        except HTTPError as e:
            if e.code==404:return None
            last=f'HTTP {e.code}'
        except Exception as e:last=str(e)
        time.sleep(0.5*(n+1))
    raise RuntimeError(f'{url}: {last}')

def grade_class(title,grade):
    t=str(title or '')
    if any(x in t for x in ['女子','ヴィーナス','オールレディース']):return 'WOMEN'
    g=int(finite(grade) or 0)
    return {1:'SG',2:'G1',3:'G2',4:'G3'}.get(g,'GENERAL')

def normalize_old(date):
    y=date[:4]; ymd=date.replace('-','')
    urls={'programs':f'https://boatraceopenapi.github.io/programs/v3/{y}/{ymd}.json','previews':f'https://boatraceopenapi.github.io/previews/v3/{y}/{ymd}.json','results':f'https://boatraceopenapi.github.io/results/v3/{y}/{ymd}.json'}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as ex:
        fut={k:ex.submit(http_json,u) for k,u in urls.items()}; data={k:f.result() for k,f in fut.items()}
    if not data['programs'] or not data['results']:return []
    pmap={(int(x.get('stadium_number',0)),int(x.get('number',0))):x for x in data['programs'].get('programs',[])}
    vmap={(int(x.get('stadium_number',0)),int(x.get('number',0))):x for x in (data['previews'] or {}).get('previews',[])}
    rmap={(int(x.get('stadium_number',0)),int(x.get('number',0))):x for x in data['results'].get('results',[])}
    out=[]
    for key,p in pmap.items():
        res=rmap.get(key)
        if not res:continue
        prev=vmap.get(key) or {}; pb={int(b.get('racer_boat_number',0)):b for b in p.get('boats',[]) if b.get('racer_boat_number')}; vb={int(b.get('racer_boat_number',0)):b for b in prev.get('boats',[]) if b.get('racer_boat_number')}
        boats=[]
        for lane in range(1,7):
            a=pb.get(lane,{});b=vb.get(lane,{})
            boats.append({'lane':lane,'course':finite(b.get('racer_course_number')) or lane,'name':a.get('racer_name'),'racer_id':a.get('racer_number'),'national_win':finite(a.get('racer_national_top_1_percent')),'national_top3':finite(a.get('racer_national_top_3_percent')),'local_win':finite(a.get('racer_local_top_1_percent')),'local_top3':finite(a.get('racer_local_top_3_percent')),'avg_st':finite(a.get('racer_average_start_timing')),'motor2':finite(a.get('racer_assigned_motor_top_2_percent')),'motor3':finite(a.get('racer_assigned_motor_top_3_percent')),'start':finite(b.get('racer_start_timing')),'exhibition':finite(b.get('racer_exhibition_time')),'one_lap':None,'mawari':None,'straight':None})
        out.append({'date':date,'venue':key[0],'race':key[1],'title':p.get('title'),'grade':grade_class(p.get('title'),p.get('grade_number')),'boats':boats,'result':res,'odds':None,'source':'boatraceopenapi-v3'})
    return out

def normalize_new(date,strict=True):
    y=date[:4];ymd=date.replace('-','');base='https://turnmark.github.io/api/v1' if strict else 'https://boatraceopenapi.github.io/api/v1';j=http_json(f'{base}/{y}/{ymd}.json')
    if not j:return []
    out=[]
    for vs,s in (j.get('programs',{}).get('stadiums',{}) or {}).items():
        for rs,r in (s.get('races',{}) or {}).items():
            if not r.get('result'):continue
            rr=r.get('racers',{}) or {};pv=(r.get('preview') or {}).get('racers',{}) or {};boats=[]
            for lane in range(1,7):
                a=rr.get(str(lane),{}) or {};b=pv.get(str(lane),{}) or {}
                boats.append({'lane':lane,'course':finite(b.get('course_number')) or lane,'name':a.get('name'),'racer_id':a.get('number'),'national_win':finite(a.get('national_top_1_percent') or a.get('national_win_rate')),'national_top3':finite(a.get('national_top_3_percent')),'local_win':finite(a.get('local_top_1_percent') or a.get('local_win_rate')),'local_top3':finite(a.get('local_top_3_percent')),'avg_st':finite(a.get('average_start_timing')),'motor2':finite(a.get('motor_top_2_percent')),'motor3':finite(a.get('motor_top_3_percent')),'start':finite(b.get('start_timing')),'exhibition':finite(b.get('exhibition_time')),'one_lap':finite(b.get('one_lap_time') or b.get('one_round_time') or b.get('lap_time')),'mawari':finite(b.get('turn_time') or b.get('mawari_ashi_time') or b.get('corner_time')),'straight':finite(b.get('straight_time') or b.get('straight_line_time'))})
            out.append({'date':date,'venue':int(vs),'race':int(rs),'title':r.get('title') or s.get('title'),'grade':grade_class(r.get('title') or s.get('title'),r.get('grade_number')),'boats':boats,'result':r.get('result'),'odds':r.get('odds') if strict else None,'source':'turnmark-v1' if strict else 'boatraceopenapi-v1'})
    return out

def payout_unit(res):
    p=(res or {}).get('payouts',{}).get('trifecta')
    if isinstance(p,list) and p:return ticket_norm(p[0].get('combination')),int(finite(p[0].get('amount')) or 0)
    return '',0

def odds_for(race,a,b,c):return finite(jget((race.get('odds') or {}).get('trifecta') or {},a,b,c))

def evaluate_boats(boats):
    A1=rank(boats,'avg_st',True);A2=rank(boats,'start',True);B1=rank(boats,'exhibition',True);B2=rank(boats,'one_lap',True);B3=rank(boats,'mawari',True);B4=rank(boats,'straight',True);B5=rank(boats,'motor2',False);C1=rank(boats,'national_win',False);C2=rank(boats,'local_win',False);T3=rank(boats,'national_top3',False);ev=[]
    for i,x in enumerate(boats):
        A=avg([A1.get(i),A2.get(i)]);B=avg([B1.get(i),B2.get(i),B3.get(i),B4.get(i),B5.get(i)]);C=avg([C1.get(i),C2.get(i)]);first=avg([A if A is not None else 50,B if B is not None else 50,C if C is not None else 50]) or 0;second=avg([B if B is not None else 50,C if C is not None else 50,A if A is not None else 50,T3.get(i) if T3.get(i) is not None else 50]) or 0;third=avg([T3.get(i) if T3.get(i) is not None else 50,B if B is not None else 50,C if C is not None else 50,A if A is not None else 50]) or 0;ss=[status(A),status(B),status(C)];support=sum(z=='support' for z in ss);opp=sum(z=='oppose' for z in ss);missing=sum(z=='missing' for z in ss);align='strong' if support==3 and missing==0 else 'normal' if support>=2 else 'oppose' if opp>=2 else 'weak';ev.append({**x,'A':A,'B':B,'C':C,'first_score':first,'second_score':second,'third_score':third,'alignment':align,'required_missing':missing})
    return ev

def rankings(ev):return {'first':sorted(ev,key=lambda x:x['first_score'],reverse=True),'second':sorted(ev,key=lambda x:x['second_score'],reverse=True),'third':sorted(ev,key=lambda x:x['third_score'],reverse=True)}

def score_race(ev):
    r=rankings(ev);h=r['first'][0];exrank=rank(ev,'exhibition',True).get(ev.index(h));axes=[h['first_score'],avg([h['A'],exrank]) or 0,h['C'] or 0,h['B'] or 0,50,50,50];weights=[25,15,25,15,8,8,4];return round(clamp(sum(clamp(x)*weights[i]/100 for i,x in enumerate(axes)))),h,r

def structural_theories(ev,r):
    head=r['first'][0];one=next((x for x in ev if x['lane']==1),None);supported=[x for x in ev if x['lane']!=head['lane'] and x['alignment'] in ('normal','strong')];out=[]
    if head['lane']==1 and head['alignment'] in ('normal','strong'):out.append(('壱−弐−参型',head['first_score']+2))
    if head['A'] is not None and head['B'] is not None and head['A']>=65 and head['B']>=65 and status(head['C'])!='oppose':out.append(('直前気配＋ST型',head['first_score']+3))
    if head['lane']!=1 and one and (one['alignment']=='oppose' or one['first_score']+8<head['first_score']) and head['alignment'] in ('normal','strong'):out.append(('イン飛び外頭理論',head['first_score']+4))
    if head['lane']==1 and head['alignment']=='strong':out.append(('直前強一致・1号艇型',head['first_score']+5))
    if head['lane']==1 and head['alignment']=='strong' and len(supported)>=2:out.append(('強イン高配当理論',head['first_score']+(avg([x['second_score'] for x in supported[:3]]) or 0)/20))
    if head['alignment']=='strong' and len(supported)>=2:out.append(('展開強一致・超高配当型',head['first_score']+(avg([x['third_score'] for x in supported[:3]]) or 0)/18))
    return sorted(out,key=lambda x:x[1],reverse=True)

def combos_for(theory,ev,r):
    head=r['first'][0];h=head['lane'];mp={x['lane']:x for x in ev};sec=[x['lane'] for x in r['second'] if x['lane']!=h];thr=[x['lane'] for x in r['third'] if x['lane']!=h];sn=2 if theory=='壱−弐−参型' else 3 if theory=='直前気配＋ST型' else 4;tn=3 if theory=='壱−弐−参型' else 4 if theory=='直前気配＋ST型' else 5;out=[]
    for b in sec[:sn]:
        for c in thr[:tn]:
            if b==c or h in (b,c):continue
            sb,tb=mp[b],mp[c]
            if theory in ('強イン高配当理論','展開強一致・超高配当型') and (sb['alignment'] not in ('normal','strong') or tb['alignment'] not in ('normal','strong')):continue
            out.append({'ticket':f'{h}-{b}-{c}','score':head['first_score']+sb['second_score']+tb['third_score']})
    return sorted(out,key=lambda x:x['score'],reverse=True)

def in_band(theory,o):
    if o is None:return False
    return ((theory=='壱−弐−参型' and 3<=o<20) or (theory=='直前気配＋ST型' and 20<=o<40) or (theory=='イン飛び外頭理論' and 40<=o<60) or (theory=='直前強一致・1号艇型' and 60<=o<100) or (theory=='強イン高配当理論' and 100<=o<200) or (theory=='展開強一致・超高配当型' and o>=200))

def select_core(race,ev,r):
    th=structural_theories(ev,r)
    if not th:return None,[]
    theory=th[0][0];return theory,combos_for(theory,ev,r)[:CAPS[theory]]

def select_strict(race,ev,r):
    for theory,_ in structural_theories(ev,r):
        c=[]
        for x in combos_for(theory,ev,r):
            a,b,d=map(int,x['ticket'].split('-'));o=odds_for(race,a,b,d)
            if in_band(theory,o):c.append({**x,'odds':o})
        if c:
            picks=c[:CAPS[theory]]
            while picks and any((p['odds'] or 0)*100<len(picks)*100 for p in picks):picks.pop()
            if picks:return theory,picks
    return None,[]

def eval_race(race,mode):
    ev=evaluate_boats(race['boats']);buy,head,r=score_race(ev);theory,picks=(select_strict(race,ev,r) if mode=='strict' else select_core(race,ev,r));enter=bool(buy>=70 and head['required_missing']==0 and theory and picks);stake=len(picks)*100 if enter else 0;win,payout=payout_unit(race['result']);ret=payout if enter and any(p['ticket']==win for p in picks) else 0
    return {'date':race['date'],'venue':race['venue'],'race':race['race'],'grade':race['grade'],'buy_value':buy,'theory':theory,'enter':enter,'points':len(picks) if enter else 0,'stake':stake,'return':ret,'hit':ret>0,'missing':head['required_missing'],'source':race['source']}

def dates_between(a,b):
    d0=dt.date.fromisoformat(a);d1=dt.date.fromisoformat(b);return [(d0+dt.timedelta(days=i)).isoformat() for i in range((d1-d0).days+1)]

def fetch_date(date,mode):
    try:
        if date>='2026-01-01':races=normalize_new(date,strict=(mode=='strict'))
        else:
            if mode=='strict':return {'date':date,'rows':[],'not_covered':True,'error':None}
            races=normalize_old(date)
        return {'date':date,'rows':[eval_race(r,mode) for r in races],'not_covered':False,'error':None}
    except Exception as e:return {'date':date,'rows':[],'not_covered':False,'error':str(e)}

def empty_bucket():return {'races':0,'enter':0,'hits':0,'stake':0,'returns':0}
def add_bucket(b,row):
    b['races']+=1
    if row['enter']:b['enter']+=1;b['stake']+=row['stake'];b['returns']+=row['return'];b['hits']+=1 if row['hit'] else 0

def finalize_bucket(b):
    x=dict(b);x['profit']=x['returns']-x['stake'];x['participation_rate']=round(x['enter']/x['races']*100,1) if x['races'] else None;x['hit_rate']=round(x['hits']/x['enter']*100,1) if x['enter'] else None;x['roi']=round(x['returns']/x['stake']*100,1) if x['stake'] else None;return x

def summarize(rows,dates_total,errors,not_covered,mode,start,end):
    overall=empty_bucket();by_venue=defaultdict(empty_bucket);by_theory=defaultdict(empty_bucket);by_grade=defaultdict(empty_bucket);by_month=defaultdict(empty_bucket);by_buy=defaultdict(empty_bucket);longest=cur=0;equity=peak=0;max_dd=0
    for r in sorted(rows,key=lambda x:(x['date'],x['venue'],x['race'])):
        add_bucket(overall,r);add_bucket(by_venue[VENUES.get(r['venue'],str(r['venue']))],r);add_bucket(by_theory[r['theory'] or '理論不一致'],r);add_bucket(by_grade[r['grade']],r);add_bucket(by_month[r['date'][:7]],r);bv=r['buy_value'];band='90+' if bv>=90 else '80-89' if bv>=80 else '70-79' if bv>=70 else '64-69' if bv>=64 else '<64';add_bucket(by_buy[band],r)
        if r['enter']:
            pnl=r['return']-r['stake'];equity+=pnl;peak=max(peak,equity);max_dd=max(max_dd,peak-equity)
            if r['hit']:cur=0
            else:cur+=1;longest=max(longest,cur)
    return {'mode':mode,'period':{'start':start,'end':end,'calendar_days':dates_total},'coverage':{'processed_days':dates_total-len(errors)-not_covered,'not_covered_days':not_covered,'error_days':len(errors),'errors':errors[:30]},'summary':{**finalize_bucket(overall),'longest_losing_streak':longest,'max_drawdown_yen':round(max_dd)},'by_venue':{k:finalize_bucket(v) for k,v in sorted(by_venue.items())},'by_theory':{k:finalize_bucket(v) for k,v in sorted(by_theory.items())},'by_grade':{k:finalize_bucket(v) for k,v in sorted(by_grade.items())},'by_month':{k:finalize_bucket(v) for k,v in sorted(by_month.items())},'by_buy_value':{k:finalize_bucket(v) for k,v in sorted(by_buy.items())}}

def run_mode(start,end,mode,workers):
    dates=dates_between(start,end);rows=[];errors=[];not_covered=0
    with concurrent.futures.ThreadPoolExecutor(max_workers=workers) as ex:
        futs={ex.submit(fetch_date,d,mode):d for d in dates};done=0
        for fut in concurrent.futures.as_completed(futs):
            d=futs[fut];x=fut.result();done+=1
            if x['not_covered']:not_covered+=1
            if x['error']:errors.append({'date':d,'error':x['error']})
            rows.extend(x['rows'])
            if done%50==0:print(f'[{mode}] {done}/{len(dates)} days',flush=True)
    return summarize(rows,len(dates),errors,not_covered,mode,start,end)

def md_table(d):
    lines=['|区分|R|ENTER|参加率|的中|的中率|投資|払戻|収支|ROI|','|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|']
    for k,v in d.items():lines.append(f"|{k}|{v['races']}|{v['enter']}|{v['participation_rate'] if v['participation_rate'] is not None else '--'}%|{v['hits']}|{v['hit_rate'] if v['hit_rate'] is not None else '--'}%|¥{v['stake']:,}|¥{v['returns']:,}|¥{v['profit']:,}|{v['roi'] if v['roi'] is not None else '--'}%|")
    return '\n'.join(lines)

def write_report(core,strict,path):
    c=core['summary'];s=strict['summary'];text=f'''# ONE BOAT V6.0 バックテスト\n\n生成日時: {dt.datetime.now(dt.timezone.utc).isoformat()}\n\n## 重要な扱い\n\n- **2年コア再現**: {core['period']['start']}〜{core['period']['end']}。当時の出走表・直前情報・結果だけで1/2/3着候補と6理論を再現。2025年以前は全120通りの歴史オッズが確保できないため、オッズ帯ゲート・トリガミ判定は使わない。これは最終本番条件の完全再現ではない。\n- **厳密寄り再現**: {strict['period']['start']}〜{strict['period']['end']}。Turnmarkに保存された全3連単オッズを使い、理論のオッズ帯とトリガミ条件まで適用。ただしオッズの保存時点は証明できないため retrospective / research-only。\n- 総合評価点を的中確率には変換していない。\n- 現在のDBの将来情報・結果は予想入力に使っていない。\n- 一周・まわり足・直線の歴史値はデータ源で取れない日があり、その場合は同項目を加点していない。\n\n## 2年コア再現\n\n- 対象R: **{c['races']:,}**\n- ENTER: **{c['enter']:,}** / 参加率 **{c['participation_rate']}%**\n- 的中: **{c['hits']:,}** / 的中率 **{c['hit_rate']}%**\n- 投資: **¥{c['stake']:,}**\n- 払戻: **¥{c['returns']:,}**\n- 収支: **¥{c['profit']:,}**\n- ROI: **{c['roi']}%**\n- 最大連敗: **{c['longest_losing_streak']}**\n- 最大ドローダウン: **¥{c['max_drawdown_yen']:,}**\n\n## 2026 厳密寄り再現\n\n- 対象R: **{s['races']:,}**\n- ENTER: **{s['enter']:,}** / 参加率 **{s['participation_rate']}%**\n- 的中: **{s['hits']:,}** / 的中率 **{s['hit_rate']}%**\n- 投資: **¥{s['stake']:,}**\n- 払戻: **¥{s['returns']:,}**\n- 収支: **¥{s['profit']:,}**\n- ROI: **{s['roi']}%**\n- 最大連敗: **{s['longest_losing_streak']}**\n- 最大ドローダウン: **¥{s['max_drawdown_yen']:,}**\n\n## 厳密寄り・理論別\n\n{md_table(strict['by_theory'])}\n\n## 厳密寄り・場別\n\n{md_table(strict['by_venue'])}\n\n## 厳密寄り・総合評価帯別\n\n{md_table(strict['by_buy_value'])}\n\n## 2年コア・理論別\n\n{md_table(core['by_theory'])}\n\n## データカバレッジ\n\n- 2年コア: 処理 {core['coverage']['processed_days']}日 / エラー {core['coverage']['error_days']}日\n- 厳密寄り: 処理 {strict['coverage']['processed_days']}日 / 対象外 {strict['coverage']['not_covered_days']}日 / エラー {strict['coverage']['error_days']}日\n''';os.makedirs(os.path.dirname(path) or '.',exist_ok=True);open(path,'w',encoding='utf-8').write(text)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--start',default='2024-09-15');ap.add_argument('--end',default='2026-09-14');ap.add_argument('--strict-start',default='2026-01-01');ap.add_argument('--workers',type=int,default=10);ap.add_argument('--out-json',default='data/backtest_v6_2y.json');ap.add_argument('--out-md',default='docs/BACKTEST_V6_2Y.md');args=ap.parse_args();core=run_mode(args.start,args.end,'core',args.workers);strict=run_mode(args.strict_start,args.end,'strict',args.workers);result={'model_version':'ONE BOAT V6.0-simple-six-theory','backtest_version':'v6-replay-1','generated_at':dt.datetime.now(dt.timezone.utc).isoformat(),'core_2y':core,'strict_2026':strict,'disclaimer':{'core_2y':'historical-safe core replay without pre-2026 trifecta odds bands','strict_2026':'retrospective replay using Turnmark odds; odds snapshot timing is unknown','profitability_proven':False}};os.makedirs(os.path.dirname(args.out_json) or '.',exist_ok=True);json.dump(result,open(args.out_json,'w',encoding='utf-8'),ensure_ascii=False,indent=2);write_report(core,strict,args.out_md);print(json.dumps({'core':core['summary'],'strict':strict['summary'],'coverage_core':core['coverage'],'coverage_strict':strict['coverage']},ensure_ascii=False,indent=2))
if __name__=='__main__':main()
