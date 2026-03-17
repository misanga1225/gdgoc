# Aurlum 初回UI開発仕様書 v1
## 対象: D-05 説明支援メイン画面

## Summary
本仕様書は、Aurlum の初回UI開発で実装対象とする D-05 説明支援メイン画面について、Vanilla TypeScript で実装着手できる粒度まで具体化した開発用仕様書である。

初回開発では、D-05 をモック専用の独立画面として扱い、README に記載の将来的なライブ監視・AI要約・最終同意フローとは切り分ける。

## 1. 目的
- 医師が資料を主役として閲覧しながら、患者の閲覧結果を補助情報として確認できる画面を作る
- UIは中立的に判断材料を提示し、医療判断や行動提案は行わない
- 初回開発では、見た目・状態・基本操作の成立を優先する

## 2. 初回開発スコープ
### 対象に含むもの
- D-05 本体レイアウト
- 上部ヘッダー
- HTML資料ビュー
- 右パネル空状態
- 更新後の右パネル表示
- 固定位置の非注視マーカー
- 下部アクションバー
- 終了確認モーダル
- モックデータ連携
- state による表示切り替え
- `tokens.css` / `base.css`
- 共通 `Button` / `Modal`

### 対象に含まないもの
- バックエンド接続
- Firestore 連携
- リアルタイム同期
- AI要約の本実装
- マーカー位置の自動計算
- 実際のセッション終了処理
- 他画面の詳細実装
- 本格レスポンシブ最適化

## 3. 参照資料の優先順位
1. 本開発用UI仕様書
2. 本開発用デザインシステム仕様書
3. [README.md](/C:/Users/ia23036_2/gdgoc/README.md)
4. UI仕様書原案 / デザインシステム仕様書原案

補足
- README はサービス全体像の基準とする
- 初回D-05の具体仕様は、本開発用UI仕様書を正とする
- 原案に矛盾がある場合は、本仕様書で確定した内容を優先する

## 4. 実装前提
- 医師側は Tauri + Vanilla TypeScript + Vite
- フレームワーク前提の state 管理や props 設計は採用しない
- 各部品は「描画関数」または「描画責務を持つモジュール」として設計する
- 主対象画面幅は 1280px 以上のデスクトップ表示
- 初回はモックデータで完結させる

## 5. D-05 画面構成
- 上部: ヘッダー
- 中央: 2カラム
- 下部: アクションバー

### カラム比
- 左 75%: 資料ビュー
- 右 25%: 閲覧状況パネル

### レイアウト方針
- 資料を最重要情報として扱う
- 左カラムを最大面積で確保する
- 右パネルは一覧性優先
- 下部バーは主要操作のみ置く

## 6. 表示要素
### 6-1. TopHeader
#### 目的
- 画面識別
- 対象患者識別
- 閲覧状態の表示

#### 表示項目
- `Aurlum` 固定表示
- 患者名
- 患者カルテID
- 閲覧状態

#### 表示しない項目
- セッションID

#### 閲覧状態文言
- `閲覧中`
- `不在`

#### 初回方針
- 閲覧状態は mock の文字列をそのまま表示する
- `不在` は表示確認のみ行い、専用UI分岐は作らない

### 6-2. HtmlDocumentViewer
#### 目的
- 左カラム全体の表示
- 資料タイトルと本文の表示
- 非注視マーカー重ね表示

#### 表示内容
- ビューア上部の資料タイトル
- HTML本文
- 見出し、段落、箇条書き、図のプレースホルダー
- 非注視マーカー

#### 表示ルール
- 資料タイトルはビューア上部に本文と別表示する
- 本文はスクロール型Webドキュメントとして見せる
- 本文最大幅は 760〜860px 程度
- 非注視マーカーは `showAttentionMarkers = true` のときだけ表示する

### 6-3. ViewingStatusPanel
#### 目的
- 更新前空状態と更新後結果表示

#### 更新前
- 文言のみ表示
- `更新ボタンを押すと閲覧状況を確認できます`

#### 更新後
- 経過時間
- 進捗バー + 数値
- 非注視一覧

#### 非注視一覧ルール
- 最大3件表示
- タイトルのみ表示
- 中立的な内容名にする

### 6-4. BottomActionBar
#### 構成
- 左: セッション終了
- 右: 閲覧状況を更新

#### ルール
- 初期状態でも終了ボタンは押せる
- モーダル表示中は背景操作不可
- 初回実装では、更新押下後は即時に更新後状態へ遷移する

### 6-5. Modal
#### 用途
- 終了確認

#### ルール
- キャンセルで閉じる
- 初回は Esc で閉じない
- 初回は外側クリックで閉じない
- 確認押下時も、初回は閉じるだけ
- 背景操作不可

## 7. 非注視マーカー仕様
- 四つ角のみ
- フルボーダーなし
- ラベルなし
- アニメーションなし
- オレンジ系
- `corner length: 10px`
- `stroke: 2px`
- `offset: 4px`

### 初回方針
- 固定位置モックでよい
- 色や太さは CSS で固定する

## 8. 状態定義
### UI状態
- `idle`
  - 初期状態
  - 右パネル空状態
  - マーカー非表示
- `updated`
  - 更新後状態
  - 右パネル結果表示
  - マーカー表示
