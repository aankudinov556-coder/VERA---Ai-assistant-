use keyring::Entry;
use tauri_plugin_sql::{Migration, MigrationKind};

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

/// Схема базы истории и памяти. Новые изменения — только новыми миграциями (version + 1).
fn migrations() -> Vec<Migration> {
    vec![Migration {
        version: 1,
        description: "history_and_memory",
        sql: "
            CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL
            );
            CREATE TABLE messages (
                id TEXT PRIMARY KEY,
                conversation_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            CREATE INDEX idx_messages_conversation ON messages(conversation_id, created_at);
            CREATE TABLE memories (
                id TEXT PRIMARY KEY,
                content TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
        ",
        kind: MigrationKind::Up,
    }]
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(
            tauri_plugin_sql::Builder::default()
                .add_migrations("sqlite:vera.db", migrations())
                .build(),
        )
        .invoke_handler(tauri::generate_handler![get_api_key, set_api_key])
        .run(tauri::generate_context!())
        .expect("ошибка запуска VERA");
}
