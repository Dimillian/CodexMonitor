use base64::Engine;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::fs;
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Clone, Debug)]
pub(crate) struct AuthAccount {
    pub(crate) profile_id: String,
    pub(crate) email: Option<String>,
    pub(crate) plan_type: Option<String>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct SavedAuthProfile {
    pub(crate) id: String,
    pub(crate) account_type: String,
    pub(crate) email: Option<String>,
    pub(crate) plan_type: Option<String>,
    pub(crate) requires_openai_auth: Option<bool>,
    pub(crate) rate_limits: Option<Value>,
    pub(crate) updated_at: i64,
    pub(crate) auth: Value,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SavedAuthProfilesStore {
    active_profile_id: Option<String>,
    profiles: Vec<SavedAuthProfile>,
}

const AUTH_FILE_NAME: &str = "auth.json";
const SAVED_AUTH_PROFILES_FILE_NAME: &str = "auth-profiles.json";

pub(crate) fn build_account_response(
    response: Option<Value>,
    fallback: Option<AuthAccount>,
) -> Value {
    let mut account = response
        .as_ref()
        .and_then(extract_account_map)
        .unwrap_or_default();
    if let Some(fallback) = fallback {
        let account_type = account
            .get("type")
            .and_then(|value| value.as_str())
            .map(|value| value.to_ascii_lowercase());
        let allow_fallback = account.is_empty()
            || matches!(
                account_type.as_deref(),
                None | Some("chatgpt") | Some("unknown")
            );
        if allow_fallback {
            if !account.contains_key("email") {
                if let Some(email) = fallback.email {
                    account.insert("email".to_string(), Value::String(email));
                }
            }
            if !account.contains_key("planType") {
                if let Some(plan) = fallback.plan_type {
                    account.insert("planType".to_string(), Value::String(plan));
                }
            }
            if !account.contains_key("type") {
                account.insert("type".to_string(), Value::String("chatgpt".to_string()));
            }
        }
    }

    let account_value = if account.is_empty() {
        Value::Null
    } else {
        Value::Object(account)
    };
    let mut result = Map::new();
    result.insert("account".to_string(), account_value);
    if let Some(requires_openai_auth) = response.as_ref().and_then(extract_requires_openai_auth) {
        result.insert(
            "requiresOpenaiAuth".to_string(),
            Value::Bool(requires_openai_auth),
        );
    }
    Value::Object(result)
}

pub(crate) fn read_auth_account(codex_home: Option<PathBuf>) -> Option<AuthAccount> {
    let codex_home = codex_home?;
    let auth_path = codex_home.join(AUTH_FILE_NAME);
    let data = fs::read(auth_path).ok()?;
    let auth_value: Value = serde_json::from_slice(&data).ok()?;
    read_auth_account_from_value(&auth_value)
}

pub(crate) fn list_saved_auth_profiles(codex_home: PathBuf) -> Result<Value, String> {
    let store = load_saved_auth_profiles_store(&codex_home)?;
    Ok(saved_auth_profiles_store_to_value(&store))
}

pub(crate) fn sync_saved_auth_profile(
    codex_home: PathBuf,
    account: Option<Value>,
    rate_limits: Option<Value>,
) -> Result<Value, String> {
    let auth_value = read_auth_value(&codex_home)?;
    let auth_account = read_auth_account_from_value(&auth_value)
        .ok_or_else(|| "Unable to identify the current auth profile".to_string())?;

    let mut store = load_saved_auth_profiles_store(&codex_home)?;
    let synced_profile = SavedAuthProfile {
        id: auth_account.profile_id.clone(),
        account_type: normalize_account_type(
            account
                .as_ref()
                .and_then(extract_account_map)
                .as_ref()
                .and_then(|map| map.get("type"))
                .and_then(Value::as_str),
        )
        .to_string(),
        email: auth_account.email.clone(),
        plan_type: account
            .as_ref()
            .and_then(extract_account_map)
            .as_ref()
            .and_then(|map| map.get("planType"))
            .and_then(Value::as_str)
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .or(auth_account.plan_type.clone()),
        requires_openai_auth: account.as_ref().and_then(extract_requires_openai_auth),
        rate_limits: rate_limits.and_then(normalize_rate_limits_value),
        updated_at: current_timestamp_ms(),
        auth: auth_value,
    };

    upsert_saved_auth_profile(&mut store, synced_profile);
    store.active_profile_id = Some(auth_account.profile_id);
    save_saved_auth_profiles_store(&codex_home, &store)?;

    Ok(saved_auth_profiles_store_to_value(&store))
}

pub(crate) fn activate_saved_auth_profile(
    codex_home: PathBuf,
    profile_id: &str,
) -> Result<Value, String> {
    let mut store = load_saved_auth_profiles_store(&codex_home)?;
    let profile = store
        .profiles
        .iter()
        .find(|entry| entry.id == profile_id)
        .cloned()
        .ok_or_else(|| "Saved auth profile not found".to_string())?;

    fs::create_dir_all(&codex_home)
        .map_err(|err| format!("Failed to prepare CODEX_HOME at {}: {err}", codex_home.display()))?;
    let auth_path = codex_home.join(AUTH_FILE_NAME);
    let auth_bytes = serde_json::to_vec_pretty(&profile.auth)
        .map_err(|err| format!("Failed to serialize saved auth profile: {err}"))?;
    fs::write(&auth_path, auth_bytes)
        .map_err(|err| format!("Failed to activate saved auth profile at {}: {err}", auth_path.display()))?;

    store.active_profile_id = Some(profile.id.clone());
    if let Some(existing_profile) = store.profiles.iter_mut().find(|entry| entry.id == profile.id) {
        existing_profile.updated_at = current_timestamp_ms();
    }
    save_saved_auth_profiles_store(&codex_home, &store)?;

    Ok(saved_auth_profiles_store_to_value(&store))
}

fn read_auth_account_from_value(auth_value: &Value) -> Option<AuthAccount> {
    let tokens = auth_value.get("tokens")?;
    let id_token = tokens
        .get("idToken")
        .or_else(|| tokens.get("id_token"))
        .and_then(|value| value.as_str())?;
    let payload = decode_jwt_payload(id_token)?;

    let auth_dict = payload
        .get("https://api.openai.com/auth")
        .and_then(|value| value.as_object());
    let profile_dict = payload
        .get("https://api.openai.com/profile")
        .and_then(|value| value.as_object());
    let plan = normalize_string(
        auth_dict
            .and_then(|dict| dict.get("chatgpt_plan_type"))
            .or_else(|| payload.get("chatgpt_plan_type")),
    );
    let email = normalize_string(
        payload
            .get("email")
            .or_else(|| profile_dict.and_then(|dict| dict.get("email"))),
    );

    if email.is_none() && plan.is_none() {
        return None;
    }

    Some(AuthAccount {
        profile_id: derive_profile_id(&payload, email.as_deref(), id_token),
        email,
        plan_type: plan,
    })
}

fn saved_auth_profiles_store_to_value(store: &SavedAuthProfilesStore) -> Value {
    let mut profiles = store.profiles.clone();
    profiles.sort_by(|left, right| {
        let left_is_active = store.active_profile_id.as_deref() == Some(left.id.as_str());
        let right_is_active = store.active_profile_id.as_deref() == Some(right.id.as_str());
        right_is_active
            .cmp(&left_is_active)
            .then_with(|| right.updated_at.cmp(&left.updated_at))
            .then_with(|| left.email.cmp(&right.email))
    });

    json!({
        "activeProfileId": store.active_profile_id,
        "profiles": profiles.into_iter().map(|profile| {
            json!({
                "id": profile.id,
                "accountType": profile.account_type,
                "email": profile.email,
                "planType": profile.plan_type,
                "requiresOpenaiAuth": profile.requires_openai_auth,
                "rateLimits": profile.rate_limits,
                "updatedAt": profile.updated_at,
            })
        }).collect::<Vec<_>>(),
    })
}

fn upsert_saved_auth_profile(store: &mut SavedAuthProfilesStore, profile: SavedAuthProfile) {
    if let Some(existing) = store.profiles.iter_mut().find(|entry| entry.id == profile.id) {
        *existing = profile;
        return;
    }
    store.profiles.push(profile);
}

fn load_saved_auth_profiles_store(codex_home: &Path) -> Result<SavedAuthProfilesStore, String> {
    let store_path = codex_home.join(SAVED_AUTH_PROFILES_FILE_NAME);
    if !store_path.exists() {
        return Ok(SavedAuthProfilesStore::default());
    }
    let data = fs::read(&store_path)
        .map_err(|err| format!("Failed to read saved auth profiles at {}: {err}", store_path.display()))?;
    serde_json::from_slice(&data)
        .map_err(|err| format!("Failed to parse saved auth profiles at {}: {err}", store_path.display()))
}

fn save_saved_auth_profiles_store(
    codex_home: &Path,
    store: &SavedAuthProfilesStore,
) -> Result<(), String> {
    fs::create_dir_all(codex_home)
        .map_err(|err| format!("Failed to prepare CODEX_HOME at {}: {err}", codex_home.display()))?;
    let store_path = codex_home.join(SAVED_AUTH_PROFILES_FILE_NAME);
    let data = serde_json::to_vec_pretty(store)
        .map_err(|err| format!("Failed to serialize saved auth profiles: {err}"))?;
    fs::write(&store_path, data)
        .map_err(|err| format!("Failed to write saved auth profiles at {}: {err}", store_path.display()))
}

fn read_auth_value(codex_home: &Path) -> Result<Value, String> {
    let auth_path = codex_home.join(AUTH_FILE_NAME);
    let data = fs::read(&auth_path)
        .map_err(|err| format!("Failed to read auth data at {}: {err}", auth_path.display()))?;
    serde_json::from_slice(&data)
        .map_err(|err| format!("Failed to parse auth data at {}: {err}", auth_path.display()))
}

fn derive_profile_id(payload: &Value, email: Option<&str>, id_token: &str) -> String {
    let subject = normalize_string(payload.get("sub"));
    let source = if let Some(subject) = subject {
        format!("sub:{subject}")
    } else if let Some(email) = email {
        format!("email:{}", email.to_ascii_lowercase())
    } else {
        format!("token:{id_token}")
    };

    let encoded = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(source.as_bytes());
    let compact = encoded.chars().take(24).collect::<String>();
    format!("profile-{compact}")
}

fn normalize_account_type(value: Option<&str>) -> &'static str {
    match value.unwrap_or_default().trim().to_ascii_lowercase().as_str() {
        "chatgpt" => "chatgpt",
        "apikey" => "apikey",
        _ => "unknown",
    }
}

fn normalize_rate_limits_value(value: Value) -> Option<Value> {
    match value {
        Value::Object(map) => Some(Value::Object(map)),
        _ => None,
    }
}

fn current_timestamp_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|value| value.as_millis() as i64)
        .unwrap_or_default()
}

