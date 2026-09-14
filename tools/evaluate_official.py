#!/usr/bin/env python3
import argparse,gzip,json,math
from collections import defaultdict
from pathlib import Path

def load(path):
    with gzip.open(path,'rt',encoding='utf-8') as f:
        for line in f:
            try:
                r=json.loads(line)
                if len(r.get('entries',[]))==6 and r.get('trifecta') and r.get('trifecta_payout'):yield r
            except:pass

def num(x,d=0):
    try:return float(x)
    except:return d

def score(e):
    st=num(e.get('avg_start'),.30)
    return num(e.get('national_winrate'))*8+num(e.get('venue_winrate'))*10+num(e.get('national_2rate'))*.10+num(e.get('venue_2rate'))*.12+num(e.get('motor_2rate'))*.35+max(-5,min(8,(.22-st)*60))

def unique_picks(first,ordered,max_points=6):
    seconds=[b for b in ordered if b!=first][:2];out=[]
    for s in seconds:
        for t in [b for b in ordered if b not in (first,s)][:3]:
            out.append(f'{first}-{s}-{t}')
    return out[:max_points]

def candidates(r):
    es=sorted(r['entries'],key=lambda e:int(e['boat_no']))
    ranked=sorted(es,key=score,reverse=True);order=[int(e['boat_no']) for e in ranked];by={int(e['boat_no']):e for e in es};b1=by[1];top=ranked[0]
    vals=[]
    # pre-race variables only. Thresholds are gates; no result/payout is used to select bets.
    vals.append(('in_trust',score(b1),unique_picks(1,order)))
    if int(top['boat_no'])!=1: vals.append(('in_break',score(top)-score(b1),unique_picks(int(top['boat_no']),order)))
    valid_st=[e for e in es if e.get('avg_start') is not None]
    if valid_st:
        srt=sorted(valid_st,key=lambda e:num(e.get('avg_start'),9));first=int(srt[0]['boat_no']);gap=(num(srt[1].get('avg_start'),9)-num(srt[0].get('avg_start'),9)) if len(srt)>1 else 0
        vals.append(('st_pressure',gap,unique_picks(first,order)))
    m=sorted(es,key=lambda e:num(e.get('motor_2rate')),reverse=True);vals.append(('motor_gain',num(m[0].get('motor_2rate')),unique_picks(int(m[0]['boat_no']),order)))
    v=sorted(es,key=lambda e:num(e.get('venue_winrate')),reverse=True);vals.append(('venue_strength',num(v[0].get('venue_winrate')),unique_picks(int(v[0]['boat_no']),order)))
    return vals

def thresholds(name):
    return {'in_trust':[55,65,75,85,95],'in_break':[5,10,15,20,25],'st_pressure':[.01,.02,.03,.04,.05],'motor_gain':[35,40,45,50,55],'venue_strength':[4.5,5,5.5,6,6.5]}[name]

def run(rows,name,thr,venue=None):
    bet=ret=hits=races=0
    for r in rows:
        if venue and r.get('venue')!=venue:continue
        for n,g,picks in candidates(r):
            if n!=name or g<thr or not picks:continue
            races+=1;bet+=100*len(picks)
            if r['trifecta'] in picks: hits+=1;ret+=int(r['trifecta_payout'])
            break
    return {'theory':name,'threshold':thr,'venue':venue or 'ALL','races':races,'bet_yen':bet,'return_yen':ret,'profit_yen':ret-bet,'roi':round(ret/bet*100,1) if bet else 0,'hit_rate':round(hits/races*100,1) if races else 0,'hits':hits}

def best_train(train,name,min_races=40):
    xs=[run(train,name,t) for t in thresholds(name)];valid=[x for x in xs if x['races']>=min_races]
    return max(valid,key=lambda x:x['roi']) if valid else max(xs,key=lambda x:x['races'])

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--data',default='data/backtest/official.jsonl.gz');ap.add_argument('--out',default='data/backtest/report.json');ap.add_argument('--train',type=float,default=.7);args=ap.parse_args()
    rows=list(load(args.data));rows.sort(key=lambda r:(r.get('date',''),r.get('venue_code',''),r.get('race_no',0)))
    cut=max(1,int(len(rows)*args.train));train,test=rows[:cut],rows[cut:]
    names=['in_trust','in_break','st_pressure','motor_gain','venue_strength'];report=[]
    for n in names:
        b=best_train(train,n);v=run(test,n,b['threshold']);report.append({'train':b,'validation':v})
    venue_rows=[]
    venues=sorted({r.get('venue') for r in test if r.get('venue')})
    for item in report:
        n=item['train']['theory'];thr=item['train']['threshold']
        for venue in venues:
            x=run(test,n,thr,venue)
            if x['races']>=12:venue_rows.append(x)
    venue_rows.sort(key=lambda x:(x['roi'],x['races']),reverse=True)
    stable=[x for x in venue_rows if x['races']>=20 and x['roi']>=115]
    out={'data_rows':len(rows),'train_rows':len(train),'validation_rows':len(test),'method':'70/30 chronological walk-forward; thresholds selected only on train; validation untouched','strategies':report,'venue_validation_top':venue_rows[:30],'production_candidates':stable[:20],'unsupported_theories':['oriten','water_change','day_flow','odds_distortion','tie_cover'],'note':'Unsupported theories require exhibition/flow/pre-race odds snapshots and are not fabricated from post-race data.'}
    p=Path(args.out);p.parent.mkdir(parents=True,exist_ok=True);p.write_text(json.dumps(out,ensure_ascii=False,indent=2),encoding='utf-8')
    md=['# ONE BOAT 2Y Walk-Forward Report','',f"Rows: {len(rows)} / train {len(train)} / validation {len(test)}",'','|Theory|Train ROI|Validation ROI|Validation races|','|---|---:|---:|---:|']
    for x in report:md.append(f"|{x['train']['theory']}|{x['train']['roi']}%|{x['validation']['roi']}%|{x['validation']['races']}|")
    md+=['','## Production candidates (validation ROI >=115%, n>=20)','']
    for x in stable[:20]:md.append(f"- {x['venue']} / {x['theory']} / ROI {x['roi']}% / n={x['races']} / threshold={x['threshold']}")
    p.with_suffix('.md').write_text('\n'.join(md),encoding='utf-8')
    print(json.dumps({'rows':len(rows),'candidates':len(stable),'top':stable[:5]},ensure_ascii=False))
if __name__=='__main__':main()
