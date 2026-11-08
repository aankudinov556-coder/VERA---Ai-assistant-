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

// ---------- Действия для блоков команд ----------

#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// Открыть сайт, файл, папку или программу программой по умолчанию.
#[tauri::command]
fn open_target(target: String) -> Result<(), String> {
    #[cfg(windows)]
    let mut cmd = {
        // url.dll не интерпретирует спецсимволы cmd (&, | и т.п.) — безопаснее, чем `cmd /C start`
        let mut c = std::process::Command::new("rundll32");
        c.args(["url.dll,FileProtocolHandler", &target]);
        c
    };
    #[cfg(target_os = "macos")]
    let mut cmd = {
        let mut c = std::process::Command::new("open");
        c.arg(&target);
        c
    };
    #[cfg(all(unix, not(target_os = "macos")))]
    let mut cmd = {
        let mut c = std::process::Command::new("xdg-open");
        c.arg(&target);
        c
    };
    cmd.spawn().map(|_| ()).map_err(|e| e.to_string())
}

/// Запустить программу с аргументами (не дожидаясь завершения).
#[tauri::command]
fn run_program(path: String, args: Vec<String>) -> Result<(), String> {
    std::process::Command::new(&path)
        .args(&args)
        .spawn()
        .map(|_| ())
        .map_err(|e| format!("{path}: {e}"))
}

/// Выполнить команду PowerShell (на Windows) или sh и вернуть вывод.
#[tauri::command]
async fn run_shell(command: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        #[cfg(windows)]
        let output = {
            use std::os::windows::process::CommandExt;
            let script = format!(
                "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8; {command}"
            );
            std::process::Command::new("powershell")
                .args(["-NoProfile", "-NonInteractive", "-Command", &script])
                .creation_flags(CREATE_NO_WINDOW)
                .output()
        };
        #[cfg(not(windows))]
        let output = std::process::Command::new("sh").args(["-c", &command]).output();

        let out = output.map_err(|e| e.to_string())?;
        let stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        let stderr = String::from_utf8_lossy(&out.stderr).trim().to_string();
        if out.status.success() {
            Ok(stdout)
        } else {
            Err(if stderr.is_empty() { stdout } else { stderr })
        }
    })
    .await
    .map_err(|e| e.to_string())?
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
    },
    Migration {
        version: 2,
        description: "scenarios",
        sql: "
            CREATE TABLE scenarios (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                enabled INTEGER NOT NULL DEFAULT 1,
                data TEXT NOT NULL,
                updated_at INTEGER NOT NULL
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
        .plugin(tauri_plugin_http::init())
        .invoke_handler(tauri::generate_handler![
            get_api_key,
            set_api_key,
            open_target,
            run_program,
            run_shell
        ])
        .run(tauri::generate_context!())
        .expect("ошибка запуска VERA");
}
