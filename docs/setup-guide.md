# Aurlum ローカル開発セットアップガイド

## 前提条件

- **Rust** (cargo) がインストール済み
- **Node.js** (npm) がインストール済み
- **Google Cloud SDK** (`gcloud`) がインストール済み・ログイン済み
- **Tauri v2** の開発環境が構築済み（WebView2等）

---

## 1. GCP認証のセットアップ

### 1-1. gcloud にログイン（初回のみ）

```bash
gcloud auth login
gcloud auth application-default login
```

### 1-2. サービスアカウントの署名権限を付与（初回のみ）

署名付きURL生成のために、自分のGoogleアカウントに `gdgoc-deployer` サービスアカウントの署名権限を付与する。

```bash
gcloud iam service-accounts add-iam-policy-binding \
  gdgoc-deployer@gdgoc-490204.iam.gserviceaccount.com \
  --member="user:あなたのメールアドレス" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --project=gdgoc-490204
```

> 自分のメールアドレスは `gcloud config get-value account` で確認できます。

---

## 2. 環境変数の設定

### 2-1. バックエンド用（プロジェクトルート）

`.env.example` をコピーして `.env` を作成し、値を埋める。

```bash
cp .env.example .env
```

| 変数名 | 説明 | 例 |
|--------|------|-----|
| `GCP_PROJECT_ID` | GCPプロジェクトID | `gdgoc-490204` |
| `GCP_REGION` | GCPリージョン | `asia-northeast1` |
| `STORAGE_BUCKET` | Cloud Storageバケット名 | `gdgoc-docs` |
| `KMS_KEY_RING` | Cloud KMSキーリング名 | `gdgoc-doctor-secret-key` |
| `KMS_KEY_NAME` | Cloud KMS鍵名 | `doctor-secret-key` |
| `GEMINI_MODEL` | 使用するGeminiモデル | `gemini-1.5-flash` |
| `SERVICE_ACCOUNT_EMAIL` | 署名付きURL生成用のサービスアカウント | `gdgoc-deployer@gdgoc-490204.iam.gserviceaccount.com` |

### 2-2. 患者アプリ用

`patient/.env.local.example` をコピーして `patient/.env.local` を作成し、Firebase の値を埋める。

```bash
cp patient/.env.local.example patient/.env.local
```

| 変数名 | 説明 |
|--------|------|
| `VITE_FIREBASE_API_KEY` | Firebase APIキー |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Auth ドメイン |
| `VITE_FIREBASE_PROJECT_ID` | Firebase プロジェクトID |
| `VITE_FIREBASE_STORAGE_BUCKET` | Firebase Storage バケット |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Firebase Messaging Sender ID |
| `VITE_FIREBASE_APP_ID` | Firebase App ID |
| `VITE_API_BASE_URL` | バックエンドAPI URL（デフォルト: `http://localhost:8080`） |

> Firebase の値は [Firebase Console](https://console.firebase.google.com/) > プロジェクト設定 > アプリ から確認できます。

---

## 3. 依存パッケージのインストール（初回のみ）

3つのターミナルで並行して実行するか、順番に実行する。

```bash
# 患者アプリ
cd patient
npm install

# 医師アプリ
cd doctor
npm install
```

---

## 4. 起動手順

**3つのターミナル**を使い、以下の順番で起動する。

### ターミナル1: バックエンド

```bash
cd C:/Programing/gdgoc
cargo run -p gdgoc
```

`Listening on 0.0.0.0:8080` と表示されたら起動完了。

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

## 5. 使い方

### STEP 1: セッション作成（医師アプリ）

1. 医師アプリの左上 **「新規作成」** をクリック
2. **患者名**、**カルテID** を入力
3. **.docx ファイル**（同意書）を選択
4. **「アップロード＆セッション作成」** をクリック
5. 成功すると、モニター画面の上部に **患者用URL** が緑のバナーで表示される
6. **「コピー」ボタン** でURLをクリップボードにコピー

### STEP 2: 患者が同意書を閲覧

1. コピーしたURL（`http://localhost:5173/?session=xxxxx`）をブラウザで開く
2. 同意書が表示され、視線追跡が開始される
3. 読み終わったら **「仮確認完了（医師へ送信）」** をクリック

### STEP 3: 医師が確認・最終同意を許可

1. 医師アプリのモニター画面で患者の閲覧状況をリアルタイム確認
2. 見落としがあれば口頭で説明
3. **「最終同意を許可」** をクリック

### STEP 4: 患者が最終同意

1. 患者の画面に **「最終同意」ボタン** が有効化される
2. クリックするとハッシュチェーン計算 + KMS署名 + Evidence保存が行われる
3. **同意照会番号** が表示されて完了

---

## トラブルシューティング

### `SERVICE_ACCOUNT_EMAIL must be set` エラー

`.env` ファイルに `SERVICE_ACCOUNT_EMAIL` が設定されていない。「2. 環境変数の設定」を確認。

### `Failed to generate signed URL: IAM signBlob failed`

署名権限が不足している。「1-2. サービスアカウントの署名権限を付与」を実行する。

### 医師アプリが `Waiting for your frontend dev server...` で止まる

`doctor/src-tauri/tauri.conf.json` に `"beforeDevCommand": "npm run dev"` が設定されているか確認。

### 患者アプリで「セッションIDが指定されていません」

`http://localhost:5173/` に直接アクセスしている。医師アプリでセッションを作成し、表示される患者用URL（`?session=xxxxx` 付き）を使用する。

### 患者アプリで「文書の読み込みに失敗しました」

バックエンドのログに `Failed to generate signed URL` が出ていないか確認。出ている場合は署名権限の問題。
