# プロジェクトのメモ（Claude 用）

- **ユーザーへの返答・報告・質問は、必ず日本語で書く**（途中の報告・最終の報告・まとめ・選択式の質問を含む）。
- **ほかの作品の名前（参考にしたゲームなど）を、このリポジトリのどこにも書かない**。ファイル・コミットメッセージ・ブランチ名・PR のタイトルと本文・PR やイシューのコメントのすべてが対象。仕組みを説明するときは「値切り」「家賃」のように一般的な言葉で書く。
- このリポジトリは「My Crypto Trading」。My Crypto Heroes の世界で交易店を営む、スマホ（縦持ち）向けの店舗経営・取引ゲーム。サイトを開くと `index.html` → `src/main.ts` → `src/ui/app.ts` で始まる。公開は Cloudflare Workers の静的配信（`wrangler.jsonc`）。本番のブランチは `main`。
- **見た目・動き・音・エフェクトの基準は `docs/UI_DIRECTION.md`（アートバイブル）**。画面を作る・直すときは必ず読む。色は `src/styles/tokens.css` の変数だけを使い、操作には見た目・音（`src/ui/audio.ts`）・エフェクト（`src/ui/fx.ts`）・振動で必ず返す。
- ゲームの全体像・ルール・今後の予定は `docs/GAME_DESIGN.md`。新しい機能はこの方向に沿って作り、ルールを変えたらこの文書も直す。
- 構成：`src/game/` はルール（DOM に触らない・乱数は種つきで再現できる）、`src/ui/` は画面。経済の数字はすべて `src/game/balance.ts` に置く。`logic.ts`＝取引・マス目・1 日の進行、`night.ts`＝夜のショップ・ウォレット・装備、`quest.ts`＝ダンジョンと戦闘。
- 品の色はパラメーター系統（PHY＝赤・INT＝青・AGI＝緑）で分ける。レアリティで色分けしない。系統ラベル・装備する場所・戦闘用の効果は `scripts/sync-assets.mjs` がスキルの文面とシリーズ名から作る。
- 素材は `vendor/mycryptoheroes`（サブモジュール）から `scripts/sync-assets.mjs` が使うものだけを `public/mch/` に写し、`src/generated/catalog.json` を作る（どちらも Git には入れない）。
- チェック：`npm test`・`npm run typecheck`・`npm run build`。数字を変えたら `npm run sim`（ボットに 300 回遊ばせて、クリアまでの日数と破産の割合を見る）で確かめ、`docs/GAME_DESIGN.md` の計測結果を直す。
- 画面は縦持ちのスマホが基準（幅 360〜480px）。ボタンは 44px 以上、ドット絵は `image-rendering: pixelated`。
- プレイヤー自身（店番）の姿は描かない。客はカウンターの奥に大きく立ち、左から入って右へ出る。
- 客は取引が成立してもすぐには帰らない（ベル・品をすべて買い取った・予算を使い切った・我慢が尽きた、のどれかで帰る）。
- 画面は HTML の文字列を作り、`morphdom` で差分だけ更新する（`src/ui/app.ts` の `render()`）。残す要素には `id` を付ける。新しく入った要素は、出るときの動きが 1 回だけ流れる。エフェクトの層（`.fx-host`）は `#app` の外にある。
- 画面の部品は `src/ui/` に分かれている：`hud`・`scene`（客）・`counter`・`window`（伝票）・`grid`（棚とウォレット）・`front`（朝・夜・シャッター）・`shop`・`gear`・`modals`・`title`・`settings`・`drag`、操作と演出の進行は `actions.ts`。クエストは `src/ui/quest.ts` と `src/ui/quest/`（表示用の状態 `view`、演出の再生 `play`、描画 `render`）。CSS は `src/styles/`。
- 戦闘と探索は、ルール側（`src/game/quest.ts`）が出来事の一覧（`events`）を返し、画面がそれを順に再生する。
- `soundboard.html` と `fxboard.html` は開発用の試聴・試写ページ（`npx vite` で開く。公開物には入らない）。
