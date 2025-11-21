"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
// packages/mofix-vscode/src/extension.ts
const vscode = __importStar(require("vscode"));
const cp = __importStar(require("child_process"));
const path = __importStar(require("path"));
const fs = __importStar(require("fs"));
/**
 * .mofix/config.json 읽어서 resultId / projectName 가져오기
 */
function loadMoFixConfig(root) {
    try {
        const configPath = path.join(root, '.mofix', 'config.json');
        if (!fs.existsSync(configPath)) {
            return null;
        }
        const raw = fs.readFileSync(configPath, 'utf8');
        return JSON.parse(raw);
    }
    catch (err) {
        console.error('[MoFix] Failed to read .mofix/config.json', err);
        return null;
    }
}
/**
 * 리뷰 페이지 URL 만들기
 * - 항상 루트(/)로 보내고
 * - from=vscode, resultId=... 쿼리로 붙여서 전달
 * - resultId 없으면 demo-result 로 fallback (테스트용)
 */
function buildReviewUrl(cfg) {
    const base = 'http://localhost:5002';
    const params = new URLSearchParams();
    params.set('from', 'vscode');
    // ✅ 실제 resultId 있으면 그걸 쓰고, 없으면 "demo-result" 로 저장
    const rid = cfg?.resultId || 'demo-result';
    params.set('resultId', rid);
    const query = params.toString();
    return `${base}/?${query}`;
}
/**
 * 플랫폼별 npm 실행 파일 경로 찾기
 */
function getNpmCommand() {
    if (process.platform === 'win32') {
        return 'npm.cmd';
    }
    const candidates = [
        '/opt/homebrew/bin/npm', // Apple Silicon macOS
        '/usr/local/bin/npm', // Intel macOS
        '/usr/bin/npm', // 기타
    ];
    for (const p of candidates) {
        if (fs.existsSync(p)) {
            return p;
        }
    }
    // 위에 없으면 PATH 에서 찾도록
    return 'npm';
}
/**
 * npm run build 실행해서 결과를 Promise로 반환
 */
function runBuild(root, channel) {
    return new Promise((resolve, reject) => {
        const command = getNpmCommand();
        const args = ['run', 'build'];
        channel.appendLine('');
        channel.appendLine(`> ${command} ${args.join(' ')}`);
        channel.appendLine('');
        const child = cp.spawn(command, args, {
            cwd: root,
            shell: false,
            env: {
                ...process.env,
                NODE_ENV: 'production',
                PATH: `${process.env.PATH ?? ''}:/usr/local/bin:/opt/homebrew/bin`,
            },
        });
        child.stdout.on('data', (data) => {
            channel.append(data.toString());
        });
        child.stderr.on('data', (data) => {
            channel.append(data.toString());
        });
        child.on('error', (err) => {
            channel.appendLine('');
            channel.appendLine(`[MoFix] Failed to start build process: ${String(err)}`);
            reject(err);
        });
        child.on('close', (code, signal) => {
            channel.appendLine('');
            channel.appendLine(`[MoFix] Build process exited with code=${code}, signal=${signal ?? 'null'}`);
            resolve({ code, signal });
        });
    });
}
/**
 * 현재 워크스페이스 루트 구하기
 */
function getWorkspaceRoot() {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
        return null;
    }
    // MoFix 결과 zip 은 보통 단일 워크스페이스 기준이라 0번만 사용
    return folders[0].uri.fsPath;
}
/**
 * "MoFix: Verify Build" 명령의 실제 동작
 */
async function verifyBuildCommand() {
    const root = getWorkspaceRoot();
    if (!root) {
        vscode.window.showErrorMessage('MoFix: No workspace folder is open.');
        return;
    }
    const channel = vscode.window.createOutputChannel('MoFix');
    channel.show(true);
    channel.appendLine('[MoFix] Verifying build...');
    channel.appendLine(`[MoFix] Workspace: ${root}`);
    const cfg = loadMoFixConfig(root);
    const projectName = cfg?.projectName ?? path.basename(root);
    if (!cfg || !cfg.resultId) {
        channel.appendLine('[MoFix] .mofix/config.json 또는 resultId 를 찾지 못했습니다. demo-result 로 fallback 합니다.');
    }
    try {
        const { code } = await runBuild(root, channel);
        if (code === 0) {
            channel.appendLine('');
            channel.appendLine('[MoFix] ✅ Build completed successfully.');
            const choice = await vscode.window.showInformationMessage(`✅ Build succeeded for "${projectName}". Would you like to write a review for MoFix?`, 'Write a review', 'Later');
            if (choice === 'Write a review') {
                const url = buildReviewUrl(cfg);
                await vscode.env.openExternal(vscode.Uri.parse(url));
            }
        }
        else {
            channel.appendLine('');
            channel.appendLine('[MoFix] ❌ Build failed. See output above for details.');
            vscode.window.showErrorMessage(`MoFix: build failed for "${projectName}". Open the "MoFix" output panel for details.`);
        }
    }
    catch (err) {
        console.error('[MoFix] verifyBuild failed', err);
        vscode.window.showErrorMessage('MoFix: Failed to run build. See "MoFix" output for details.');
    }
}
/**
 * 언제든지 수동으로 리뷰 페이지 열기용 명령
 */
async function openReviewCommand() {
    const root = getWorkspaceRoot();
    const cfg = root ? loadMoFixConfig(root) : null;
    if (!cfg || !cfg.resultId) {
        console.log('[MoFix] .mofix/config.json 또는 resultId 없음 — demo-result 로 리뷰 페이지 오픈');
    }
    const url = buildReviewUrl(cfg);
    await vscode.env.openExternal(vscode.Uri.parse(url));
}
function activate(context) {
    const verify = vscode.commands.registerCommand('mofix.verifyBuild', verifyBuildCommand);
    const openReview = vscode.commands.registerCommand('mofix.openReview', openReviewCommand);
    context.subscriptions.push(verify, openReview);
}
function deactivate() {
    // 아무 것도 필요 없음
}
//# sourceMappingURL=extension.js.map