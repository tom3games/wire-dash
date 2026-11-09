# ワイヤーダッシュ（wire-dash）

https://tom3games.com/play/wire-dash/

晴れた昼の街をワイヤーで飛び、回転レーザー・鉄球・高圧線・通りを走査する網・ドローンを紙一重でよけて、金の輪をくぐるタイムアタックの3Dワイヤーアクション。コース4本（前をゴールすると次が開く）、コースごとのメダル3つ（タイム・ノーミス・紙一重）、自己ベストのゴースト。街とワイヤーは空中出前（sky-delivery）・廃都迎撃（ufo-demae v4）、仕掛けと技は怪盗（wig-heist）から。

- 開発: `node server.mjs` → http://localhost:6451 ／ 本体は `node tools/build.mjs` で dist/game.js に1つ（js/ shared/ を直したら毎回。verify.mjs も最初に回す）
- 検証 `node verify.mjs` ／ 釣り合い `C=1 node tools/sim.mjs 8`（C はコース 1〜4。skilled・average・notech・idle）／ 掛かる向き `node tools/reach.mjs` ／ fps `node tools/fps.mjs` ／ 撮影 `node tools/shot.mjs` ／ 読み込み `GZ=1 PORT=6458 node server.mjs` と `node loadtime.mjs http://localhost:6458/ "window.__wdReady" 3` ／ OGP `node og.mjs`
- 調整値は shared/heist.js の HZ・PTS・COURSES・MEDAL・COURSE・NETS、技は shared/runner.js の RUN。見た目は js/heist3d.js（仕掛け・輪・気球・ゴースト）・js/day.js（空）・js/facade.js（外壁）・js/ticket.js（記録紙）
- 仕様の正本: ~/Desktop/claudecode/ideas/wire-dash.md
- 素材の出所は CREDITS.md（全部 CC0 か Public domain）
