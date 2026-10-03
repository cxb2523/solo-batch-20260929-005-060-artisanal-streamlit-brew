"use strict";

(function (global) {
  /* ---- 纯函数：hash 编解码（Node 校验脚本也会加载本文件复用它们） ---- */
  function encodeSelection(nodeId) {
    return "#node=" + encodeURIComponent(nodeId);
  }
  function decodeSelection(hash) {
    const m = /^#node=(.+)$/.exec(hash || "");
    return m ? decodeURIComponent(m[1]) : null;
  }
  global.TraceHash = { encodeSelection, decodeSelection };

  /* 无 DOM 环境（node tools/check-trace.mjs）只取纯函数，不启动 UI */
  if (typeof document === "undefined") return;

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const kv = (k, v, mono) => {
    const r = el("div", "kv");
    r.appendChild(el("span", "kv-k", k));
    r.appendChild(el("span", mono ? "kv-v mono" : "kv-v", v == null ? "—" : String(v)));
    return r;
  };
  const codeBlock = (label, code) => {
    const w = el("div", "snippet");
    if (label) w.appendChild(el("div", "snippet-label", label));
    const pre = el("pre", "snippet-code");
    pre.textContent = code;
    w.appendChild(pre);
    return w;
  };
  const badge = (text, tone) => el("span", "badge badge-" + tone, text);
  const note = (text) => el("p", "note", text);

  const nodes = new Map();
  function makeNode(chainEl, id, title, subtitle, buildBody) {
    const node = el("article", "node");
    node.id = "node-" + id;
    const head = el("button", "node-head");
    head.type = "button";
    head.appendChild(el("span", "node-title", title));
    if (subtitle) head.appendChild(el("span", "node-sub", subtitle));
    head.appendChild(el("span", "node-state", "▸ 展开原文"));
    const body = el("div", "node-body");
    body.hidden = true;
    buildBody(body);
    head.addEventListener("click", () => setSelected(node.classList.contains("selected") ? null : id));
    node.appendChild(head);
    node.appendChild(body);
    chainEl.appendChild(node);
    nodes.set(id, { node, body, head });
    return node;
  }
  function arrow(chainEl, label) {
    const a = el("div", "arrow");
    a.appendChild(el("span", "arrow-line"));
    if (label) a.appendChild(el("span", "arrow-label", label));
    chainEl.appendChild(a);
  }

  function setSelected(id) {
    for (const [nid, ref] of nodes) {
      const on = nid === id;
      ref.node.classList.toggle("selected", on);
      ref.body.hidden = !on;
      ref.head.querySelector(".node-state").textContent = on ? "▾ 收起" : "▸ 展开原文";
    }
    const hash = id ? encodeSelection(id) : "";
    if (global.location.hash !== hash) {
      global.history.replaceState(null, "", hash || global.location.pathname);
    }
    const hs = document.getElementById("hashState");
    if (hs) hs.textContent = id ? "location.hash = " + hash : "location.hash（未选中）";
  }

  /* ---- 链①：本地渲染 ---- */
  function buildLocal(chainEl, d) {
    const s = d.localRender.shell;
    const p = d.localRender.payload;
    makeNode(chainEl, "shell", "外壳 index.html", "title=My Page · 1 段内联 style · 7 个隐藏 div · 1 段内联 script", (b) => {
      b.appendChild(kv("文件", s.file + "（共 " + s.totalLines + " 行）", true));
      b.appendChild(codeBlock("第 " + s.title.line + " 行 · 外壳标题（随后会被载荷 title 覆盖）", s.title.raw));
      b.appendChild(codeBlock("第 " + s.inlineStyle.line + " 行 · 内联样式（与载荷无关的伪装类名）", s.inlineStyle.raw));
      b.appendChild(note("7 个载荷 div 全部挤在第 9 行，inline style=\"display:none\"，肉眼与普通爬虫不可见。"));
    });
    arrow(chainEl, "getElementById 收集 textContent");
    s.hiddenPayloadDivs.forEach((div, i) => {
      makeNode(chainEl, "payload-" + i, "隐藏载荷 div #" + div.id, "base64 " + div.base64Chars + " 字符 · style=\"" + div.inlineStyle + "\"", (b) => {
        b.appendChild(kv("行号", "第 " + div.line + " 行（7 个 div 同处一行）"));
        b.appendChild(kv("内联样式", div.inlineStyle, true));
        b.appendChild(kv("base64 长度", div.base64Chars + " 字符"));
        b.appendChild(codeBlock("原文片段（截断）", div.snippet));
      });
      if (i < s.hiddenPayloadDivs.length - 1) arrow(chainEl, "拼接");
    });
    arrow(chainEl, "atob → XOR → UTF-8");
    makeNode(chainEl, "bootstrap", "内联解码脚本（第 " + s.inlineScript.startLine + "–" + s.inlineScript.endLine + " 行）", "XOR 密钥内联 · 含一个永不调用的障眼函数", (b) => {
      b.appendChild(kv("障眼死代码", s.inlineScript.deadFunction, true));
      b.appendChild(kv("XOR 密钥（base64）", s.inlineScript.xorKeyBase64, true));
      s.inlineScript.steps.forEach((st, i) => {
        b.appendChild(kv("步骤 " + (i + 1) + " · " + st.id, st.desc));
        b.appendChild(codeBlock(null, st.code));
      });
      b.appendChild(codeBlock("完整原文（第 " + s.inlineScript.startLine + "–" + s.inlineScript.endLine + " 行）", s.inlineScript.raw));
    });
    arrow(chainEl, "body.innerHTML 整体替换");
    makeNode(chainEl, "payload-page", "解码出的载荷页面", "「" + p.title + "」· " + p.bytes + " 字节", (b) => {
      b.appendChild(kv("标题", p.title));
      b.appendChild(kv("meta description", p.metaDescription));
      b.appendChild(kv("伪造文件", p.fakeRelease.file + " · " + p.fakeRelease.size, true));
      b.appendChild(kv("页面内 SHA-256", p.fakeRelease.sha256, true));
      b.appendChild(kv("外链目标", p.externalLinkTarget + "（全页 " + p.externalLinkCount + " 处）", true));
      b.appendChild(kv("引用 button/preview.svg", p.referencesSvg ? "是" : "否——载荷页面与两个 SVG 无关"));
    });
    arrow(chainEl, "重放载荷内联脚本");
    makeNode(chainEl, "redirect", "定时跳转", p.redirect.delayMs + " ms 后 → " + p.redirect.target, (b) => {
      b.appendChild(kv("延迟", p.redirect.delayMs + " ms"));
      b.appendChild(kv("目标", p.redirect.target, true));
      b.appendChild(codeBlock("载荷尾部脚本原文", p.redirect.raw));
    });
  }

  /* ---- 链②：资源路径解析 ---- */
  function buildResource(chainEl, d) {
    const rp = d.resourcePaths;
    chainEl.appendChild(note(rp.note));
    rp.references.forEach((ref, refIdx) => {
      if (refIdx > 0) arrow(chainEl, "下一处引用");
      makeNode(chainEl, ref.id, ref.name + " · 引用于 " + ref.file + ":" + ref.line, "绝对 URL 引用 · 本地另有同名文件", (b) => {
        b.appendChild(codeBlock("引用原文（" + ref.file + " 第 " + ref.line + " 行）", ref.raw));
        if (ref.contextHref) b.appendChild(kv("所在链接 href", ref.contextHref, true));
        const lanes = el("div", "lanes");
        const abs = el("div", "lane");
        abs.appendChild(el("h4", null, "基准 A · 绝对 URL（原文写法）"));
        const absBody = el("div");
        absBody.appendChild(badge("absolute", "abs"));
        abs.appendChild(absBody);
        abs.appendChild(kv("解析基准", ref.base, true));
        abs.appendChild(kv("解析结果", ref.resolved, true));
        abs.appendChild(note("基准是远端 main 分支目录：内容随 main 未来提交可变，且 raw 域有独立缓存。"));
        const rel = el("div", "lane");
        rel.appendChild(el("h4", null, "基准 B · 本地相对（同名文件假设）"));
        rel.appendChild(badge("relative", "rel"));
        rel.appendChild(kv("解析基准", ref.localCounterpart.base, true));
        rel.appendChild(kv("解析结果", ref.localCounterpart.resolved, true));
        rel.appendChild(kv("命中文件", ref.localCounterpart.file + " · " + ref.localCounterpart.bytes + " bytes", true));
        rel.appendChild(kv("sha256", ref.localCounterpart.sha256, true));
        lanes.appendChild(abs);
        lanes.appendChild(rel);
        b.appendChild(lanes);
        const dv = el("div", "diverge");
        dv.appendChild(badge("差异 · 不并线", "warn"));
        dv.appendChild(note(ref.divergence));
        b.appendChild(dv);
      });
    });
    arrow(chainEl, "相对基准的落点");
    makeNode(chainEl, "svg-local", "本地同名文件（相对基准的落点）", "button.svg + preview.svg 真实存在于仓库根", (b) => {
      rp.localFiles.forEach((f) => {
        b.appendChild(kv(f.file, f.bytes + " bytes · sha256 " + f.sha256.slice(0, 16) + "…", true));
      });
      b.appendChild(note("check-trace.mjs 会重新计算两个文件的 sha256 与远端响应体逐一比对，验证“每条引用路径真实命中”。"));
    });
  }

  /* ---- 链③：触发到发布目标 ---- */
  function buildTrigger(chainEl, d) {
    const w = d.triggerToPublish.workflow;
    makeNode(chainEl, "trigger", "on 触发器", "schedule 每小时 + workflow_dispatch · 无 push/PR", (b) => {
      b.appendChild(kv("workflow name", w.name, true));
      b.appendChild(kv("schedule", w.on.schedule[0].cron + "（" + w.on.schedule[0].meaning + "）", true));
      b.appendChild(kv("workflow_dispatch", "手动触发，无输入参数"));
      b.appendChild(kv("push / pull_request", "均未声明"));
      b.appendChild(codeBlock("yml 原文片段", w.snippets.triggers));
    });
    arrow(chainEl, "无 branches 过滤");
    makeNode(chainEl, "branch", "分支过滤", "触发器零过滤 · 脚本硬编码 main", (b) => {
      b.appendChild(kv("on.push.branches", "未声明（根本没有 push 触发）"));
      b.appendChild(kv("on.pull_request.branches", "未声明"));
      b.appendChild(kv("脚本内硬编码", 'const branch = "' + w.branchFilters.hardcodedInScript + '"', true));
      b.appendChild(note(w.branchFilters.note));
    });
    arrow(chainEl, "建提交所需最小权限");
    makeNode(chainEl, "permissions", "permissions", "workflow 级与 job 级重复声明 contents: write", (b) => {
      b.appendChild(kv("workflow 级", "contents: " + w.permissions.workflowLevel.contents, true));
      b.appendChild(kv("job 级（" + w.permissions.jobLevel.job + "）", "contents: " + w.permissions.jobLevel.contents, true));
      b.appendChild(kv("最小必需", w.permissions.minimumNeeded));
      b.appendChild(kv("冗余/缺失", w.permissions.redundant));
      b.appendChild(codeBlock("yml 原文片段", w.snippets.permissions));
    });
    arrow(chainEl, "写入产物");
    makeNode(chainEl, "artifact", "产物目录与产物", w.artifact.path + " @ " + w.artifact.branch, (b) => {
      b.appendChild(kv("产物路径", w.artifact.path, true));
      b.appendChild(kv("产物目录", w.artifact.directory + "（仓库内，非 Actions artifact）", true));
      b.appendChild(kv("形态", w.artifact.kind));
      b.appendChild(kv("写入操作", w.artifact.op));
      b.appendChild(kv("冲突重试", w.artifact.retries));
      b.appendChild(kv("旁证戳记", w.artifact.companionObservedLines + " 行 · 首行 " + w.artifact.companionFirstLine + " · 末行 " + w.artifact.companionLastLine, true));
      b.appendChild(codeBlock("yml 内联脚本片段", w.snippets.artifact + "\n...\n" + w.snippets.write));
    });
    arrow(chainEl, "发布目标核对");
    makeNode(chainEl, "publish", "发布目标", "宣称 Pages 站点 · 实际只是 main 上的文件提交", (b) => {
      const dv = el("div", "diverge");
      dv.appendChild(badge("目标落空", "bad"));
      dv.appendChild(note(w.publishTarget.mismatch));
      b.appendChild(kv("README 宣称", w.publishTarget.declaredInReadme, true));
      b.appendChild(kv("工作流实际写入", w.publishTarget.actuallyWrites, true));
      b.appendChild(kv("Pages 部署步骤", "无 · pages: write 权限未声明 · 无 artifact 上传"));
      b.appendChild(dv);
    });
  }

  async function boot() {
    const res = await fetch("data.json");
    const data = await res.json();
    buildLocal(document.getElementById("chainLocal"), data);
    buildResource(document.getElementById("chainResource"), data);
    buildTrigger(document.getElementById("chainTrigger"), data);
    const initial = decodeSelection(global.location.hash);
    if (initial && nodes.has(initial)) {
      setSelected(initial);
      document.getElementById("node-" + initial).scrollIntoView({ block: "center" });
    } else {
      setSelected(null);
    }
    global.addEventListener("hashchange", () => {
      const id = decodeSelection(global.location.hash);
      if (id && nodes.has(id)) setSelected(id);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})(typeof window !== "undefined" ? window : globalThis);
