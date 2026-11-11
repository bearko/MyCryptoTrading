# My Crypto Trading

My Crypto Heroes の世界で交易店を営む、スマホ（縦持ち）向けの店舗経営・取引ゲームです（非公式二次創作）。

安く買い取り、欲しがる客に高く売って GUM を稼ぎます。7 日ごとに上がる家賃を払いながら、店の権利書を買い取ればクリアです。

- 客は「売りに来た人」と「買いに来た人」。値切りや上乗せは、断られると相手の我慢が減り、怒って帰ることもあります
- 売りに来た客は品をカウンターの奥に並べます。欲しい品を手前へ移して買い取ります（まとめ買いは割引がつくことも）
- 売るときは、棚の品をカウンターへドラッグして置き、客のウィンドウで売上を確かめて販売します。予算が残っていれば続けて売れます
- ベルを鳴らすと、いまの客に帰ってもらい、次の客を呼びます
- 閉店後は、ドアから夜のショップかクエスト（ダンジョン）へ出かけられます（一晩に一か所。翌日の客が 1 人減ります）
- 買った品・拾った品は、ウォレット（財布 兼 カバン）のマス目に入る分だけ持ち帰れます
- 品を装備すると、クエストでそのスキルを使って戦えます
- 品は種類ごとに棚で使うマス目の形が違います。並べ替えと回転で置き場所を作ります
- 良心的な商いで評判が上がると、客が増え、値の張る品が集まります
- ルールと数字、今後の予定は [docs/GAME_DESIGN.md](docs/GAME_DESIGN.md)
- 見た目・動き・音・エフェクトの基準は [docs/UI_DIRECTION.md](docs/UI_DIRECTION.md)

## 開発

```sh
git clone --recurse-submodules https://github.com/bearko/MyCryptoTrading.git
cd MyCryptoTrading
npm install
npm run dev        # 開発サーバー
npm test           # テスト（ルールと経済の計測）
npm run typecheck  # 型チェック
npm run build      # dist/ に本番用のファイルを作る
npm run sim        # ボットに遊ばせて、クリアまでの日数と破産の割合を見る
```

素材は `vendor/mycryptoheroes`（サブモジュール）から、使うものだけを `scripts/sync-assets.mjs` が `public/mch/` に写します（`dev`・`test`・`build` の前に自動で走ります）。

```
src/
  game/     ルール（balance.ts に数字、logic.ts に取引・マス目・家賃、night.ts に夜のショップ・ウォレット・装備、
            quest.ts にダンジョンと戦闘、shapes.ts にマス目の形、lines.ts に客のせりふ）
  ui/       画面（app.ts が入口。hud・scene・counter・window・grid・front・shop・gear・modals・title・settings、
            操作と演出の進行は actions.ts、クエストは quest.ts と quest/）
            audio.ts＝音（効果音は合成、BGM は素材）、fx.ts＝エフェクト（粒子・数字・スタンプ・帯・画面転換）
  styles/   CSS（tokens.css に色・書体・動きの変数）
scripts/    素材の同期
tests/      Vitest（ルールのテストと、ボットによる経済の計測）
docs/       ゲーム設計書
```

### 公開（Cloudflare Workers）

Cloudflare Workers の静的アセットとして配信します（`wrangler.jsonc`）。

- ビルドのコマンド：`npm run build`、公開のコマンド：`npx wrangler deploy`
- 素材をサブモジュールから取るので、Workers Builds の設定でサブモジュールの取得を有効にしてください
- PR では GitHub Actions（`.github/workflows/ci.yml`）が `npm test`・`npm run typecheck`・`npm run build` を回します

## 素材とクレジット

- ヒーロー、エクステンション、エネミー、背景、アイコン、BGM、戦闘の効果音: My Crypto Heroes（© MCH Co.,Ltd.）。
  [bearko/mycryptoheroes](https://github.com/bearko/mycryptoheroes) に整理されたものを使用しています。

書体：Dela Gothic One、DotGothic16、Zen Kaku Gothic New、Anton（いずれも SIL Open Font License。Fontsource 経由）。

ソースコードと文書は [MIT License](LICENSE) です。マイクリの素材（画像）は対象外です。

本作は非公式の二次創作です。マイクリ画像の利用は [MCH デザインガイドライン](https://medium.com/mycryptoheroes/mch-design-guideline-ja-99ff0970ccdc) に従い、
非営利の範囲に限ります。営利目的での利用（有償販売など）は事前に MCH Co.,Ltd. への連絡が必要です。
