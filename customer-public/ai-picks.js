(function(){
  var TYPES=[
    {key:'stable',name:'安定型AI',range:'1.0〜20.0倍',desc:'低〜中配当中心で、比較的当てにいくタイプ。'},
    {key:'mid',name:'中配当型AI',range:'20.1〜80.0倍未満',desc:'的中と配当のバランスを狙うタイプ。'},
    {key:'high',name:'高配当型AI',range:'80.0倍〜',desc:'高配当ゾーンを狙うタイプ。'}
  ];
  function band(odds){var o=Number(odds);if(!Number.isFinite(o)||o<1)return null;if(o<=20)return'stable';if(o<80)return'mid';return'high'}
  function groups(bets){var g={stable:[],mid:[],high:[],unclassified:[]};(bets||[]).forEach(function(b){var k=band(b&&b.odds);(k?g[k]:g.unclassified).push(b)});return g}
  function metric(key){return STATS&&STATS.ai_types?STATS.ai_types[key]||null:null}
  function metricValue(m,key){return m&&Number(m.races)>0&&Number.isFinite(Number(m[key]))?pct(m[key]):'—'}
  function oddsText(v){return Number.isFinite(Number(v))?Number(v).toFixed(1)+'倍':'データなし'}
  function cards(bets){
    var g=groups(bets);var first=null;for(var i=0;i<TYPES.length;i++){if(g[TYPES[i].key].length){first=TYPES[i].key;break}}
    var html='';
    TYPES.forEach(function(t){
      var xs=g[t.key],amount=xs.reduce(function(s,x){return s+stakeOf(x)},0),m=metric(t.key);
      html+='<details class="ai-pick-card ai-'+t.key+'" '+(first===t.key?'open':'')+'>';
      html+='<summary><div class="ai-card-top"><div class="ai-card-title"><small>ONE BOAT AI</small><strong>'+t.name+'</strong><p>'+t.desc+'</p></div><span class="ai-range">'+t.range+'</span></div>';
      html+='<div class="ai-card-metrics"><div><span>的中率</span><strong>'+metricValue(m,'hit_rate')+'</strong></div><div><span>回収率</span><strong>'+metricValue(m,'roi')+'</strong></div><div><span>購入点数</span><strong>'+xs.length+'点</strong></div><div><span>購入金額</span><strong>'+yen(amount)+'</strong></div></div>';
      html+='<div class="ai-card-toggle"><span>'+(xs.length?'買い目を見る':'今回の買い目なし')+'</span><b>開く / 閉じる</b></div></summary>';
      html+='<div class="ai-card-body">';
      if(xs.length){html+='<div class="ai-ticket-list">';xs.forEach(function(x){html+='<div class="ai-ticket"><strong>'+esc(ticketOf(x))+'</strong><span>'+yen(stakeOf(x))+'</span><em>'+oddsText(x&&x.odds)+'</em></div>'});html+='</div>'}else{html+='<p>このオッズ帯に今回の正式買い目はありません。</p>'}
      html+=(m&&Number(m.races)>0)?'<small class="ai-sample">実績集計 '+Number(m.races)+'レース</small>':'<small class="ai-sample">実績は正式データが揃った分だけ集計します。</small>';
      html+='</div></details>';
    });
    if(g.unclassified.length){
      html+='<section class="odds-pending-bets"><strong>オッズ取得中の正式買い目</strong><p>オッズが未取得のため、3タイプへ推測分類せずそのまま表示します。</p><div class="ai-ticket-list">';
      g.unclassified.forEach(function(x){html+='<div class="ai-ticket"><strong>'+esc(ticketOf(x))+'</strong><span>'+yen(stakeOf(x))+'</span><em>オッズ データなし</em></div>'});
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
  stateLabel=function(s){return {PUBLIC:'予想公開',WATCH:'様子見',SKIP:'見送り',SETTLED:'結果確定',FINISHED:'本日終了',CLOSED:'終了',NOEVENT:'本日非開催',PENDING:'直前分析中'}[s]||'直前分析中'};
  raceDetail=function(r){
    var rec=r.record||{},p=rec.prediction||{},sett=rec.settlement||null,bets=betsOf(rec);
    var stake=Number(rec.stake_total_yen!=null?rec.stake_total_yen:(p.stake_total_yen||0));
    var reason=p.reason||p.skip_reason||rec.reason||'',reasonShort=shortOfficialReason(reason),proHref=proRaceUrl(r),state=stateLabel(r.state),left=remaining(r.deadline);
    var html='<nav class="race-mode-switch" aria-label="表示モード"><span class="race-mode active">かんたん</span><a class="race-mode" data-view-mode="pro" href="'+proHref+'">PRO</a></nav>';
    html+='<section class="easy-decision '+stateClass(r.state)+'"><small>正式判定</small><strong>'+state+'</strong><p>'+esc(reasonShort||(publicRecord(rec)?'正式ENTERが確定しました。買い目・金額・締切までの時間を確認してください。':r.note||'必要な正式データを確認しています。'))+'</p></section>';
    if(publicRecord(rec)){
      html+='<section class="official-ai-section"><div class="detail-label">AI予想｜正式買い目</div><div class="official-order-head"><strong>買い目と資金配分</strong><span>合計 '+yen(stake)+'</span></div><div class="ai-pick-stack">'+cards(bets)+'</div></section>';
      html+='<section class="purchase-glance"><div><span>購入金額</span><strong>'+yen(stake)+'</strong></div><div class="deadline-cell"><span>締切まで</span><strong>'+left+'</strong><small>締切 '+timeText(r.deadline)+'</small></div></section>';
      if(reason)html+='<section class="detail-block easy-reason"><div class="detail-label">判断理由</div><p>'+esc(reasonShort)+'</p></section>';
    }else{
      html+='<section class="purchase-glance no-buy"><div><span>購入</span><strong>なし</strong></div><div class="deadline-cell"><span>締切まで</span><strong>'+left+'</strong><small>締切 '+timeText(r.deadline)+'</small></div></section>';
      html+='<section class="detail-block decision-message"><div class="detail-label">ONE BOATの判断</div><h3>'+state+'</h3><p>'+esc(reasonShort||r.note||'正式データが揃うまで直前分析中として表示します。')+'</p></section>';
    }
    html+='<a class="pro-jump" data-view-mode="pro" href="'+proHref+'"><span><small>PRO MODE</small><strong>詳しい根拠・展示・モーター・オッズを見る</strong></span><b>›</b></a>';
    if(sett){var tri=(sett.result&&sett.result.trifecta)||sett.trifecta||'--',profit=Number(sett.profit_yen||0);html+='<section class="detail-block result-block '+(sett.hit?'hit':'miss')+'"><div class="detail-label">RESULT</div><h3>'+(sett.hit?'的中':'不的中')+'　3連単 '+esc(tri)+'</h3><div class="result-grid"><div><span>投資</span><strong>'+yen(stake)+'</strong></div><div><span>払戻</span><strong>'+yen(sett.payout_yen)+'</strong></div><div><span>収支</span><strong class="'+(profit>=0?'positive':'negative')+'">'+(profit>0?'+':'')+yen(profit)+'</strong></div></div></section>'}
    return html;
  };
})();
