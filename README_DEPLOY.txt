ONE BOAT COMPLETE REBUILD — 2026-09-14

方針
- 旧UI/旧フロント実装を使用せずゼロから再構築
- iPhone最優先のモバイルUI
- Cloudflare Worker + static assets
- DBへの大量履歴保存を前提にしない
- APIレスポンスは用途別TTLでEdge Cache
- ブラウザへ秘密鍵を埋め込まない

本番表示ルール
- 予想完了 = decision=ENTER かつ stake_total_yen>0 のみ
- その他は様子見/見送り
- 買う価値70以上
- 基本4点、最大6点
- 1R上限5,000円、100円単位
- 10分前再計算、5分前安全確認
- トリガミ回避、全レース購入しない
- 中穴 20.0〜59.9倍
- 穴 60.0倍〜

構成
public/index.html: UI骨格
public/styles.css: モバイルUI
public/app.js: API正規化・表示判定
worker.js: API Gateway / Edge Cache
engine.js: 予想判定・資金上限・ROIガード

注意
現時点のライブデータ供給元は既存Supabase Functionsを互換レイヤーとして利用。フロントは直接Supabaseへ接続しない。将来供給元を交換してもUI側を作り直さない構造。
