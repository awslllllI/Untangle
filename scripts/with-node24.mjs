import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const isWin = process.platform === 'win32';
const nodeName = isWin ? 'node.exe' : 'node';

/**
 * 解析本项目应使用的 Node 24 安装目录。
 */
function resolveNodeHome() {
  const candidates = [];

  if (process.env.UNTANGLE_NODE_HOME) {
    candidates.push(process.env.UNTANGLE_NODE_HOME.trim());
  }

  const localFile = path.join(root, '.node-home');
  if (fs.existsSync(localFile)) {
    const line = fs
      .readFileSync(localFile, 'utf8')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .find((s) => s && !s.startsWith('#'));
    if (line) {
      candidates.push(line);
    }
  }

  if (isWin) {
    candidates.push('D:\\software\\nodejs', 'C:\\Program Files\\nodejs');
  }

  if (process.versions.node.startsWith('24.')) {
    candidates.push(path.dirname(process.execPath));
  }

  for (const home of candidates) {
    if (isNode24Home(home)) {
      return path.resolve(home);
    }
  }

  return null;
}

/**
 * 判断目录是否为可用的 Node 24 安装根目录。
 */
function isNode24Home(home) {
  if (!home) {
    return false;
  }
  const exe = path.join(home, nodeName);
  if (!fs.existsSync(exe)) {
    return false;
  }
  const result = spawnSync(exe, ['-p', 'process.versions.node'], {
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    return false;
  }
  return result.stdout.trim().startsWith('24.');
}

/**
 * 在 Node 24 环境下执行子命令（PATH 优先该 Node）。
 */
function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('用法: node scripts/with-node24.mjs <command> [args...]');
    process.exit(1);
  }

  const nodeHome = resolveNodeHome();
  if (!nodeHome) {
    console.error(
      [
        '未找到本项目所需的 Node 24。',
        '请任选其一：',
        '  1) 复制 .node-home.example 为 .node-home，写入 Node 24 安装目录',
        '  2) 设置环境变量 UNTANGLE_NODE_HOME',
        `当前 shell 的 Node 为 ${process.versions.node}`,
      ].join('\n'),
    );
    process.exit(1);
  }

  const nodeExe = path.join(nodeHome, nodeName);
  const env = { ...process.env };
  env.PATH = `${nodeHome}${path.delimiter}${env.PATH ?? ''}`;
  env.UNTANGLE_NODE_HOME = nodeHome;

  // Windows 上 npm/npx 多为 cmd 脚本，交给 nodeHome 下的 npm.cmd
  const [command, ...commandArgs] = args;
  const resolvedCommand = resolveCommand(nodeHome, command);

  const result = spawnSync(resolvedCommand, commandArgs, {
    stdio: 'inherit',
    env,
    cwd: root,
    // 直接跑 node.exe 时不必 shell，避免 Windows 吃掉引号；.cmd 才需要 shell
    shell: isWin && resolvedCommand.toLowerCase().endsWith('.cmd'),
  });

  if (result.error) {
    console.error(result.error.message);
    console.error(`Node 24 路径: ${nodeExe}`);
    process.exit(1);
  }

  process.exit(result.status ?? 1);
}

/**
 * 将简写命令解析为 Node 24 目录下的可执行文件（若存在）。
 */
function resolveCommand(nodeHome, command) {
  if (command === 'node') {
    return path.join(nodeHome, nodeName);
  }

  if (isWin) {
    const cmdPath = path.join(nodeHome, `${command}.cmd`);
    if (fs.existsSync(cmdPath)) {
      return cmdPath;
    }
  } else {
    const binPath = path.join(nodeHome, command);
    if (fs.existsSync(binPath)) {
      return binPath;
    }
  }

  return command;
}

main();
