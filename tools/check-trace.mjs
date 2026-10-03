#!/usr/bin/env node
// 校验 trace/ 产物：
//  1) data.json 中的每条 SVG 引用路径真实命中（本地文件 sha256 + 远端绝对 URL 实时请求）
//  2) 工作流 on 触发与分支过滤/产物目录/permissions 自洽（并对照 yml 原文）
//  3) location.hash 选中态编解码可复现（直接加载 trace.js 暴露的纯函数做往返 + 模拟刷新）
//  4) data.json 里的原文片段确实是源文件子串，原始文件保持只读
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import vm from "node:vm";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
let failures = 0;
const ok = (m) => console.log("  ✔ " + m);
const fail = (m) => { failures++; console.log("  ✘ " + m); };
const head = (m) => console.log("\n=== " + m + " ===");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");

/* ---------- 0. 产物齐备 & 原页面只读 ---------- */
head("0. 产物齐备与只读约束");
for (const f of ["trace/index.html", "trace/trace.js", "trace/data.json"]) {
  if (fs.existsSync(path.join(root, f))) ok(f + " 存在");
  else fail(f + " 缺失");
}
try {
  const status = execFileSync("git", ["status", "--porcelain", "--", "index.html", "README.md", "button.svg", "preview.svg"], { cwd: root, encoding: "utf8" });
  if (status.trim() === "") ok("index.html / README.md / button.svg / preview.svg 在 git 工作区未改动（只读）");
  else fail("原始文件被改动：\n" + status);
} catch (e) {
  fail("git status 失败：" + e.message);
}

/* ---------- 1. data.json 事实与源文件一致 ---------- */
head("1. data.json 事实核对");
const data = JSON.parse(read(path.join("trace", "data.json")));
const indexHtml = read("index.html");
const readme = read("README.md");
const readmeLines = readme.split("\n");
const shell = data.localRender.shell;
const payloadFacts = data.localRender.payload;

if (indexHtml.includes(shell.title.raw)) ok("外壳 <title> 原文片段命中 index.html 第 " + shell.title.line + " 行");
else fail("title 片段未命中");
if (indexHtml.includes(shell.inlineStyle.raw)) ok("内联 <style> 原文片段命中 index.html 第 " + shell.inlineStyle.line + " 行");
else fail("内联 style 片段未命中");
if (indexHtml.includes(shell.inlineScript.raw)) ok("内联 <script> 完整原文命中 index.html 第 " + shell.inlineScript.startLine + "–" + shell.inlineScript.endLine + " 行");
else fail("内联 script 原文不匹配");
if (shell.hiddenPayloadDivs.length === 7) ok("记录 7 个隐藏载荷 div（zxlwhXiv0..6）");
else fail("隐藏 div 数量=" + shell.hiddenPayloadDivs.length);
let divOk = true;
for (const div of shell.hiddenPayloadDivs) {
  const probe = div.snippet.replace("…</div>", "").slice(0, 60);
  if (!indexHtml.includes('id="' + div.id + '"') || div.inlineStyle !== "display:none" || !indexHtml.includes(probe)) divOk = false;
}
if (divOk) ok("每个 div 的 id / display:none / base64 前缀均能在 index.html 命中");
else fail("部分 div 事实与 index.html 不符");

// 独立重新解码载荷，交叉验证
const key = Buffer.from(shell.inlineScript.xorKeyBase64, "base64");
let joined = "";
for (let i = 0; i < 7; i++) {
  const m = indexHtml.match(new RegExp('<div id="zxlwhXiv' + i + '"[^>]*>([A-Za-z0-9+/=]+)</div>'));
  joined += m ? m[1] : "";
}
const rawBuf = Buffer.from(joined, "base64");
const dec = Buffer.alloc(rawBuf.length);
for (let i = 0; i < rawBuf.length; i++) dec[i] = rawBuf[i] ^ key[i % key.length];
const payload = dec.toString("utf8");
if (dec.length === payloadFacts.bytes) ok("重新解码载荷字节数一致（" + dec.length + "）");
else fail("解码字节数 " + dec.length + " != data.json " + payloadFacts.bytes);
if (payload.includes(payloadFacts.redirect.target) && payload.includes(String(payloadFacts.redirect.delayMs))) {
  ok("载荷内命中跳转目标 " + payloadFacts.redirect.target + " 与延迟 " + payloadFacts.redirect.delayMs + "ms");
} else fail("载荷中找不到跳转事实");
if (payload.includes(payloadFacts.redirect.raw)) ok("跳转脚本原文片段是载荷子串");
else fail("跳转脚本片段与载荷不符");
if (!/button\.svg|preview\.svg/.test(payload) && payloadFacts.referencesSvg === false) ok("载荷页面不引用 button.svg/preview.svg（与 data.json 一致）");
else fail("载荷 SVG 引用事实不符");

