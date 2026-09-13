ONE BOAT v10 Cloudflare Pages reviewed build

Purpose:
- Separate Cloudflare Pages test URL
- Existing production URL is not changed
- Adds short client-side cache to reduce repeated Supabase Function calls
- Keeps current Supabase API endpoints for compatibility during test

Before production switch:
1. Move API calls behind Cloudflare Worker
2. Move core data to Neon or keep Supabase with RLS/policies fixed
3. Migrate manual prediction notes from browser localStorage to database if cross-device use is needed
4. Replace hardcoded/historical sample panels with DB-driven values only


ONE BOAT 10分前確定ルール対応版
- 画面文言を「10分前確定」に統一
- 締切10分以内のカードを確定確認対象として強調
- 5分前は最終予想の新規生成ではなく安全確認の位置づけ
注意: バックエンド側の最終判定ロジックも10分前確定へ合わせる必要があります。


ONE BOAT v10.1 policy:
- Prediction finalization: 10 minutes before deadline.
- 5 minutes before deadline: abnormal/missing data check only.
- Frontend cache TTL added to reduce repeated API calls.
- No service_role key is bundled in this ZIP.
