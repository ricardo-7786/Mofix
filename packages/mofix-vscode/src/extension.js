"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
var vscode = require("vscode");
var cp = require("child_process");
var path = require("path");
var fs = require("fs");
/**
 * .mofix/config.json 읽기 (있으면 resultId 추출)
 */
function loadMoFixConfig(root) {
    try {
        var p = path.join(root, ".mofix", "config.json");
        if (!fs.existsSync(p))
            return null;
        var raw = fs.readFileSync(p, "utf8");
        return JSON.parse(raw);
    }
    catch (_a) {
        return null;
    }
}
function activate(context) {
    var _this = this;
    var output = vscode.window.createOutputChannel("MoFix");
    var disposable = vscode.commands.registerCommand("mofix.verifyBuild", function () { return __awaiter(_this, void 0, void 0, function () {
        var folders, root, cfg, cmd, args, child;
        var _this = this;
        return __generator(this, function (_a) {
            folders = vscode.workspace.workspaceFolders;
            if (!folders || folders.length === 0) {
                vscode.window.showErrorMessage("MoFix: No workspace folder is open. Please open your MoFix project folder first.");
                return [2 /*return*/];
            }
            root = folders[0].uri.fsPath;
            cfg = loadMoFixConfig(root);
            output.clear();
            output.appendLine("MoFix: Verifying build...");
            output.appendLine("Workspace: ".concat(root));
            if (cfg === null || cfg === void 0 ? void 0 : cfg.resultId) {
                output.appendLine("MoFix resultId: ".concat(cfg.resultId));
            }
            output.show(true);
            cmd = process.platform === "win32" ? "npm.cmd" : "npm";
            args = ["run", "build"];
            child = cp.spawn(cmd, args, {
                cwd: root,
                shell: false,
                env: __assign({}, process.env),
            });
            child.stdout.on("data", function (data) {
                output.append(data.toString());
            });
            child.stderr.on("data", function (data) {
                output.append(data.toString());
            });
            child.on("error", function (err) {
                output.appendLine("");
                output.appendLine("MoFix: Failed to start build: ".concat(String(err)));
                vscode.window.showErrorMessage("MoFix: Failed to run `npm run build`. Check the MoFix output channel.");
            });
            child.on("close", function (code) { return __awaiter(_this, void 0, void 0, function () {
                var actions, picked, url;
                var _a;
                return __generator(this, function (_b) {
                    switch (_b.label) {
                        case 0:
                            output.appendLine("");
                            if (!(code === 0)) return [3 /*break*/, 2];
                            actions = ["OK"];
                            // config에 resultId가 있으면 나중에 리뷰 페이지 열기 옵션 추가
                            if (cfg === null || cfg === void 0 ? void 0 : cfg.resultId) {
                                actions.push("Write Review in MoFix");
                            }
                            return [4 /*yield*/, (_a = vscode.window).showInformationMessage.apply(_a, __spreadArray(["MoFix: Build succeeded!"], actions, false))];
                        case 1:
                            picked = _b.sent();
                            if (picked === "Write Review in MoFix" && (cfg === null || cfg === void 0 ? void 0 : cfg.resultId)) {
                                url = "https://mofix.app/review?resultId=".concat(encodeURIComponent(cfg.resultId));
                                vscode.env.openExternal(vscode.Uri.parse(url));
                            }
                            return [3 /*break*/, 3];
                        case 2:
                            // 빌드 실패
                            vscode.window.showErrorMessage("MoFix: Build failed with exit code ".concat(code, ". Check the MoFix output channel."));
                            _b.label = 3;
                        case 3: return [2 /*return*/];
                    }
                });
            }); });
            return [2 /*return*/];
        });
    }); });
    context.subscriptions.push(disposable);
}
function deactivate() {
    // 특별히 할 일 없음
}
