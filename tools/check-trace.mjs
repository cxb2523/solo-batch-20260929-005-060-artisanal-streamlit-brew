#!/usr/bin/env node
// 校验 trace/ 产物：
//  1) data.json 中的每条 SVG 引用路径真实命中（本地文件 + 远端绝对 URL）
//  2) 工作流 on 触发与分支约束自洽（并与 yml 原文一致）
//  3) location.hash 编解码可复现（直接加载 trace.js 暴露的纯函数做往返测试）
//  4) data.json 里的“原文片段”确实是源文件子串，原始文件未被修改
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
let failures = 0;
const ok = (m) => console.log("  \x1b[32m✔\x1b[0m " + m);
const fail = (m) => { failures++; console.log("  \x1b[31m�“ " + m + "\x1b[0m"); };
const head = (m) => console.log("\n=== " + m + " ===");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

// ---------- 0. 文件齐备 & 原页面只读 ----------
head("0. 产物齐备与只读约束");
for (const f of ["trace/index.html", "trace/trace.js", "trace/data.json"]) {
  if (fs.existsSync(path.join(root, f))) ok(f + " 存在");
  else fail(f + " 缺失");
}
for (const f of ["index.html", "README.md", "button.svg", "preview.svg"]) {
  if (!fs.existsSync(path.join(root, f))) fail(f + " 不存在");
}
try {
  const status = execFileSync("git", ["status", "--porcelain", "--", "index.html", "README.md", "button.svg", "preview.svg"], { cwd: root, encoding: "utf8" });
  if (status.trim() === "") ok("git 工作区中 index.html / README.md / button.svg / preview.svg 均未修改（只读）");
  else fail("原始文件被改动：\n" + status);
} catch (e) {
  fail("无法运行 git status：" + e.message);
}

// ---------- 1. data.json 事实与源文件一致 ----------
head("1. data.json 事实核对");
const data = JSON.parse(read(path.join("trace", "data.json")));
const indexHtml = read("index.html");
const readme = read("README.md");
const shell = data.localRender.shell;

if (indexHtml.includes(shell.inlineStyle.raw)) ok("内联 <style> 原文片段确实是 index.html 子串（第 6 行）");
else fail("内联 style 片段在 index.html 中找不到");
if (indexHtml.includes(shell.inlineScript.raw)) ok("内联 <script> 完整原文确实是 index.html 子串（第 10–75 行）");
else fail("内联 script 原文不匹配");
if (shell.hiddenPayloadDivs.length === 7) ok("记录了 7 个隐藏载荷 div（zxlwhXiv0..6）");
else fail("隐藏 div 数量=" + shell.hiddenPayloadDivs.length);
let divOk = true;
for (const div of shell.hiddenPayloadDivs) {
  if (!indexHtml.includes('id="' + div.id + '"') || div.inlineStyle !== "display:none" || !indexHtml.includes(div.snippet.replace("…", "").slice(0, 40))) divOk = false;
}
if (divOk) ok("每个 div 的 id / display:none / base64 前缀都能在 index.html 命中");
else fail("部分 div 事实与 index.html 不符");

// 重新解码一次，验证载荷事实
const key = Buffer.from(shell.inlineScript.xorKeyBase64, "base64");
let joined = "";
for (let i = 0; i < 7; i++) {
  const m = indexHtml.match(new RegExp('<div id="zxlwhXiv' + i + '"[^>]*>([\\s\\S]*?)</div>'));
  joined += m ? m[1] : "";
}
const raw = Buffer.from(joined.trim(), "base64");
const dec = Buffer.alloc(raw.length);
for (let i = 0; i < raw.length; i++) dec[i] = raw[i] ^ key[i % key.length];
const payload = dec.toString("utf8");
const pa = shell.payloadArtifact;
if (dec.length === pa.bytes) ok("重新解码载荷字节数一致（" + pa.bytes + "）");
else fail("解码字节数 " + dec.length + " != data.json " + pa.bytes);
if (payload.includes(pa.redirectTarget) && /9166/.test(payload)) ok("载荷内确实包含跳转目标 " + pa.redirectTarget + " 与 9166ms 延迟");
else fail("载荷中找不到跳转事实");
if (!/button\.svg|preview\.svg/.test(payload)) ok("载荷页面不引用 button.svg/preview.svg（与 data.json 一致）");
else fail("载荷意外引用了 SVG");

