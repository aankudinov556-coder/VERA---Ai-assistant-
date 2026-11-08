use keyring::Entry;

const SERVICE: &str = "app.vera.assistant";
const ACCOUNT: &str = "openrouter_api_key";

fn entry() -> Result<Entry, String> {
    Entry::new(SERVICE, ACCOUNT).map_err(|e| e.to_string())
}

/// Возвращает сохранённый ключ или пустую строку, если его нет.
#[tauri::command]
fn get_api_key() -> Result<String, String> {
    match entry()?.get_password() {
        Ok(key) => Ok(key),
        Err(keyring::Error::NoEntry) => Ok(String::new()),
        Err(e) => Err(e.to_string()),
    }
}

/// Сохраняет ключ в Windows Credential Manager; пустая строка удаляет запись.
#[tauri::command]
fn set_api_key(key: String) -> Result<(), String> {
    let entry = entry()?;
    if key.is_empty() {
        match entry.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(e.to_string()),
        }
    } else {
        entry.set_password(&key).map_err(|e| e.to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![get_api_key, set_api_key])
        .run(tauri::generate_context!())
        .expect("ошибка запуска VERA");
}
