#!/usr/bin/env python3
import argparse, json, gzip, io, tempfile, time, urllib.request
from datetime import date, timedelta
from pathlib import Path
import lhafile

VENUES={f'{i:02d}':n for i,n in enumerate(['桐生','戸田','江戸川','平和島','多摩川','浜名湖','蒲郡','常滑','津','三国','びわこ','住之江','尼崎','鳴門','丸亀','児島','宮島','徳山','下関','若松','芦屋','福岡','唐津','大村'],1)}
BASE='https://www1.mbrace.or.jp/od2/{kind}/{ym}/{low}{ymd}.lzh'
UA='ONE-BOAT-research/1.0 (+low-frequency official-data backfill)'

def days(a,b):
    d=a
    while d<=b:
        yield d; d+=timedelta(days=1)

def fetch_lzh(d,kind,retries=2):
    url=BASE.format(kind=kind,ym=d.strftime('%Y%m'),low=kind.lower(),ymd=d.strftime('%y%m%d'))
    last=None
    for n in range(retries+1):
        try:
            req=urllib.request.Request(url,headers={'User-Agent':UA})
            with urllib.request.urlopen(req,timeout=30) as r:
                data=r.read()
            if not data: raise ValueError('empty')
            return data
        except Exception as e:
            last=e
            if n<retries: time.sleep(1.5*(n+1))
    return None

def extract(data):
    if not data:return None
    with tempfile.NamedTemporaryFile(suffix='.lzh') as f:
        f.write(data);f.flush()
        arc=lhafile.Lhafile(f.name)
        names=arc.namelist()
        if not names:return None
        return arc.read(names[0])

def iv(b,a,z,scale=1):
    try:return int(b[a:z].decode('ascii','ignore').strip())/scale
    except:return None

def fv(v,lo,hi):
    return v if v is not None and lo<=v<=hi else None

def parse_k(raw,d):
    if not raw:return {}
    text=raw.decode('cp932','replace')
    races={}; venue=''; current=None
    for line in text.splitlines():
        if len(line)<2:continue
        t=line[:2]
        if t=='T0': venue=line[2:4].strip()
        elif t=='TH' and len(line)>=20:
            v=line[2:4].strip() or venue
            try:rno=int(line[4:6])
            except:continue
            current=(v,rno);venue=v
            races[current]={'date':d.isoformat(),'venue_code':v,'venue':VENUES.get(v,v),'race_no':rno,'weather_code':line[7:8].strip(),'wind_dir':_si(line[8:10]),'wind_speed':_si(line[10:12]),'water_temp':_scaled(line[12:16],10),'wave_height':_si(line[16:20]),'results':[],'trifecta':None,'trifecta_payout':None}
        elif current and len(t)==2 and t[0]=='T' and t[1] in '123456':
            r=races[current]
            r['results'].append({'boat_no':_si(line[1:2]),'course':_si(line[2:3]),'racer_no':_si(line[3:8]),'rank':_si(line[8:9]),'race_time':line[9:14].strip(),'st':_st(line[14:17])})
        elif current and t=='T7':
            r=races[current]
            if len(line)>=82:
                a,b,c=line[2:3].strip(),line[3:4].strip(),line[4:5].strip()
                if a and b and c:r['trifecta']=f'{a}-{b}-{c}'
                amt=_si(line[75:80])
                if amt:r['trifecta_payout']=amt*10
    return races

def _si(s):
    try:return int(str(s).strip())
    except:return None

def _scaled(s,k):
    v=_si(s);return v/k if v is not None else None

def _st(s):
    s=str(s).strip().replace('F','-').replace('L','')
    try:return float(s)/100
    except:return None

def parse_b(raw,d,k_races):
    if not raw:return
    venue='';current=None
    for line in raw.splitlines():
        if len(line)<2:continue
        try:t=line[:2].decode('ascii')
        except:continue
        if t=='BB':
            try:venue=line[2:4].decode('ascii').strip()
            except:pass
        elif t=='BH' and len(line)>=6:
            try:v=line[2:4].decode('ascii').strip() or venue;rno=int(line[4:6]);current=(v,rno)
            except:current=None
        elif current in k_races and len(t)==2 and t[0]=='B' and t[1] in '123456' and len(line)>=59:
            boat=int(t[1]); e={'boat_no':boat,'racer_no':int(iv(line,2,7) or 0) or None}
            try:e['racer_name']=line[7:15].decode('cp932','replace').strip()
            except:e['racer_name']=''
            e.update({'age':fv(iv(line,16,18),15,90),'weight':fv(iv(line,18,21,10),35,80),'fl_count':fv(iv(line,21,23),0,20),'late_count':fv(iv(line,23,25),0,20),'avg_start':fv(iv(line,25,29,100),0,1),'national_winrate':fv(iv(line,29,33,100),0,10),'national_2rate':fv(iv(line,33,37,100),0,100),'venue_winrate':fv(iv(line,37,41,100),0,10),'venue_2rate':fv(iv(line,41,45,100),0,100),'motor_no':fv(iv(line,45,48),1,999),'motor_2rate':fv(iv(line,48,52,100),0,100),'boat_no_hull':fv(iv(line,52,55),1,999),'boat_2rate':fv(iv(line,55,59,100),0,100)})
            k_races[current].setdefault('entries',[]).append(e)

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--start',required=True);ap.add_argument('--end',required=True);ap.add_argument('--out',default='data/backtest/official.jsonl.gz');ap.add_argument('--sleep',type=float,default=.35);args=ap.parse_args()
    a=date.fromisoformat(args.start);b=date.fromisoformat(args.end);out=Path(args.out);out.parent.mkdir(parents=True,exist_ok=True)
    stats={'start':a.isoformat(),'end':b.isoformat(),'days':0,'paired_days':0,'races':0,'missing':[]}
    with gzip.open(out,'wt',encoding='utf-8') as gz:
        for d in days(a,b):
            stats['days']+=1
            kd=fetch_lzh(d,'K');time.sleep(args.sleep);bd=fetch_lzh(d,'B');time.sleep(args.sleep)
            if not kd or not bd:
                stats['missing'].append({'date':d.isoformat(),'K':bool(kd),'B':bool(bd)});continue
            kr=extract(kd);br=extract(bd)
            races=parse_k(kr,d);parse_b(br,d,races)
            if races:stats['paired_days']+=1
            for r in races.values():
                if r.get('trifecta') and r.get('trifecta_payout'):
                    gz.write(json.dumps(r,ensure_ascii=False,separators=(',',':'))+'\n');stats['races']+=1
    Path(str(out)+'.manifest.json').write_text(json.dumps(stats,ensure_ascii=False,indent=2),encoding='utf-8')
    print(json.dumps({**stats,'missing':len(stats['missing'])},ensure_ascii=False))
if __name__=='__main__':main()
