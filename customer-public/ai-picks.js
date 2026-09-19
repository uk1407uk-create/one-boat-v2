(function(){
  var TYPES=[
    {key:'stable',persona:'stable',name:'安定型AI',range:'最大5点',desc:'展開が読みやすく、確率が集中した時だけ絞って厚く買うタイプ。'},
    {key:'mid',persona:'balanced',name:'中配当型AI',range:'最大8点',desc:'的中確率と市場との評価差を両方見て、バランス良く買うタイプ。'},
    {key:'high',persona:'high',name:'高配当型AI',range:'最大15点',desc:'人気だけではなく、市場よりONE BOAT評価が高い組み合わせを広めに狙うタイプ。'},
    {key:'box',persona:'box',name:'BOX型AI',range:'最大15点',desc:'着順は割れても、来る艇の組み合わせを絞れる時だけBOXで買うタイプ。'}
  ];
  function band(odds){var o=Number(odds);if(!Number.isFinite(o)||o<1)return null;if(o<=20)return'stable';if(o<80)return'mid';return'high'}
  function groups(bets,strategyMode){var g={stable:[],mid:[],high:[],box:[],unclassified:[]};var isBox=String(strategyMode||'').toUpperCase()==='BOX'||String(strategyMode||'')==='watch-box-e-v1'||(bets||[]).some(function(b){return String(b&&b.selection_role||'').toUpperCase()==='BOX'});(bets||[]).forEach(function(b){if(isBox){g.box.push(b);return}var k=band(b&&b.odds);(k?g[k]:g.unclassified).push(b)});return g}
  function metric(key,scope){var root=scope==='club'?(STATS&&STATS.club_ai_types):(STATS&&STATS.ai_types);if(!root)return null;var types=root.today&&root.today.stable?root.today:root;return types&&types[key]?types[key]:null}
  function metricValue(m,key){return m&&Number(m.races)>0&&Number.isFinite(Number(m[key]))?pct(m[key]):'—'}
  function oddsText(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+'倍':'データなし'}
  function finalOddsRange(v,deadline){
    var o=Number(v);if(!Number.isFinite(o)||o<=1)return'データなし';
    var left=null,s=String(deadline||'').trim(),d=null;
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){var x=new Date(s);if(!Number.isNaN(x.getTime()))d=x}
    if(!d){var m=s.match(/(\d{1,2}):(\d{2})/);if(m){var hh=String(Number(m[1])).padStart(2,'0'),mm=m[2],y=new Date(raceDateForView()+'T'+hh+':'+mm+':00+09:00');if(!Number.isNaN(y.getTime()))d=y}}
    if(d)left=Math.max(0,(d.getTime()-Date.now())/60000);
    var lo=0.85,hi=1.20;
    if(left!==null&&left>=12){lo=.70;hi=1.35}else if(left!==null&&left>=8){lo=.75;hi=1.30}else if(left!==null&&left>=5){lo=.80;hi=1.25}
    var a=Math.max(1,o*lo),b=Math.max(a,o*hi);
    return a.toFixed(1)+'〜'+b.toFixed(1)+'倍';
  }
  function roleText(v){var x=String(v||'').toLowerCase();if(/main|本線|primary|core/.test(x))return'本線';if(/cover|押さえ|抑え|sub|secondary/.test(x))return'押さえ';return'買い目'}
  function personaPart(portfolio,t){return portfolio&&portfolio.applied===true?portfolio[t.persona]||null:null}
  function personaCards(portfolio,deadline,metricScope,personaSettlements){
    var first=null;for(var i=0;i<TYPES.length;i++){var pp=personaPart(portfolio,TYPES[i]);if(pp&&pp.status==='BUY'&&Array.isArray(pp.picks)&&pp.picks.length){first=TYPES[i].key;break}}
    var html='';
    TYPES.forEach(function(t){
      var pp=personaPart(portfolio,t)||{},xs=Array.isArray(pp.picks)?pp.picks:[],buy=pp.status==='BUY'&&xs.length>0,m=metric(t.key,metricScope),stake=Number(pp.stake_total_yen||0),ps=(Array.isArray(personaSettlements)?personaSettlements:[]).find(function(z){return String(z&&z.persona_key||'')===t.persona&&String(z&&z.version||'')===String(portfolio&&portfolio.version||'persona-v1')});
      html+='<details class="ai-pick-card ai-'+t.key+'" '+(first===t.key?'open':'')+'>';
      html+='<summary><div class="ai-card-top"><div class="ai-card-title"><small>ONE BOAT AI</small><strong>'+t.name+'</strong><p>'+t.desc+'</p></div><span class="ai-range">'+t.range+'</span></div>';
      html+='<div class="ai-card-metrics"><div><span>的中率</span><strong>'+metricValue(m,'hit_rate')+'</strong></div><div><span>回収率</span><strong>'+metricValue(m,'roi')+'</strong></div><div><span>買い目</span><strong>'+(buy?xs.length:0)+'点</strong></div></div>';
      html+='<div class="ai-card-toggle"><span>'+(buy?'買い目を見る':'今回は見送り')+'</span><b>開く / 閉じる</b></div></summary>';
      html+='<div class="ai-card-body">';
      if(buy){
        html+='<div class="persona-stake-summary"><span>推奨投資</span><strong>'+yen(stake)+'</strong><small>上限 '+yen(Number(portfolio.max_stake_yen_per_persona||5000))+'</small></div>';
        html+='<div class="ai-ticket-list">';
        xs.forEach(function(x){html+='<div class="ai-ticket"><strong>'+esc(ticketOf(x))+'</strong><span class="ai-role">'+(t.key==='box'?'BOX':'推奨 '+yen(Number(x&&x.stake_yen||0)))+'</span><em><small>予想時オッズ</small><b>'+oddsText(x&&x.odds)+'</b></em></div>'});
        html+='</div>';
      }else{
        html+='<p><strong>見送り</strong><br>'+esc(pp.reason||'このタイプの購入条件に該当していません。')+'</p>';
      }
      if(pp.reason&&buy)html+='<small class="persona-reason">'+esc(pp.reason)+'</small>';
      if(ps){var pr=Number(ps.profit_yen||0);html+='<div class="persona-result '+(ps.hit?'hit':'miss')+'"><span>'+(ps.hit?'的中':'不的中')+'</span><strong>払戻 '+yen(Number(ps.payout_yen||0))+'</strong><em class="'+(pr>=0?'positive':'negative')+'">'+(pr>0?'+':'')+yen(pr)+'</em></div>'}
      html+=(m&&Number(m.races)>0)?'<small class="ai-sample">新方式実績 '+Number(m.races)+'レース</small>':'<small class="ai-sample">新方式の正式結果が揃った分から集計します。</small>';
      html+='</div></details>';
    });
    return html;
  }
  function cards(bets,deadline,strategyMode,metricScope,portfolio,personaSettlements){
    if(portfolio&&portfolio.applied===true)return personaCards(portfolio,deadline,metricScope,personaSettlements);
    var g=groups(bets,strategyMode);var first=null;for(var i=0;i<TYPES.length;i++){if(g[TYPES[i].key].length){first=TYPES[i].key;break}}
    var html='';
    TYPES.forEach(function(t){
      var xs=g[t.key],m=metric(t.key,metricScope);
      html+='<details class="ai-pick-card ai-'+t.key+'" '+(first===t.key?'open':'')+'>';
      html+='<summary><div class="ai-card-top"><div class="ai-card-title"><small>ONE BOAT AI</small><strong>'+t.name+'</strong><p>'+t.desc+'</p></div><span class="ai-range">'+t.range+'</span></div>';
      html+='<div class="ai-card-metrics"><div><span>的中率</span><strong>'+metricValue(m,'hit_rate')+'</strong></div><div><span>回収率</span><strong>'+metricValue(m,'roi')+'</strong></div><div><span>買い目</span><strong>'+xs.length+'点</strong></div></div>';
      html+='<div class="ai-card-toggle"><span>'+(xs.length?'買い目を見る':'今回の買い目なし')+'</span><b>開く / 閉じる</b></div></summary>';
      html+='<div class="ai-card-body">';
      if(xs.length){html+='<div class="ai-ticket-list">';xs.forEach(function(x){html+='<div class="ai-ticket"><strong>'+esc(ticketOf(x))+'</strong><span class="ai-role">'+(t.key==='box'?'BOX':roleText(x&&x.selection_role))+'</span><em><small>最終オッズ予想</small><b>'+finalOddsRange(x&&x.odds,deadline)+'</b></em></div>'});html+='</div>'}else{html+='<p>この旧方式の買い目はありません。</p>'}
      html+='<small class="ai-sample">旧方式の表示です。</small>';
      html+='</div></details>';
    });
    if(g.unclassified.length){
      html+='<section class="odds-pending-bets"><strong>オッズ取得中の正式買い目</strong><div class="ai-ticket-list">';
      g.unclassified.forEach(function(x){html+='<div class="ai-ticket"><strong>'+esc(ticketOf(x))+'</strong><span class="ai-role">'+roleText(x&&x.selection_role)+'</span><em>オッズ データなし</em></div>'});
      html+='</div></section>';
    }
    return html;
  }
  function remaining(deadline){
    var s=String(deadline||'').trim();if(!s)return'データなし';var d=null;
    if(/^\d{4}-\d{2}-\d{2}/.test(s)){var x=new Date(s);if(!Number.isNaN(x.getTime()))d=x}
    if(!d){var m=s.match(/(\d{1,2}):(\d{2})/);if(m){var hh=String(Number(m[1])).padStart(2,'0'),mm=m[2],y=new Date(raceDateForView()+'T'+hh+':'+mm+':00+09:00');if(!Number.isNaN(y.getTime()))d=y}}
    if(!d)return'データなし';var ms=d.getTime()-Date.now();if(ms<=0)return'締切';if(ms<60000)return'1分未満';return'あと'+Math.max(1,Math.floor(ms/60000))+'分';
  }
  var ODDS_HYDRATING={};
  function ticketKey(v){return String(v||'').replace(/[‐-‒–—―ー−]/g,'-').replace(/\s+/g,'').trim()}
  async function hydrateRaceOdds(rno,baseRender){
    var r=(CURRENT_VENUE&&Array.isArray(CURRENT_VENUE.races)?CURRENT_VENUE.races:[]).find(function(x){return Number(x.race_no)===Number(rno)});
    if(!r)return;
    var rec=r.record||{},bets=betsOf(rec);
    if(!publicRecord(rec)||!bets.length||!bets.some(function(b){return !Number.isFinite(Number(b&&b.odds))||Number(b.odds)<=1}))return;
    var key=String(CURRENT_VENUE&&CURRENT_VENUE.date||raceDateForView())+'-'+String(CURRENT_VENUE&&CURRENT_VENUE.code||0)+'-'+String(rno);
    if(ODDS_HYDRATING[key])return;
    ODDS_HYDRATING[key]=true;
    try{
      var u=new URL('/api/member/analysis',location.origin);
      u.searchParams.set('date',raceDateForView());
      u.searchParams.set('venue',String(Number(CURRENT_VENUE&&CURRENT_VENUE.code||0)));
      u.searchParams.set('race',String(Number(rno)));
      u.searchParams.set('_',String(Date.now()));
      var res=await fetch(u,{credentials:'same-origin',cache:'no-store',headers:{accept:'application/json'}});
      if(!res.ok)return;
      var d=await res.json().catch(function(){return null});
      var items=Array.isArray(d&&d.trifecta_odds&&d.trifecta_odds.items)?d.trifecta_odds.items:[];
      if(!items.length)return;
      var om=new Map(items.map(function(x){return[ticketKey(x&&x.combination),Number(x&&x.odds)]}));
      bets.forEach(function(b){var o=om.get(ticketKey(ticketOf(b)));if(Number.isFinite(o)&&o>1)b.odds=o});
      if(Array.isArray(rec.bets))rec.bets=bets;
      if(rec.prediction)rec.prediction.production_picks=bets;
      if(Number(ACTIVE_RACE_NO)===Number(rno)&&typeof baseRender==='function')baseRender(Number(rno));
    }catch{}finally{delete ODDS_HYDRATING[key]}
  }
  stateLabel=function(s){return {PUBLIC:'予想公開',WATCH:'様子見',SKIP:'見送り',SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'本日非開催',PENDING:'直前分析中'}[s]||'直前分析中'};
  raceDetail=function(r){
    var rec=r.record||{},p=rec.prediction||{},sett=rec.settlement||null,bets=betsOf(rec),portfolio=rec.persona_portfolio||p.persona_portfolio||null,hasPrediction=portfolio&&portfolio.applied===true?portfolio.has_any_pick===true:publicRecord(rec);
    var stake=Number(rec.stake_total_yen!=null?rec.stake_total_yen:(p.stake_total_yen||0));
    var strategyMode=String(p.strategy_mode||p.odds_class||(p.strategy_version==='watch-box-e-v1'?'BOX':''));
    var metricScope=(rec&&['paid','staff'].includes(String(rec.access_scope||'')))||r.member_formal===true?'club':'free';
    var reason=p.reason||p.skip_reason||rec.reason||'',reasonShort=shortOfficialReason(reason),proHref=proRaceUrl(r),state=stateLabel(r.state),left=remaining(r.deadline);
    var activeTypes=portfolio&&portfolio.applied===true?TYPES.filter(function(t){var x=personaPart(portfolio,t);return x&&x.status==='BUY'&&Array.isArray(x.picks)&&x.picks.length}).length:0;
    var html='<nav class="race-mode-switch" aria-label="表示モード"><span class="race-mode active">かんたん</span><a class="race-mode" data-view-mode="pro" href="'+proHref+'">PRO</a></nav>';
    html+='<section class="easy-decision '+stateClass(r.state)+'"><small>ONE BOAT判定</small><strong>'+state+'</strong><p>'+esc(portfolio&&portfolio.applied===true?(portfolio.has_any_pick?'4タイプのうち購入条件を満たした予想があります。':'4タイプすべて見送りです。'):(reasonShort||(publicRecord(rec)?'正式予想が確定しました。':'必要な正式データを確認しています。')))+'</p></section>';
    if(hasPrediction){
      var headLabel=portfolio&&portfolio.applied===true?'4タイプ別予想':'正式買い目',headCount=portfolio&&portfolio.applied===true?(activeTypes+'/4タイプ'):(bets.length+'点');
      html+='<section class="official-ai-section"><div class="detail-label">AI予想｜'+headLabel+'</div><div class="official-order-head"><strong>買い目</strong><span>'+headCount+'</span></div><div class="ai-pick-stack">'+cards(bets,r.deadline,strategyMode,metricScope,portfolio,rec.persona_settlements)+'</div><p class="odds-range-note">'+(portfolio&&portfolio.applied===true?'※4タイプは同じONE BOAT予測データを、それぞれ異なる購入方針で選別しています。各タイプ1レース最大5,000円で、条件に応じて使わない資金もあります。':'※旧方式の予想表示です。')+'</p></section>';
      html+='<section class="purchase-glance"><div><span>'+(portfolio&&portfolio.applied===true?'購入タイプ':'正式買い目')+'</span><strong>'+(portfolio&&portfolio.applied===true?activeTypes+' / 4':bets.length+'点')+'</strong></div><div class="deadline-cell"><span>締切まで</span><strong>'+left+'</strong><small>締切 '+timeText(r.deadline)+'</small></div></section>';
    }else{
      html+='<section class="purchase-glance no-buy"><div><span>購入</span><strong>なし</strong></div><div class="deadline-cell"><span>締切まで</span><strong>'+left+'</strong><small>締切 '+timeText(r.deadline)+'</small></div></section>';
      html+='<section class="detail-block decision-message"><div class="detail-label">ONE BOATの判断</div><h3>'+state+'</h3><p>'+esc(portfolio&&portfolio.applied===true?'4タイプすべて購入条件に届かなかったため見送ります。':(reasonShort||r.note||'正式データが揃うまで直前分析中として表示します。'))+'</p></section>';
    }
    html+='<a class="pro-jump" data-view-mode="pro" href="'+proHref+'"><span><small>PRO MODE</small><strong>詳しい根拠・展示・モーター・オッズを見る</strong></span><b>›</b></a>';
    if(sett&&!(portfolio&&portfolio.applied===true)){var tri=(sett.result&&sett.result.trifecta)||sett.trifecta||'--',profit=Number(sett.profit_yen||0);html+='<section class="detail-block result-block '+(sett.hit?'hit':'miss')+'"><div class="detail-label">RESULT</div><h3>'+(sett.hit?'的中':'不的中')+'　3連単 '+esc(tri)+'</h3><div class="result-grid"><div><span>旧正式投資</span><strong>'+yen(stake)+'</strong></div><div><span>払戻</span><strong>'+yen(sett.payout_yen)+'</strong></div><div><span>収支</span><strong class="'+(profit>=0?'positive':'negative')+'">'+(profit>0?'+':'')+yen(profit)+'</strong></div></div></section>'}
    return html;
  };
  var BASE_RENDER_OPEN_RACE=renderOpenRace;
  renderOpenRace=function(rno){
    BASE_RENDER_OPEN_RACE(rno);
    hydrateRaceOdds(rno,BASE_RENDER_OPEN_RACE);
  };
})();