- `modal_open`
  - 終了確認モーダル表示中
- `error`
  - 初回は専用遷移しない
  - 必要なら補助メッセージ追加

### 閲覧状態
- `閲覧中`
- `不在`

## 9. 状態遷移
- 初期表示: `idle`
- 更新ボタン押下: `idle -> updated`
- 終了ボタン押下: `idle -> modal_open` または `updated -> modal_open`
- モーダルキャンセル: `modal_open -> 直前状態へ戻る`
- モーダル確認: `modal_open -> 直前状態へ戻る`
- `不在` は UI状態ではなくヘッダー表示値として扱う

## 10. 状態管理方針
### ファイル
- `doctor/src/state/doctorMainState.ts`

### state が持つもの
- `uiStatus`
- `isEndSessionModalOpen`
- `hasFetchedResult`

### state が持たないもの
- 患者名
- カルテID
- 資料タイトル
- HTML本文
- 非注視一覧
- 非注視マーカー座標
- 経過時間
- 進捗率
- 閲覧状態ラベル

これらは `doctorMainMock.ts` に持たせる。

### 初回に必要な関数
- `createInitialDoctorMainState`
- `markViewingStatusAsUpdated`
- `openEndSessionModal`
- `closeEndSessionModal`

### 実装方針
- pure function
- named export のみ
- DOM操作を持たない

## 11. コンポーネント分割
### 共通
- `shared/components/Button.ts`
- `shared/components/Modal.ts`
- `shared/styles/tokens.css`
- `shared/styles/base.css`

### D-05 専用
- `doctor/src/pages/DoctorMainPage.ts`
- `doctor/src/components/doctor-main/TopHeader.ts`
- `doctor/src/components/doctor-main/HtmlDocumentViewer.ts`
- `doctor/src/components/doctor-main/AttentionCornerMarker.ts`
- `doctor/src/components/doctor-main/ViewingStatusPanel.ts`
- `doctor/src/components/doctor-main/ProgressBar.ts`
- `doctor/src/components/doctor-main/BottomActionBar.ts`
- `doctor/src/styles/doctor-main.css`
- `doctor/src/state/doctorMainState.ts`
- `doctor/src/mocks/doctorMainMock.ts`
- `doctor/src/mocks/sampleDocumentHtml.ts`

### 分割方針
- 初学者でも責務が追いやすい粒度に留める
- 細かく分けすぎない
- state オブジェクト全体を各部品へ渡さない

## 12. モックデータ
### 資料テーマ
- `内服治療開始に関するご説明`

### セクション
- `副作用について`
- `服薬スケジュール`
- `食事制限`
- `緊急時の連絡`

### 患者情報
- 患者名: `山田 花子`
- 患者カルテID: `KARTE-20481`
- 閲覧状態: `閲覧中`

### 更新後表示
- 経過時間: `12分`
- 進捗率: `68%`
- 非注視一覧: `副作用について / 食事制限 / 緊急時の連絡`

## 13. 完了条件
### 画面全体
- D-05 が 75:25 の2カラムで表示される
- ヘッダーに患者名、カルテID、閲覧状態が表示される
- セッションIDは表示しない
- 初期表示で右パネルは空状態
- 更新後に右パネルへ閲覧結果が表示される
- 更新後に非注視マーカーが表示される
- 終了ボタン押下でモーダルが開く
- モーダルの確認/キャンセルで閉じる
- `閲覧中 / 不在` の表示確認ができる

### 部品単位
- `TopHeader`: 患者情報と閲覧状態を描画できる
- `HtmlDocumentViewer`: タイトル、本文、マーカーを描画できる
- `ViewingStatusPanel`: 空状態と更新後状態を切り替えできる
- `BottomActionBar`: 更新/終了の2操作を描画できる
- `Modal`: 開閉と確認/キャンセル操作ができる
- `doctorMainState.ts`: 状態遷移を pure function で扱える

## 14. 今回やらないこと
- READMEのライブ同期仕様の再現
- Firebase / API接続
- AI要約表示
- 患者側画面の実装
- 実運用向けの詳細レスポンシブ
- 実終了処理
- 状態文言の自動生成
- マーカーの自動位置計算

## 15. Assumptions
- 初回開発は UI成立確認のためのモック実装
- READMEの将来像とは段階が異なる
- 実装は Vanilla TypeScript 前提
- 初回は D-05 を中心に、今後の他画面開発の土台を作る

## 16. 共通仕様更新反映（2026-03-18）
本仕様書で `shared/components/Button.ts` および `shared/components/Modal.ts` を利用する際は、以下の共通仕様を適用する。

### 16-1. Button 利用ルール
- `createButton` で生成するボタンは `data-variant` と `data-size` を必須で持つ。
- 値は `data-variant: primary / secondary`、`data-size: default / small` とする。

### 16-2. Modal 利用ルール
- チェックリストを含む Modal は、各行先頭に `・` を表示し、説明文直下で中央揃えにする。
- Modal 表示中は `body.modal-open` により背景スクロールを停止する。
- D-05 終了確認モーダルの既定文言は共通 Modal 側（`createEndSessionModal`）が保持する。

### 16-3. D-05 での適用
- D-05 の終了確認モーダルは 16-2 のルールを満たすことを完了条件に含める。
