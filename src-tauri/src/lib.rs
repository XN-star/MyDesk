mod backup;
mod commands;
mod db;
mod models;
mod reminders;
mod shortcut;

use std::collections::HashSet;
use std::sync::Mutex;
use tauri::Manager;

pub struct Db(pub Mutex<rusqlite::Connection>);
pub struct Notified(pub Mutex<HashSet<String>>);

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(shortcut::handle)
                .build(),
        )
        .setup(|app| {
            let conn = db::init(app.handle())?;
            app.manage(Db(Mutex::new(conn)));
            app.manage(Notified(Mutex::new(HashSet::new())));
            reminders::start(app.handle().clone());
            #[cfg(desktop)]
            {
                use tauri_plugin_global_shortcut::GlobalShortcutExt;
                app.global_shortcut().register("alt+space")?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::task_list,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::event_list_month,
            commands::event_list_date,
            commands::event_create,
            commands::event_update,
            commands::event_delete,
            commands::settings_all,
            commands::settings_set,
            commands::backup_export,
            commands::backup_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
