use rand::Rng;
use sha2::{Digest, Sha256};

/// 6桁のOTPを生成する
pub fn generate_otp() -> String {
    let code: u32 = rand::thread_rng().gen_range(100_000..1_000_000);
    format!("{:06}", code)
}

/// OTPをSHA-256ハッシュ化する（平文保存を避ける）
pub fn hash_otp(otp: &str) -> String {
    let mut hasher = Sha256::new();
    hasher.update(otp.as_bytes());
    format!("{:x}", hasher.finalize())
}

/// OTPメール送信（SendGrid REST API経由）
/// 環境変数 `SENDGRID_API_KEY` が未設定の場合はコンソールにログ出力（開発用）
pub async fn send_otp_email(
    http_client: &reqwest::Client,
    to_email: &str,
    otp: &str,
) -> Result<(), String> {
    let api_key = std::env::var("SENDGRID_API_KEY").ok();
    let from_email =
        std::env::var("OTP_FROM_EMAIL").unwrap_or_else(|_| "noreply@aurlum.app".to_string());

    match api_key {
        Some(key) => {
            let body = serde_json::json!({
                "personalizations": [{
                    "to": [{ "email": to_email }]
                }],
                "from": { "email": from_email, "name": "Aurlum" },
                "subject": "【Aurlum】本人確認コード",
                "content": [{
                    "type": "text/plain",
                    "value": format!(
                        "同意書閲覧のための本人確認コードです。\n\n認証コード: {}\n\nこのコードは5分間有効です。\n心当たりがない場合は、このメールを無視してください。",
                        otp
                    )
                }]
            });

            let resp = http_client
                .post("https://api.sendgrid.com/v3/mail/send")
                .header("Authorization", format!("Bearer {}", key))
                .header("Content-Type", "application/json")
                .json(&body)
                .send()
                .await
                .map_err(|e| format!("Failed to send email: {}", e))?;

            if resp.status().is_success() {
                Ok(())
            } else {
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                Err(format!("SendGrid error {}: {}", status, text))
            }
        }
        None => {
            // 開発モード: コンソールにOTPを出力
            println!("[DEV] OTP for {}: {}", to_email, otp);
            Ok(())
        }
    }
}