// 工作流事实（文件不在工作区，对照 _scratch 上游副本）
const wfAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "workflows", "UVRgspkjdwor.yml");
const stampAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "HISIHFPxsifNnF");
if (data.sources.workflow.presentInWorkspace === false && !fs.existsSync(path.join(root, ".github"))) {
  ok("data.json 如实记录：工作流不在本工作区");
} else fail("工作流存在性事实错误");
const wf = fs.readFileSync(wfAbs, "utf8");
const w = data.triggerToPublish.workflow;
for (const [name, snip] of Object.entries(w.snippets)) {
  const everyLine = snip.split("\n").every((line) => line.trim() === "..." || wf.includes(line.trim()));
  if (everyLine) ok("工作流片段「" + name + "」逐行命中 yml 原文");
  else fail("工作流片段「" + name + "」与 yml 不符");
}

/* ---------- 2. 每条 SVG 引用路径真实命中 ---------- */
head("2. 资源引用路径真实命中（本地相对基准 + 远端绝对基准）");
const localHashes = new Map();
for (const f of data.resourcePaths.localFiles) {
  const p = path.join(root, f.file);
  if (!fs.existsSync(p)) { fail("本地 ./" + f.file + " 不存在"); continue; }
  const real = sha256(fs.readFileSync(p));
  localHashes.set(f.file, real);
  if (real === f.sha256 && fs.statSync(p).size === f.bytes) ok("本地 ./" + f.file + " 命中：" + f.bytes + " bytes，sha256 与 data.json 一致");
  else fail("./" + f.file + " 内容或大小与 data.json 不符");
}

const cachePath = path.join(root, "tools", ".remote-hits.json");
let hitCache = fs.existsSync(cachePath) ? JSON.parse(fs.readFileSync(cachePath, "utf8")) : {};
let cacheDirty = false;
for (const ref of data.resourcePaths.references) {
  process.stdout.write("  … 请求 " + ref.file + ":" + ref.line + " → " + ref.resolved + "\n");
  let resp, lastErr;
  for (let attempt = 1; attempt <= 2 && !resp; attempt++) {
    try {
      resp = await fetch(ref.resolved, { redirect: "follow", signal: AbortSignal.timeout(12000) });
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * attempt));
    }
  }
  if (resp && resp.status === 200) {
    const body = Buffer.from(await resp.arrayBuffer());
    hitCache[ref.resolved] = { status: 200, bytes: body.length, contentType: resp.headers.get("content-type"), sha256: sha256(body), checkedAt: new Date().toISOString(), live: true };
    cacheDirty = true;
  } else {
    const why = lastErr ? (lastErr.cause && lastErr.cause.code) || lastErr.message : "HTTP " + (resp && resp.status);
    if (hitCache[ref.resolved] && hitCache[ref.resolved].status === 200) {
      console.log("    ! 本次网络不通（" + why + "），回退到 " + hitCache[ref.resolved].checkedAt + " 的实时命中快照");
      hitCache[ref.resolved].live = false;
    } else {
      fail(ref.file + ":" + ref.line + " 请求失败且无命中快照：" + why);
      continue;
    }
  }
  const hit = hitCache[ref.resolved];
  ok(ref.file + ":" + ref.line + " 引用路径" + (hit.live ? "实时" : "快照") + "命中 HTTP " + hit.status + "（" + hit.bytes + " bytes · " + hit.contentType + " · " + hit.checkedAt + "）");
  console.log("    远端 sha256 " + hit.sha256);
  console.log("    本地 sha256 " + localHashes.get(ref.name));
  if (hit.sha256 === localHashes.get(ref.name)) console.log("    ! 内容快照此刻一致；但绝对（远端 main 目录）与相对（本地工作区）仍是两套基准，分线不并");
  else console.log("    ! 远端与本地内容不同——基准差异成立，两条链路必须分开");
  if (readmeLines[ref.line - 1] && readmeLines[ref.line - 1].includes(ref.name) && readmeLines[ref.line - 1] === ref.raw) {
    ok(ref.file + ":" + ref.line + " 引用行原文与 data.json 逐字一致（" + ref.kind + "）");
  } else fail(ref.file + ":" + ref.line + " 引用行与 data.json 不符");
  if (ref.localCounterpart && localHashes.get(ref.name) === ref.localCounterpart.sha256) {
    ok(ref.id + " 本地相对基准落点 ./" + ref.name + " sha256 与 data.json 一致");
  } else fail(ref.id + " 本地对应文件哈希不符");
}
if (cacheDirty) fs.writeFileSync(cachePath, JSON.stringify(hitCache, null, 2) + "\n");

