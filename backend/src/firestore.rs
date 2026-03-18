use gcp_auth::TokenProvider;
use reqwest::Client;
use serde_json::{json, Map, Value};
use std::sync::Arc;

/// Firestore REST APIクライアント
#[derive(Clone)]
pub struct FirestoreClient {
    client: Client,
    auth: Arc<dyn TokenProvider>,
    base_url: String,
}

impl FirestoreClient {
    pub async fn new(project_id: &str) -> Result<Self, Box<dyn std::error::Error>> {
        let auth = gcp_auth::provider().await?;
        let base_url = format!(
            "https://firestore.googleapis.com/v1/projects/{}/databases/(default)/documents",
            project_id
        );
        Ok(Self {
            client: Client::new(),
            auth,
            base_url,
        })
    }

    /// 認証プロバイダーを共有するためのアクセサ
    pub fn auth(&self) -> Arc<dyn TokenProvider> {
        self.auth.clone()
    }

    async fn get_token(&self) -> Result<String, Box<dyn std::error::Error>> {
        let scopes = &["https://www.googleapis.com/auth/datastore"];
        let token = self.auth.token(scopes).await?;
        Ok(token.as_str().to_string())
    }

    /// ドキュメントを作成する
    pub async fn create_document(
        &self,
        collection: &str,
        document_id: &str,
        fields: Map<String, Value>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        let url = format!(
            "{}/{}?documentId={}",
            self.base_url, collection, document_id
        );

        let body = json!({ "fields": to_firestore_fields(&fields) });

        let resp = self
            .client
            .post(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Firestore create failed: {}", err).into());
        }
        Ok(())
    }

    /// ドキュメントを取得する
    pub async fn get_document(
        &self,
        collection: &str,
        document_id: &str,
    ) -> Result<Map<String, Value>, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        let url = format!("{}/{}/{}", self.base_url, collection, document_id);

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let err = resp.text().await?;
            if status.as_u16() == 404 {
                return Err("not_found".into());
            }
            return Err(format!("Firestore get failed: {}", err).into());
        }

        let doc: Value = resp.json().await?;
        let fields = doc
            .get("fields")
            .and_then(|f| f.as_object())
            .cloned()
            .unwrap_or_default();

        Ok(from_firestore_fields(&fields))
    }

    /// ドキュメントのフィールドを更新する
    pub async fn update_document(
        &self,
        collection: &str,
        document_id: &str,
        fields: Map<String, Value>,
        update_mask: &[&str],
    ) -> Result<(), Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        let mask_params: String = update_mask
            .iter()
            .map(|f| format!("updateMask.fieldPaths={}", f))
            .collect::<Vec<_>>()
            .join("&");
        let url = format!(
            "{}/{}/{}?{}",
            self.base_url, collection, document_id, mask_params
        );

        let body = json!({ "fields": to_firestore_fields(&fields) });

        let resp = self
            .client
            .patch(&url)
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Firestore update failed: {}", err).into());
        }
        Ok(())
    }

    /// サブコレクション内のドキュメントを作成または上書きする
    pub async fn upsert_subcollection_document(
        &self,
        parent_collection: &str,
        parent_id: &str,
        sub_collection: &str,
        document_id: &str,
        fields: Map<String, Value>,
    ) -> Result<(), Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        // PATCH with full field mask = upsert
        let url = format!(
            "{}/{}/{}/{}/{}",
            self.base_url, parent_collection, parent_id, sub_collection, document_id
        );

        let firestore_fields = to_firestore_fields(&fields);
        let mask_params: String = fields
            .keys()
            .map(|k| format!("updateMask.fieldPaths={}", k))
            .collect::<Vec<_>>()
            .join("&");

        let body = json!({ "fields": firestore_fields });

        let resp = self
            .client
            .patch(&format!("{}?{}", url, mask_params))
            .bearer_auth(&token)
            .json(&body)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Firestore subcollection upsert failed: {}", err).into());
        }
        Ok(())
    }

    /// サブコレクション内の全ドキュメントを取得する
    pub async fn list_documents(
        &self,
        parent_collection: &str,
        parent_id: &str,
        sub_collection: &str,
    ) -> Result<Vec<Map<String, Value>>, Box<dyn std::error::Error>> {
        let token = self.get_token().await?;
        let url = format!(
            "{}/{}/{}/{}",
            self.base_url, parent_collection, parent_id, sub_collection
        );

        let resp = self
            .client
            .get(&url)
            .bearer_auth(&token)
            .send()
            .await?;

        if !resp.status().is_success() {
            let err = resp.text().await?;
            return Err(format!("Firestore list failed: {}", err).into());
        }

        let result: Value = resp.json().await?;
        let documents = result
            .get("documents")
            .and_then(|d| d.as_array())
            .cloned()
            .unwrap_or_default();

        let mut docs = Vec::new();
        for doc in &documents {
            if let Some(fields) = doc.get("fields").and_then(|f| f.as_object()) {
                docs.push(from_firestore_fields(fields));
            }
        }
        Ok(docs)
    }
}

/// JSON値をFirestoreのフィールド形式に変換
fn to_firestore_fields(fields: &Map<String, Value>) -> Map<String, Value> {
    let mut result = Map::new();
    for (key, value) in fields {
        result.insert(key.clone(), to_firestore_value(value));
    }
    result
}

fn to_firestore_value(value: &Value) -> Value {
    match value {
        Value::String(s) => json!({ "stringValue": s }),
        Value::Number(n) => {
            if let Some(f) = n.as_f64() {
                json!({ "doubleValue": f })
            } else if let Some(i) = n.as_i64() {
                json!({ "integerValue": i.to_string() })
            } else {
                json!({ "integerValue": n.to_string() })
            }
        }
        Value::Bool(b) => json!({ "booleanValue": b }),
        Value::Null => json!({ "nullValue": null }),
        _ => json!({ "stringValue": value.to_string() }),
    }
}

/// Firestoreのフィールド形式からJSON値に変換
fn from_firestore_fields(fields: &Map<String, Value>) -> Map<String, Value> {
    let mut result = Map::new();
    for (key, value) in fields {
        result.insert(key.clone(), from_firestore_value(value));
    }
    result
}

fn from_firestore_value(value: &Value) -> Value {
    if let Some(s) = value.get("stringValue") {
        return s.clone();
    }
    if let Some(n) = value.get("doubleValue") {
        return n.clone();
    }
    if let Some(n) = value.get("integerValue") {
        if let Some(s) = n.as_str() {
            if let Ok(i) = s.parse::<i64>() {
                return json!(i);
            }
        }
        return n.clone();
    }
    if let Some(b) = value.get("booleanValue") {
        return b.clone();
    }
    if value.get("nullValue").is_some() {
        return Value::Null;
    }
    Value::Null
}
