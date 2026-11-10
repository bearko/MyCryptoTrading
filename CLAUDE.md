# プロジェクトのメモ（Claude 用）

- **ユーザーへの返答・報告・質問は、必ず日本語で書く**（途中の報告・最終の報告・まとめ・選択式の質問を含む）。
- **ほかの作品の名前（参考にしたゲームなど）を、このリポジトリのどこにも書かない**。ファイル・コミットメッセージ・ブランチ名・PR のタイトルと本文・PR やイシューのコメントのすべてが対象。仕組みを説明するときは「値切り」「家賃」のように一般的な言葉で書く。
- このリポジトリは「My Crypto Trading」。My Crypto Heroes の世界で交易店を営む、スマホ（縦持ち）向けの店舗経営・取引ゲーム。サイトを開くと `index.html` → `src/main.ts` → `src/ui/app.ts` で始まる。公開は Cloudflare Workers の静的配信（`wrangler.jsonc`）。本番のブランチは `main`。
- ゲームの全体像・ルール・今後の予定は `docs/GAME_DESIGN.md`。新しい機能はこの方向に沿って作り、ルールを変えたらこの文書も直す。
- 構成：`src/game/` はルール（DOM に触らない・乱数は種つきで再現できる）、`src/ui/` は画面。経済の数字はすべて `src/game/balance.ts` に置く。
- 素材は `vendor/mycryptoheroes`（サブモジュール）から `scripts/sync-assets.mjs` が使うものだけを `public/mch/` に写し、`src/generated/catalog.json` を作る（どちらも Git には入れない）。
- チェック：`npm test`・`npm run typecheck`・`npm run build`。数字を変えたら `npm run sim`（ボットに 300 回遊ばせて、クリアまでの日数と破産の割合を見る）で確かめ、`docs/GAME_DESIGN.md` の計測結果を直す。
- 画面は縦持ちのスマホが基準（幅 360〜480px）。ボタンは 44px 以上、ドット絵は `image-rendering: pixelated`。
- プレイヤー自身（店番）の姿は描かない。客はカウンターの奥に大きく立ち、左から入って右へ出る。
- 画面は操作のたびに作り直す（`render()`）。ドラッグ中だけは DOM を直接動かし、離したときに作り直す（`src/ui/app.ts` の末尾）。
