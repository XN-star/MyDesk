// 打包产物重命名：把 tauri 产出的 NSIS 安装包复制为统一的 MyDesk-v<version>-setup.exe。
// 用法：node scripts/rename-dist.mjs（在 npm run dist 中于 tauri build 之后自动执行）。
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const version = require('../package.json').version;

const bundleDir = new URL('../src-tauri/target/release/bundle/nsis/', import.meta.url);
const outDir = new URL('../', import.meta.url);

if (!existsSync(bundleDir)) {
  console.error(`未找到安装包目录：${bundleDir.pathname}`);
  process.exit(1);
}

const setups = readdirSync(bundleDir).filter((f) => f.endsWith('-setup.exe'));
if (setups.length === 0) {
  console.error('未找到 *-setup.exe 安装包');
  process.exit(1);
}

const target = `MyDesk-v${version}-setup.exe`;
copyFileSync(join(bundleDir.pathname, setups[0]), new URL(target, outDir).pathname);
console.log(`已复制 ${setups[0]} → ${target}`);
