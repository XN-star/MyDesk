import { emit } from '@tauri-apps/api/event';
import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';

/** 关闭确认：转为后台 = 隐藏主窗口到托盘；彻底关闭 = 调 Rust 端退出进程。 */
export default function ExitDialog({ onClose }: { onClose: () => void }) {
  async function toTray() {
    onClose();
    await getCurrentWindow().hide();
  }

  async function quit() {
    // 广播给将来的清理钩子；随后由 Rust 端退出整个进程（含托盘与提醒线程）。
    await emit('app://quit').catch(() => {});
    await invoke('quit_app');
  }

  return (
    <div className="overlay center" onClick={onClose}>
      <div className="dialog panel" onClick={(e) => e.stopPropagation()}>
        <h3>关闭程序</h3>
        <p className="muted">
          转为后台后程序将继续运行（任务提醒仍会生效），可从系统托盘图标重新打开窗口。
        </p>
        <div className="dialog-actions">
          <button className="btn" onClick={toTray}>
            转为后台
          </button>
          <button className="btn danger" onClick={quit}>
            彻底关闭
          </button>
          <button className="btn primary" onClick={onClose}>
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