fn extract_account_map(value: &Value) -> Option<Map<String, Value>> {
    let account = value
        .get("account")
        .or_else(|| value.get("result").and_then(|result| result.get("account")))
        .and_then(|value| value.as_object().cloned());
    if account.is_some() {
        return account;
    }
    let root = value.as_object()?;
    if root.contains_key("email") || root.contains_key("planType") || root.contains_key("type") {
        return Some(root.clone());
    }
    None
}

fn extract_requires_openai_auth(value: &Value) -> Option<bool> {
    value
        .get("requiresOpenaiAuth")
        .or_else(|| value.get("requires_openai_auth"))
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("requiresOpenaiAuth"))
        })
        .or_else(|| {
            value
                .get("result")
                .and_then(|result| result.get("requires_openai_auth"))
        })
        .and_then(|value| value.as_bool())
}

fn decode_jwt_payload(token: &str) -> Option<Value> {
    let payload = token.split('.').nth(1)?;
    let decoded = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(payload.as_bytes())
        .or_else(|_| base64::engine::general_purpose::URL_SAFE.decode(payload.as_bytes()))
        .ok()?;
    serde_json::from_slice(&decoded).ok()
}

fn normalize_string(value: Option<&Value>) -> Option<String> {
    value
        .and_then(|value| value.as_str())
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn fallback_account() -> AuthAccount {
        AuthAccount {
            profile_id: "profile-test".to_string(),
            email: Some("chatgpt@example.com".to_string()),
            plan_type: Some("plus".to_string()),
        }
    }

    fn result_account_map(value: &Value) -> Map<String, Value> {
        value
            .get("account")
            .and_then(Value::as_object)
            .cloned()
            .unwrap_or_default()
    }

    #[test]
    fn build_account_response_does_not_fallback_for_apikey() {
        let response = Some(json!({
            "account": {
                "type": "apikey"
            }
        }));
        let result = build_account_response(response, Some(fallback_account()));
        let account = result_account_map(&result);

        assert_eq!(account.get("type").and_then(Value::as_str), Some("apikey"));
        assert!(!account.contains_key("email"));
        assert!(!account.contains_key("planType"));
    }

    #[test]
    fn build_account_response_falls_back_when_account_missing() {
        let result = build_account_response(None, Some(fallback_account()));
        let account = result_account_map(&result);

        assert_eq!(
            account.get("email").and_then(Value::as_str),
            Some("chatgpt@example.com"),
        );
        assert_eq!(
            account.get("planType").and_then(Value::as_str),
            Some("plus")
        );
        assert_eq!(account.get("type").and_then(Value::as_str), Some("chatgpt"));
    }

    #[test]
    fn build_account_response_allows_fallback_for_chatgpt_type() {
        let response = Some(json!({
            "account": {
                "type": "chatgpt"
            }
        }));
        let result = build_account_response(response, Some(fallback_account()));
        let account = result_account_map(&result);

        assert_eq!(account.get("type").and_then(Value::as_str), Some("chatgpt"));
        assert_eq!(
            account.get("email").and_then(Value::as_str),
            Some("chatgpt@example.com"),
        );
        assert_eq!(
            account.get("planType").and_then(Value::as_str),
            Some("plus")
        );
    }

    #[test]
    fn read_auth_account_from_value_derives_stable_profile_id() {
        let payload = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(
            br#"{"sub":"user-123","email":"user@example.com","https://api.openai.com/auth":{"chatgpt_plan_type":"pro"}}"#,
        );
        let auth_value = json!({
            "tokens": {
                "idToken": format!("header.{payload}.signature")
            }
        });

        let account = read_auth_account_from_value(&auth_value).expect("expected account");

        assert_eq!(account.email.as_deref(), Some("user@example.com"));
        assert_eq!(account.plan_type.as_deref(), Some("pro"));
        assert!(account.profile_id.starts_with("profile-"));
    }
}
