# 文字のせ（Moji Nose）

写真の上に文字をのせて、1枚の PNG として書き出す PWA。**無料・広告なし・ログイン不要・オフライン。** 画像はアップロードしません。Phonto のようなアカウントはありません。

## できること

- 画像を選ぶ、またはドロップする（この端末のメモリ上だけ）
- 文字ボックスを追加し、ドラッグで位置、大きさ・色・太さを変更
- 横書きのみ（v1）。縦書きは後で
- システムに入っている日本語フォントを使用（ウェブフォントのダウンロードなし）
- 文字と写真を重ねた PNG を書き出し

写真と文字レイヤーは保存しません（IndexedDB には表示言語だけ）。ストレージを埋めないためです。

## English

**Moji Nose** puts text on a photo and exports a flattened PNG. Pick or drop an image, add text boxes, drag them (pointer events), and set size, color, and weight. Horizontal text only in v1 — vertical text is planned later. It uses system Japanese fonts, so no webfont download. The original image is never uploaded, and images are not stored in IndexedDB (memory only) so storage does not fill up. Text layers are ephemeral too. Only the language choice is kept in IndexedDB. Free, no ads, no login, offline.

## 開発 / Development

```bash
npm install
npm run dev
npm run build
npm run preview
```

Vite + vanilla TypeScript + vite-plugin-pwa（`registerType: 'autoUpdate'`, `base: './'`）。
