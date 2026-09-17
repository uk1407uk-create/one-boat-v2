(()=>{
  async function render(){
    const label=document.getElementById('free-progress-label');
    const bar=document.getElementById('free-progress-bar');
    const note=document.getElementById('free-progress-note');
    if(!label||!bar||!note)return;
    try{
      const r=await fetch('/api/public/stats',{cache:'no-store'});
      if(!r.ok)throw new Error('stats');
      const s=await r.json();
      const total=Number(s?.published_total??s?.all?.races??0);
      const target=Math.max(1,Number(s?.progress_target||100));
      const pct=Math.max(0,Math.min(100,total/target*100));
      label.textContent=`${total} / ${target}R`;
      bar.style.width=`${pct}%`;
      if(total<target){
        const remain=Math.max(0,target-total);
        note.textContent=`販売開始を急がず、あと${remain}Rの無料公開データを積み上げて検証します。`;
      }else{
        note.textContent='100R到達。回収率・的中率・信頼スコア別成績を確認して次の段階を判断します。';
      }
    }catch(e){
      label.textContent='集計中';
      bar.style.width='0%';
      note.textContent='無料公開データを自動集計しています。';
    }
  }
  render();
  setInterval(render,30000);
})();
