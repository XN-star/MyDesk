// 打包产物重命名：把 tauri 产出的 NSIS 安装包复制为统一的 MyDesk-v<version>-setup.exe。
// 用法：node scripts/rename-dist.mjs（在 npm run dist 中于 tauri build 之后自动执行）。
import { copyFileSync, existsSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const version = require('../package.json').version;

const here = dirname(fileURLToPath(import.meta.url)); // scripts/
const repoRoot = resolve(here, '..');
const bundleDir = resolve(repoRoot, 'src-tauri/target/release/bundle/nsis');
const outPath = join(repoRoot, `MyDesk-v${version}-setup.exe`);

if (!existsSync(bundleDir)) {
  console.error(`未找到安装包目录：${bundleDir}`);
  process.exit(1);
}

const setups = readdirSync(bundleDir).filter((f) => f.endsWith('-setup.exe'));
if (setups.length === 0) {
  console.error('未找到 *-setup.exe 安装包');
  process.exit(1);
}
// 目录中可能残留历史版本安装包，精确匹配当前版本
const current = setups.find((f) => f.includes(`_${version}_`));
if (!current) {
  console.error(`未找到版本 ${version} 的安装包，现有：${setups.join(', ')}`);
  process.exit(1);
}

copyFileSync(join(bundleDir, current), outPath);
console.log(`已复制 ${current} → ${outPath}`);