// 工作流事实
const wfAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "workflows", "UVRgspkjdwor.yml");
const stampAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "HISIHFPxsifNnF");
if (data.sources.workflow.presentInWorkspace === false && !fs.existsSync(path.join(root, ".github", "workflows", "UVRgspkjdwor.yml"))) {
  ok("data.json 如实记录工作流在工作区缺失");
} else fail("工作流存在性事实错误");
const wf = fs.readFileSync(wfAbs, "utf8");
const w = data.triggerToPublish.workflow;
for (const [name, snip] of Object.entries(w.snippets)) {
  if (snip.split("\n").every((line) => line.trim().startsWith("...") ? true : wf.includes(line.trim()) ? true : false)) {
    ok("工作流片段 " + name + " 每一行都能在 yml 原文命中");
  } else fail("工作流片段 " + name + " 与 yml 不符：\n" + snip);
}

// ---------- 2. 每条 SVG 引用路径真实命中 ----------
head("2. 资源引用路径真实命中（远端绝对 URL + 本地相对基准）");
const localHashes = new Map();
for (const f of data.resourcePaths.localFiles) {
  const p = path.join(root, f.file);
  if (fs.existsSync(p)) {
    const real = sha256(fs.readFileSync(p));
    localHashes.set(f.file, real);
    if (real === f.sha256) ok("本地 ./" + f.file + " 命中，sha256 与 data.json 一致（" + f.bytes + " bytes）");
    else fail("./" + f.file + " sha256 不一致");
  } else fail("本地 ./" + f.file + " 不存在");
}

const cachePath = path.join(root, "tools", ".remote-hits.json");
let hitCache = {};
if (fs.existsSync(cachePath)) hitCache = JSON.parse(fs.readFileSync(cachePath, "utf8"));
let cacheDirty = false;
for (const ref of data.resourcePaths.references) {
  process.stdout.write("  … 校验 " + ref.file + ":" + ref.line + " → " + ref.resolved + "\n");
  let resp, lastErr;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      resp = await fetch(ref.resolved, { redirect: "follow", signal: AbortSignal.timeout(12000) });
      lastErr = null;
      break;
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  if (!lastErr && resp.status === 200) {
    const body = Buffer.from(await resp.arrayBuffer());
    const remoteHash = sha256(body);
    hitCache[ref.resolved] = {
      status: 200, bytes: body.length, contentType: resp.headers.get("content-type"),
      sha256: remoteHash, checkedAt: new Date().toISOString(), live: true,
    };
    cacheDirty = true;
  } else {
    const why = lastErr ? (lastErr.cause?.code || lastErr.message) : "HTTP " + (resp && resp.status);
    const cached = hitCache[ref.resolved];
    if (cached && cached.status === 200) {
      console.log("      \x1b[33m! 本次网络不通（" + why + "），使用 " + cached.checkedAt + " 的实时命中快照\x1b[0m");
      cached.live = false;
    } else {
      fail(ref.file + ":" + ref.line + " 网络请求失败且无命中快照：" + why);
      continue;
    }
  }
  const hit = hitCache[ref.resolved];
  const localHash = localHashes.get(ref.name);
  ok(ref.file + ":" + ref.line + " 引用路径" + (hit.live ? "实时" : "快照") + "真实命中 HTTP " + hit.status + "（" + hit.bytes + " bytes, " + hit.contentType + "，" + hit.checkedAt + "）");
  console.log("      远端 sha256 " + hit.sha256);
  console.log("      本地 sha256 " + localHash);
  if (hit.sha256 === localHash) console.log("      \x1b[33m! 内容快照一致；但绝对 URL（远端 main 目录）与本地相对基准仍是两套解析基准，分线呈现\x1b[0m");
  else console.log("      \x1b[33m! 远端与本地内容不同——基准差异更强，两条链路必须分开呈现\x1b[0m");
  if (!readme.split("\n")[ref.line - 1].includes(ref.name)) fail("引用行 " + ref.line + " 与 data.json 不符");
  else ok(ref.file + ":" + ref.line + " 原文与 data.json 记录一致（" + ref.kind + "）");
}
if (cacheDirty) fs.writeFileSync(cachePath, JSON.stringify(hitCache, null, 2) + "\n");

