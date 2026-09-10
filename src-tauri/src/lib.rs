mod backup;
mod commands;
mod db;
mod models;
mod reminders;
mod shortcut;
mod timer;

use std::collections::HashSet;
use std::sync::atomic::AtomicBool;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{TrayIcon, TrayIconBuilder};
use timer::TimerState;

pub struct Db(pub Mutex<rusqlite::Connection>);
pub struct Notified(pub Mutex<HashSet<String>>);

fn show_main(app: &tauri::AppHandle) {
    if let Some(win) = app.get_webview_window("main") {
        let _ = win.show();
        let _ = win.unminimize();
        let _ = win.set_focus();
    }
}

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
                // 快捷键被其他程序占用时降级为仅日志，不让应用启动即崩。
                if let Err(e) = app.global_shortcut().register("alt+space") {
                    println!("全局快捷键 alt+space 注册失败（可能被其他程序占用）：{e}");
                }
            }

            // 系统托盘：左键点击显示主窗口；菜单含「显示主界面」「退出」。
            let show_item = MenuItem::with_id(app, "show", "显示主界面", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&show_item, &sep, &quit_item])?;
            TrayIconBuilder::with_id("main-tray")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("MyDesk 个人工作台")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => show_main(app),
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let tauri::tray::TrayIconEvent::Click { button: tauri::tray::MouseButton::Left, button_state: tauri::tray::MouseButtonState::Up, .. } = event {
                        show_main(tray.app_handle());
                    }
                })
                .build(app)?;

            // 计时心跳：1s 轮询刷托盘 tooltip + 番茄状态机
            let tray: TrayIcon = app.tray_by_id("main-tray").expect("main-tray");
            timer::start(app.handle().clone(), tray);
            app.manage(TimerState {
                active: AtomicBool::new(false),
                pomodoro: Mutex::new(None),
                task_id: Mutex::new(None),
            });

            // 窗口配置 create=false：状态注册完成后手动创建，
            // 避免前端过早 invoke 时 Db 状态尚未注册。
            for window_config in app.config().app.windows.iter() {
                tauri::WebviewWindowBuilder::from_config(app.handle(), window_config)?.build()?;
            }

            // 主窗口点 × 不直接退出：前端弹确认（退出/后台），由事件决定行为。
            // 必须在窗口创建之后挂接（create=false 时此前窗口尚不存在）。
            let main = app.get_webview_window("main").unwrap();
            let main_for_emit = main.clone();
            main.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    // 只拦截用户手动关闭（程序性 hide 不触发 CloseRequested）。
                    api.prevent_close();
                    let _ = main_for_emit.emit("app://close-requested", ());
                }
            });
            Ok(())
        })
        .on_window_event(|_window, _event| {})
        .invoke_handler(tauri::generate_handler![
            commands::task_list,
            commands::task_create,
            commands::task_update,
            commands::task_delete,
            commands::board_list,
            commands::board_create,
            commands::board_rename,
            commands::board_delete,
            commands::habit_list,
            commands::habit_create,
            commands::habit_update,
            commands::habit_delete,
            commands::habit_toggle,
            commands::habit_logs,
            commands::note_list,
            commands::note_create,
            commands::note_update,
            commands::note_delete,
            commands::link_list,
            commands::link_create,
            commands::link_update,
            commands::link_delete,
            commands::link_move,
            commands::link_open,
            commands::link_run,
            commands::settings_all,
            commands::settings_set,
            commands::timer_start,
            commands::timer_stop,
            commands::timer_status,
            commands::time_entries,
            commands::pomodoro_set,
            commands::pomodoro_start,
            commands::pomodoro_stop,
            commands::quit_app,
            commands::backup_export,
            commands::backup_import,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
