# Aurlum開発セットアップガイド

## 前提条件

Rust，Node，Google Cloud SDK，Tauriの開発環境が構築済み

---

## 起動手順

**3つのターミナル**を使い、以下の順番で起動する。

### ターミナル1: バックエンド

```bash
cd C:/Programing/gdgoc
cargo run -p gdgoc
```

`Listening on 0.0.0.0:8081` と表示されたら起動完了。

### ターミナル2: 患者アプリ

```bash
cd C:/Programing/gdgoc/patient
npm run dev
```

`http://localhost:5173/` で起動する（直接アクセスしてもセッションIDがないためエラーになる。医師アプリからURLを取得する）。

### ターミナル3: 医師アプリ（Tauriデスクトップ）

```bash
cd C:/Programing/gdgoc/doctor
npm run tauri dev
```

Tauriのデスクトップウィンドウが開く。

---

## メモ

開発環境では認証画面をスキップできるようにしてあるので、基本的にはそのまま使
えます。直下のenvに

### 開発環境専用: 認証スキップ
DEV_SKIP_AUTH=true　を.envに書けば医師のログインスキップ．
動作確認したい場合は以下の手順でお願いします：
 1. doctor/src/main.ts　の「開発環境ではログインをスキップ」のブロックをコメントアウト
 2. .env に以下を書かずに起動（またはコメントアウト）
 DEV_SKIP_AUTH=true  ← これを無効にする
 3. ログイン画面に以下を入力
メールアドレス: [doctor@aurlum.com](mailto:doctor@aurlum.com) 
パスワード:  Aurlum2026
 
患者のメールアドレスは○○@○○.○○みたいな形ならおけ．認証コードは上記のターミナル1に6桁の数字で表示してる．