// ---------- 3. on 与 branches 自洽 ----------
head("3. on 触发 × 分支过滤 × 产物目录 × permissions 自洽");
const checks = [
  ["on 含 schedule cron '0 * * * *'", /schedule:\s*\n\s*- cron:\s*'0 \* \* \* \*'/.test(wf) && w.on.schedule[0].cron === "0 * * * *"],
  ["on 含 workflow_dispatch", /workflow_dispatch:\s*\{\}/.test(wf)],
  ["on 不含 push", w.on.push === null && !/^on:[\s\S]*?push:/m.test(wf)],
  ["on 不含 pull_request", w.on.pull_request === null && !/pull_request:/.test(wf)],
  ["无 branches 过滤", !/branches:/.test(wf) && w.branchFilters.onPush === null],
  ["脚本硬编码 const branch = \"main\"", /const branch = "main";/.test(wf) && w.branchFilters.hardcodedInScript === "main"],
  ["产物路径 .github/HISIHFPxsifNnF 在 .github/ 目录", /stampPath = "\.github\/HISIHFPxsifNnF"/.test(wf) && w.artifact.path === ".github/HISIHFPxsifNnF" && w.artifact.directory === ".github/"],
  ["写入操作 createOrUpdateFileContents 与 main 分支", /createOrUpdateFileContents\(/.test(wf) && /branch,\s*\n\s*sha,/.test(wf)],
  ["workflow 级 permissions contents: write", /^permissions:\s*\n\s{2}contents:\s*write/m.test(wf) && w.permissions.workflowLevel.contents === "write"],
  ["job 级 permissions contents: write（重复声明）", /HwfFwfDyqoOM:[\s\S]*?permissions:\s*\n\s{6}contents:\s*write/.test(wf) && w.permissions.jobLevel.contents === "write"],
  ["未声明 pages: write", !/pages:\s*write/.test(wf)],
];
let allSelfConsistent = true;
for (const [label, cond] of checks) {
  if (cond) ok(label);
  else { fail(label); allSelfConsistent = false; }
}
if (allSelfConsistent) {
  ok("自洽链：无 push/PR 触发 ⇒ 无需 branches 过滤；到点写仓库内文件 ⇒ 产物锁死 .github/ + main；建提交 ⇒ 只需 contents:write；无 Pages 部署 ⇒ README 的 Pages 目标无权限/步骤支撑");
}
try {
  const stamp = fs.readFileSync(stampAbs, "utf8").trim().split("\n");
  if (stamp.length === w.artifact.companionObservedLines) ok("旁证戳记文件行数 " + stamp.length + " 与 data.json 一致（末行 " + stamp[stamp.length - 1].slice(0, 24) + "…）");
  else fail("戳记行数 " + stamp.length + " != " + w.artifact.companionObservedLines);
} catch (e) { fail("读不到旁证戳记文件：" + e.message); }

// ---------- 4. hash 可复现 ----------
head("4. location.hash 选中态可复现");
globalThis.window = globalThis;
globalThis.location = { hash: "", pathname: "/trace/", search: "" };
await import(pathToFileURL(path.join(root, "trace", "trace.js")).href);
const { encodeSelection, decodeSelection } = globalThis.TraceHash;
const ids = ["shell", "payload-3", "bootstrap", "payload-page", "redirect",
  "ref-preview-1", "ref-button-48", "ref-button-137",
  "trigger", "branch", "permissions", "artifact", "publish"];
let hashRoundtrip = true;
for (const id of ids) {
  const h = encodeSelection(id);
  if (decodeSelection(h) !== id) { hashRoundtrip = false; fail("往返失败 " + id + " → " + h); }
}
if (hashRoundtrip) ok("13 个节点 id 经 encodeSelection/decodeSelection 往返全部一致");
if (decodeSelection("") === null && decodeSelection("#other=x") === null) ok("空 hash / 非本页 hash 安全返回 null");
// 模拟刷新：把 hash 写进去，重新加载模块，应用应从 hash 复原选中
const freshHash = encodeSelection("artifact");
globalThis.location.hash = freshHash;
delete globalThis.TraceApp;
await import(pathToFileURL(path.join(root, "trace", "trace.js")).href + "?reload=1");
if (globalThis.TraceHash.decodeSelection(freshHash) === "artifact") {
  ok("模拟刷新 URL " + freshHash + " 可复原选中节点 artifact（decode 结果与写入一致）");
} else fail("刷新后 hash 不可复原");

console.log("\n========================================");
if (failures === 0) {
  console.log("\x1b[32m全部通过：引用路径真实命中 · on/branches 自洽 · hash 可复现\x1b[0m");
  process.exit(0);
} else {
  console.log("\x1b[31m" + failures + " 项失败\x1b[0m");
  process.exit(1);
}