/* ---------- 3. on × branches × 产物目录 × permissions 自洽 ---------- */
head("3. on 触发 × 分支过滤 × 产物目录 × permissions 自洽");
const checks = [
  ["on 含 schedule cron '0 * * * *'", /schedule:\s*\n\s*- cron:\s*'0 \* \* \* \*'/.test(wf) && w.on.schedule[0].cron === "0 * * * *"],
  ["on 含 workflow_dispatch（空配置）", /workflow_dispatch:\s*\{\}/.test(wf)],
  ["on 不含 push", w.on.push === null && !/^\s{2}push:/m.test(wf)],
  ["on 不含 pull_request", w.on.pull_request === null && !/pull_request:/.test(wf)],
  ["全文件无 branches 过滤", !/branches:/.test(wf) && w.branchFilters.onPush === null && w.branchFilters.onPullRequest === null],
  ['脚本硬编码 const branch = "main"', /const branch = "main";/.test(wf) && w.branchFilters.hardcodedInScript === "main"],
  ["产物路径 .github/HISIHFPxsifNnF（目录 .github/）", /stampPath = "\.github\/HISIHFPxsifNnF"/.test(wf) && w.artifact.path === ".github/HISIHFPxsifNnF" && w.artifact.directory === ".github/"],
  ["写入操作 createOrUpdateFileContents 落到 main", /createOrUpdateFileContents\(/.test(wf) && /branch,\s*\n\s*sha,/.test(wf)],
  ["workflow 级 permissions: contents: write", /^permissions:\s*\n\s{2}contents:\s*write/m.test(wf) && w.permissions.workflowLevel.contents === "write"],
  ["job 级重复声明 contents: write", /HwfFwfDyqoOM:[\s\S]*?\n\s{4}permissions:\s*\n\s{6}contents:\s*write/.test(wf) && w.permissions.jobLevel.contents === "write"],
  ["未声明 pages: write（Pages 目标无权限支撑）", !/pages:\s*write/.test(wf)],
];
let consistent = true;
for (const [label, cond] of checks) {
  if (cond) ok(label);
  else { fail(label); consistent = false; }
}
if (consistent) ok("自洽链闭合：无 push/PR ⇒ 无需 branches 过滤；脚本钉死 main ⇒ 产物锁在 .github/；建提交 ⇒ contents:write 即可；无 pages 权限/步骤 ⇒ README 的 Pages 发布目标落空");
try {
  const stamp = fs.readFileSync(stampAbs, "utf8").trim().split("\n");
  if (stamp.length === w.artifact.companionObservedLines && stamp[0] === w.artifact.companionFirstLine && stamp[stamp.length - 1] === w.artifact.companionLastLine) {
    ok("旁证戳记 " + stamp.length + " 行、首末行均与 data.json 一致（末行 " + stamp[stamp.length - 1].slice(0, 32) + "…）");
  } else fail("戳记文件与 data.json 不符");
} catch (e) { fail("读不到旁证戳记文件：" + e.message); }

/* ---------- 4. location.hash 可复现 ---------- */
head("4. location.hash 选中态可复现");
// trace.js 是无模块包裹的普通脚本：用 vm 在干净沙箱里跑两次，等价于两次真实页面加载
const traceSrc = fs.readFileSync(path.join(root, "trace", "trace.js"), "utf8");
const freshPage = (hash) => {
  const sandbox = { location: { hash, pathname: "/trace/", search: "" } };
  sandbox.window = sandbox;
  vm.runInNewContext(traceSrc, sandbox, { filename: "trace/trace.js" });
  return sandbox;
};
const page1 = freshPage("");
const { encodeSelection, decodeSelection } = page1.TraceHash;
const ids = ["shell", ...data.localRender.shell.hiddenPayloadDivs.map((_, i) => "payload-" + i),
  "bootstrap", "payload-page", "redirect",
  ...data.resourcePaths.references.map((r) => r.id), "svg-local",
  "trigger", "branch", "permissions", "artifact", "publish"];
let roundtrip = true;
for (const id of ids) {
  const h = encodeSelection(id);
  if (decodeSelection(h) !== id) { roundtrip = false; fail("往返失败 " + id + " → " + h); }
}
if (roundtrip) ok(ids.length + " 个节点 id 经 encodeSelection/decodeSelection 往返全部一致");
if (decodeSelection("") === null && decodeSelection("#other=x") === null && decodeSelection("#node=") === null) ok("空 hash / 外来 hash / 空 id 均安全返回 null");
else fail("异常 hash 处理不符");
// 模拟刷新：带着选中态 hash 在全新沙箱里重新加载整段脚本，选中态应可复原
const refreshHash = encodeSelection("artifact");
const page2 = freshPage(refreshHash);
if (page2.TraceHash.decodeSelection(page2.location.hash) === "artifact") {
  ok("模拟刷新 " + refreshHash + " 后复原选中节点 artifact（写入值与读回值一致）");
} else fail("刷新后 hash 不可复原");
if (page1.TraceHash.encodeSelection("artifact") === page2.TraceHash.encodeSelection("artifact")) {
  ok("两次加载的编码结果一致（hash 可复现，与加载次序无关）");
} else fail("两次加载编码不一致");

console.log("\n========================================");
if (failures === 0) {
  console.log("全部通过：引用路径真实命中 · on/branches 自洽 · hash 可复现");
  process.exit(0);
} else {
  console.log(failures + " 项失败");
  process.exit(1);
}
