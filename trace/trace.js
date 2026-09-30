"use strict";

(function (global) {
  function encodeSelection(nodeId) {
    return "#node=" + encodeURIComponent(nodeId);
  }
  function decodeSelection(hash) {
    const m = /^#node=(.+)$/.exec(hash || "");
    return m ? decodeURIComponent(m[1]) : null;
  }

  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };

  function codeBlock(label, code) {
    const wrap = el("div", "snippet");
    if (label) wrap.appendChild(el("div", "snippet-label", label));
    const pre = el("pre", "snippet-code");
    pre.textContent = code;
    wrap.appendChild(pre);
    return wrap;
  }

  function kv(k, v, mono) {
    const r = el("div", "kv");
    r.appendChild(el("span", "kv-k", k));
    r.appendChild(el("span", mono ? "kv-v mono" : "kv-v", v == null ? "—" : String(v)));
    return r;
  }

  function badge(text, tone) {
    return el("span", "badge badge-" + tone, text);
  }

  function makeNode(id, title, subtitle, kind, buildBody) {
    const node = el("article", "node kind-" + kind);
    node.id = "node-" + id;
    node.dataset.node = id;
    const head = el("button", "node-head");
    head.type = "button";
    head.appendChild(el("span", "node-title", title));
    if (subtitle) head.appendChild(el("span", "node-sub", subtitle));
    head.appendChild(el("span", "node-state", "▸ 原文"));
    const body = el("div", "node-body");
    body.hidden = true;
    if (buildBody) buildBody(body, node);
    head.addEventListener("click", () => {
      global.TraceApp.setSelected(node.classList.contains("selected") ? null : id);
    });
    node.appendChild(head);
    node.appendChild(body);
    return node;
  }

  function arrow(label) {
    const a = el("div", "arrow");
    a.appendChild(el("span", "arrow-line"));
    if (label) a.appendChild(el("span", "arrow-label", label));
    return a;
  }

  function buildLocalChain(root, d) {
    const s = d.localRender.shell;
    const chain = el("div", "chain");

    chain.appendChild(makeNode("shell", "外壳 index.html（本地直开）", "title=My Page · 7 个隐藏 div · 1 段内联 style/script", "shell", (b) => {
      b.appendChild(kv("文件", s.file, true));
      b.appendChild(kv("第 5 行 title", s.title.raw, true));
      b.appendChild(codeBlock("第 6 行 · 内联样式（与载荷无实际关系的伪装）", s.inlineStyle.raw));
      b.appendChild(el("p", "note", "7 个隐藏 div 同在第 9 行，inline style=\"display:none\"，人眼与普通爬虫看不到载荷文本。"));
    }));
    chain.appendChild(arrow("读取 DOM"));

    s.hiddenPayloadDivs.forEach((div, i) => {
      chain.appendChild(makeNode("payload-" + i, "隐藏载荷 div#" + div.id, "base64 文本 " + div.base64Bytes + " 字符 · " + div.inlineStyle, "payload", (b) => {
        b.appendChild(kv("行号", div.line));
        b.appendChild(kv("inline style", div.inlineStyle, true));
        b.appendChild(codeBlock("原文片段（前 56 字符）", div.snippet));
      }));
      if (i === s.hiddenPayloadDivs.length - 1) chain.appendChild(arrow("按 id 顺序拼接 → atob → XOR"));
    });

    chain.appendChild(makeNode("bootstrap", "内联引导脚本", "第 10–75 行 · 拼接 / 解码 / DOM 接管 / 脚本重启", "script", (b) => {
      b.appendChild(kv("XOR 密钥 base64", s.inlineScript.xorKeyBase64, true));
      b.appendChild(kv("XOR 密钥明文", s.inlineScript.xorKeyUtf8, true));
      b.appendChild(kv("死代码（从未被调用）", s.inlineScript.deadFunction, true));
      s.inlineScript.steps.forEach((st) => {
        b.appendChild(el("h4", "step-title", st.id + " · " + st.desc));
        b.appendChild(codeBlock(null, st.code));
      });
      b.appendChild(codeBlock("内联脚本完整原文", s.inlineScript.raw));
    }));
    chain.appendChild(arrow("document.head / body 被接管"));

    const p = s.payloadArtifact;
    chain.appendChild(makeNode("payload-page", "解码后的真实页面", (p.title || "") + " · " + p.bytes + " 字节", "payload", (b) => {
      b.appendChild(kv("来源", p.source));
      b.appendChild(kv("title", p.title));
      b.appendChild(kv("内联 <svg> 数量", p.inlineSvgCount));
      b.appendChild(kv("<img ...*.svg> 外链图数量", p.externalImgSvgCount));
      b.appendChild(kv("是否引用 button.svg / preview.svg", p.referencesButtonOrPreview ? "是" : "否——两个 SVG 均未被该页面引用"));
      b.appendChild(codeBlock("载荷文档开头原文", p.snippetHead));
    }));
    chain.appendChild(arrow("载荷内联脚本"));

    chain.appendChild(makeNode("redirect", "9166ms 后跳转", p.redirectTarget, "danger", (b) => {
      b.appendChild(kv("目标", p.redirectTarget, true));
      b.appendChild(kv("延迟", p.redirectDelayMs + " ms"));
      b.appendChild(codeBlock("原文", "var TARGET = \"https://pandoramods.top/\";\nsetTimeout(function(){ window.location.href = TARGET; }, 9166);"));
    }));

    root.appendChild(chain);
  }

  function buildResourceChain(root, d) {
    const r = d.resourcePaths;
    root.appendChild(el("p", "chain-note", r.note));

    r.references.forEach((ref) => {
      const wrap = el("div", "ref-block");
      const head = el("div", "ref-head");
      head.appendChild(badge(ref.kind === "absolute" ? "绝对引用" : "相对引用", ref.kind === "absolute" ? "abs" : "rel"));
      head.appendChild(el("span", "ref-where", ref.file + ":" + ref.line + "（alt/文案：" + ref.alt + "）"));
      wrap.appendChild(head);

      const lanes = el("div", "lanes");

      const remote = el("div", "lane lane-remote");
      remote.appendChild(el("h4", "lane-title", "链路 A · 按引用自身基准解析（绝对 URL，独立成线）"));
      remote.appendChild(kv("引用类型", "absolute"));
      remote.appendChild(kv("基准 base", ref.base, true));
      remote.appendChild(kv("解析结果", ref.resolved, true));
      remote.appendChild(codeBlock(ref.file + " 第 " + ref.line + " 行原文", ref.raw));
      if (ref.contextHref) remote.appendChild(kv("外层链接（仅外层 <a>，不是 SVG 的解析基准）", ref.contextHref, true));
      lanes.appendChild(remote);

      const local = el("div", "lane lane-local");
      local.appendChild(el("h4", "lane-title", "链路 B · 本地同名文件按 README 目录做相对解析（另一条基准）"));
      local.appendChild(kv("假设写法", ref.localCounterpart.relativeKind));
      local.appendChild(kv("基准（引用所在文件）", ref.localCounterpart.relativeBase, true));
      local.appendChild(kv("相对解析结果", "./" + ref.localCounterpart.relativeResolved, true));
      local.appendChild(kv("本地文件大小", ref.localCounterpart.bytes + " bytes"));
      local.appendChild(kv("本地文件 sha256", ref.localCounterpart.sha256, true));
      local.appendChild(kv("工作区真实命中", "存在（由 node tools/check-trace.mjs 校验）"));
      lanes.appendChild(local);

      wrap.appendChild(lanes);
      wrap.appendChild(el("p", "divergence", "⚖ 差异：" + ref.divergence));
      root.appendChild(wrap);
    });
  }

  function buildTriggerChain(root, d) {
    const w = d.triggerToPublish.workflow;
    const chain = el("div", "chain");

    chain.appendChild(makeNode("trigger", "on 触发", "schedule 每小时整点 + workflow_dispatch；无 push / pull_request", "trigger", (b) => {
      b.appendChild(kv("schedule cron", w.on.schedule[0].cron, true));
      b.appendChild(kv("含义", w.on.schedule[0].meaning));
      b.appendChild(kv("workflow_dispatch", "{}（手动触发）"));
      b.appendChild(kv("push", "无"));
      b.appendChild(kv("pull_request", "无"));
      b.appendChild(codeBlock("UVRgspkjdwor.yml 第 2–5 行", w.snippets.triggers));
    }));
    chain.appendChild(arrow("无 branches 过滤 → 分支约束只剩脚本内硬编码"));

    chain.appendChild(makeNode("branch", "分支约束", 'const branch = "main"', "trigger", (b) => {
      b.appendChild(kv("on.push.branches", w.branchFilters.onPush));
      b.appendChild(kv("on.pull_request.branches", w.branchFilters.onPullRequest));
      b.appendChild(kv("脚本硬编码分支", w.branchFilters.hardcodedInScript, true));
      b.appendChild(el("p", "note", w.branchFilters.note));
      b.appendChild(codeBlock("脚本第 20–21 行", w.snippets.artifact));
    }));
    chain.appendChild(arrow("GITHUB_TOKEN 权限"));

    chain.appendChild(makeNode("permissions", "permissions", "workflow 级与 job 级均为 contents: write", "perm", (b) => {
      b.appendChild(kv("workflow 级", JSON.stringify(w.permissions.workflowLevel), true));
      b.appendChild(kv("job 级（" + w.permissions.jobLevel.job + "）", JSON.stringify(w.permissions.jobLevel), true));
      b.appendChild(kv("实际最小需要", w.permissions.minimumNeeded));
      b.appendChild(el("p", "note", w.permissions.redundant));
      b.appendChild(codeBlock("第 7–8 行 与 第 13–14 行", w.snippets.permissions));
    }));
    chain.appendChild(arrow("actions/github-script@v7 · runs-on " + w.runsOn));

    chain.appendChild(makeNode("artifact", "产物目录：" + w.artifact.directory, w.artifact.path + "（追加式戳记文件）", "artifact", (b) => {
      b.appendChild(kv("路径", w.artifact.path, true));
      b.appendChild(kv("目录", w.artifact.directory, true));
      b.appendChild(kv("写入分支", w.artifact.branch, true));
      b.appendChild(kv("操作", w.artifact.op));
      b.appendChild(kv("提交信息", w.artifact.commitMessages));
      b.appendChild(kv("冲突重试", w.artifact.retries));
      b.appendChild(kv("旁证文件观测行数", w.artifact.companionObservedLines));
      b.appendChild(kv("旁证首行", w.artifact.companionFirstLine));
      b.appendChild(kv("旁证末行", w.artifact.companionLastLine));
      b.appendChild(codeBlock("API 调用原文", w.snippets.write));
    }));
    chain.appendChild(arrow("宣称发布目标 vs 实际落点"));

    chain.appendChild(makeNode("publish", "发布目标核对", "README 宣称 GitHub Pages，工作流实际只回写 main 上的文件", "danger", (b) => {
      b.appendChild(kv("README / 按钮宣称", w.publishTarget.declaredInReadme, true));
      b.appendChild(kv("工作流实际交付", w.publishTarget.actuallyWrites));
      b.appendChild(kv("Pages 部署步骤", w.publishTarget.deliveredByWorkflow == null ? "无" : w.publishTarget.deliveredByWorkflow));
      b.appendChild(el("p", "divergence", "⚖ " + w.publishTarget.mismatch));
    }));

    root.appendChild(chain);
  }

  const TRADEOFFS = [
    {
      title: "取舍一：内联脚本/样式 vs 外链 SVG —— 缓存、可维护性、相对路径解析",
      points: [
        ["缓存", "内联 <script>/<style> 随 index.html 一体下发，无法被浏览器单独缓存：HTML 一改整份失效，且首屏零额外请求、引导逻辑立即可用；外链 SVG 可独立缓存、跨文档复用（README 两处 button.svg 共用同一 URL），替换图片只动一个文件。"],
        ["可维护性", "内联代码与外壳 DOM 强耦合，本页又把真实页面 base64+XOR 藏进 7 个 display:none 的 div，可读性与可审计性差，CSP 也难以用 hash/nonce 精确放行；外链 SVG 是普通静态文件，可评审、可替换、可加 SRI。"],
        ["相对路径解析", "内联脚本没有 URL 解析，但依赖 getElementById 与 document.body.innerHTML 替换，对外壳 DOM 结构有隐式依赖；外链资源必须先定基准——相对 URL 以引用文档所在目录（README 在仓库根）为基准，而 README 三处全部写死绝对 raw URL，基准被钉在 raw.githubusercontent.com 的 main 分支目录上。仓库根虽有同名 button.svg/preview.svg，也只能按另一套基准解析为本地 ./button.svg、./preview.svg，与远端是两条独立链路，不能并成一条。"],
      ],
    },
    {
      title: "取舍二：on 触发与分支过滤如何反过来约束产物目录与权限",
      points: [
        ["触发决定产物位置", "on 只有 schedule（每小时）+ workflow_dispatch，没有 push，产物就不是“跟某次代码提交走”的构建结果，而是到点即写的仓库内文件；stampPath 被写死为 .github/HISIHFPxsifNnF、branch 写死 main，产物只能落在仓库的 .github/ 目录与 main 分支，而不是 dist/、Release asset 或 GitHub Pages。"],
        ["分支过滤缺失的代价", "触发器层面没有任何 branches 过滤，分支正确性完全依赖脚本内 const branch=\"main\"（读取、409 重试、提交都围绕它）；该常量一旦被改，写入会静默落到别的分支，on 级没有第二道护栏。"],
        ["产物形态决定权限", "createOrUpdateFileContents 要在 main 上创建提交，最小权限就是 contents: write；workflow 级与 job 级重复声明同一 write，没有按需收窄。它不部署 Pages，因此不需要 pages: write（也确实没给）；README 宣称的 zayfern.github.io 发布目标在本工作流里没有任何对应步骤或权限支撑。"],
        ["频率 × 写权限的复合风险", "每小时整点 + 随机两词提交信息（fix/update/…/#数字）+ 随机数内容，等于长期用 contents:write 往 main 灌噪声提交，污染历史、保持活动假象，并放大令牌失陷后的破坏面——这正是“弱触发约束 × 写权限 × 仓库内产物目录”三者互相锁定的结果。"],
      ],
    },
  ];

  function renderTradeoffs(root) {
    TRADEOFFS.forEach((t) => {
      const card = el("section", "tradeoff");
      card.appendChild(el("h3", "tradeoff-title", t.title));
      t.points.forEach((pair) => {
        const item = el("div", "tradeoff-item");
        item.appendChild(el("span", "tradeoff-k", pair[0]));
        item.appendChild(el("p", "tradeoff-v", pair[1]));
        card.appendChild(item);
      });
      root.appendChild(card);
    });
  }

  function TraceApp() {
    const state = { selected: decodeSelection(location.hash), data: null };
    const sections = {
      local: document.getElementById("chain-local"),
      resource: document.getElementById("chain-resource"),
      trigger: document.getElementById("chain-trigger"),
      tradeoffs: document.getElementById("tradeoffs"),
      meta: document.getElementById("meta"),
    };

    function applySelection(id) {
      document.querySelectorAll(".node.selected").forEach((n) => {
        n.classList.remove("selected");
        n.querySelector(".node-body").hidden = true;
        n.querySelector(".node-state").textContent = "▸ 原文";
      });
      if (!id) return;
      const node = document.querySelector('.node[data-node="' + CSS.escape(id) + '"]');
      if (!node) return;
      node.classList.add("selected");
      node.querySelector(".node-body").hidden = false;
      node.querySelector(".node-state").textContent = "▾ 收起";
    }

    function setSelected(id) {
      state.selected = id;
      history.replaceState(null, "", id ? encodeSelection(id) : window.location.pathname + window.location.search);
      applySelection(id);
    }

    function render(data) {
      state.data = data;
      sections.local.innerHTML = "";
      sections.resource.innerHTML = "";
      sections.trigger.innerHTML = "";
      sections.tradeoffs.innerHTML = "";
      buildLocalChain(sections.local, data);
      buildResourceChain(sections.resource, data);
      buildTriggerChain(sections.trigger, data);
      renderTradeoffs(sections.tradeoffs);
      sections.meta.textContent =
        "data.json 生成于 " + data.generatedAt +
        " · 工作区不存在 .github/workflows/UVRgspkjdwor.yml，分析用副本：" +
        data.sources.workflow.analyzedCopy;
      applySelection(state.selected);
      if (state.selected) {
        const target = document.getElementById("node-" + state.selected);
        if (target) target.scrollIntoView({ block: "center" });
      }
    }

    global.addEventListener("hashchange", () => {
      state.selected = decodeSelection(location.hash);
      applySelection(state.selected);
    });

    fetch("data.json", { cache: "no-store" })
      .then((resp) => {
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        return resp.json();
      })
      .then(render)
      .catch((e) => {
        sections.local.textContent = "加载 data.json 失败：" + e.message;
      });

    return { setSelected, getSelected: () => state.selected };
  }

  global.TraceHash = { encodeSelection, decodeSelection };
  if (typeof document !== "undefined") {
    global.TraceApp = { setSelected: () => {} };
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", () => { global.TraceApp = TraceApp(); });
    } else {
      global.TraceApp = TraceApp();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
