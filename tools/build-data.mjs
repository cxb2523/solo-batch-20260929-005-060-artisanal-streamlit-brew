import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

const indexHtml = read("index.html");
const readme = read("README.md");
const lines = indexHtml.split("\n");
const readmeLines = readme.split("\n");

const wfAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "workflows", "UVRgspkjdwor.yml");
const stampAbs = path.resolve(root, "..", "..", "_scratch", "060-artisanal-streamlit-brew", "upstream", ".github", "HISIHFPxsifNnF");
const wf = fs.readFileSync(wfAbs, "utf8");
const stampLines = fs.readFileSync(stampAbs, "utf8").trim().split("\n");

// ---- 外壳事实 ----
const divs = [];
for (let i = 0; i < 7; i++) {
  const m = indexHtml.match(new RegExp('<div id="zxlwhXiv' + i + '" style="display:none">([A-Za-z0-9+/=]+)</div>'));
  if (!m) throw new Error("div zxlwhXiv" + i + " not found");
  divs.push({
    id: "zxlwhXiv" + i,
    line: 9,
    inlineStyle: "display:none",
    base64Chars: m[1].length,
    snippet: m[0].slice(0, 72) + "…</div>",
  });
}
const scriptRaw = lines.slice(9, 75).join("\n");
if (!scriptRaw.startsWith("<script>") || !scriptRaw.endsWith("</script>")) throw new Error("script slice off");

// ---- 重新解码载荷 ----
const key = Buffer.from("H7JPnij/qDB+mbPssTGSn4JcPzmEZaqKsJVITTEVAoY=", "base64");
const joined = divs.map((d, i) => indexHtml.match(new RegExp('<div id="zxlwhXiv' + i + '" style="display:none">([A-Za-z0-9+/=]+)</div>'))[1]).join("");
const rawBuf = Buffer.from(joined, "base64");
const dec = Buffer.alloc(rawBuf.length);
for (let i = 0; i < rawBuf.length; i++) dec[i] = rawBuf[i] ^ key[i % key.length];
const payload = dec.toString("utf8");
const payloadTitle = /<title>([\s\S]*?)<\/title>/.exec(payload)[1];
const redirectScript = /<script>\s*\(function\(\)\{\s*var TARGET[\s\S]*?<\/script>/.exec(payload)[0];
const fakeSha = /([0-9a-f]{64})/.exec(payload)[1];

// ---- README 引用 ----
const refs = [];
const refDefs = [
  { id: "ref-preview-1", line: 1, name: "preview.svg" },
  { id: "ref-button-48", line: 48, name: "button.svg" },
  { id: "ref-button-137", line: 137, name: "button.svg" },
];
for (const def of refDefs) {
  const raw = readmeLines[def.line - 1];
  if (!raw.includes(def.name)) throw new Error("README line " + def.line + " mismatch");
  const url = new RegExp("(https://raw\\.githubusercontent\\.com/[^)]+/" + def.name + ")").exec(raw)[1];
  const href = /\]\((https:[^)]+)\)/.exec(raw);
  refs.push({
    id: def.id,
    file: "README.md",
    line: def.line,
    name: def.name,
    raw,
    kind: "absolute",
    base: "https://raw.githubusercontent.com/Zayfern/artisanal-streamlit-brew-metrics/main/",
    resolved: url,
    contextHref: href && !href[1].includes("raw.githubusercontent") ? href[1] : null,
  });
}
const localFiles = ["button.svg", "preview.svg"].map((f) => ({
  file: f,
  bytes: fs.statSync(path.join(root, f)).size,
  sha256: sha256(fs.readFileSync(path.join(root, f))),
  relativeBase: "README.md 所在目录（仓库根）",
  relativeResolved: "./" + f,
}));

const data = {
  generatedAt: new Date().toISOString(),
  sources: {
    indexHtml: "index.html",
    readme: "README.md",
    workflow: {
      declaredPath: ".github/workflows/UVRgspkjdwor.yml",
      presentInWorkspace: false,
      analyzedCopy: wfAbs,
      stampCompanion: stampAbs,
      note: "任务书引用的工作流不在本工作区（git 全量对象中也无此文件）；分析所用副本来自批次 _scratch 上游快照，旁证戳记文件同源。",
    },
  },
  localRender: {
    shell: {
      file: "index.html",
      totalLines: lines.length,
      title: { line: 5, raw: "<title>My Page</title>" },
      inlineStyle: { line: 6, raw: "<style>.igfKb7{display:none}.ADwpdF{outline:0}</style>" },
      hiddenPayloadDivs: divs,
      inlineScript: {
        startLine: 10,
        endLine: 75,
        raw: scriptRaw,
        deadFunction: "function ADD0vF(){var a=27,b=81;return a*b;}",
        xorKeyBase64: "H7JPnij/qDB+mbPssTGSn4JcPzmEZaqKsJVITTEVAoY=",
        steps: [
          { id: "gather", desc: "读取 zxlwhXiv0..6 共 7 个隐藏 div 的 textContent 并拼接成一段 base64", code: "document.getElementById('zxlwhXiv'+Gee1Ec)" },
          { id: "decode", desc: "atob 解码后与 atob 得到的密钥逐字节循环 XOR，再按 UTF-8 还原出完整 HTML 字符串", code: "R7BpWJ.charCodeAt(i) ^ iseVh6.charCodeAt(i%len)" },
          { id: "head", desc: "剥离载荷 <title>，只把 STYLE/META/LINK/BASE 四类元素搬进 document.head，并用载荷 title 覆盖 document.title", code: "if(_tag==='STYLE'||_tag==='META'||_tag==='LINK'||_tag==='BASE')" },
          { id: "extract", desc: "用正则从载荷 body 中抽出全部 <script>：外链记 src、内联记代码，保持原顺序暂存", code: "_b.replace(/<script\\b([^>]*)>([\\s\\S]*?)<\\/script>/gi, …)" },
          { id: "replace", desc: "document.body.innerHTML 整体替换为载荷 body，外壳 DOM（含 7 个 div 与自身 script）被销毁", code: "document.body.innerHTML=_b;" },
          { id: "replay", desc: "按原顺序重放脚本：外链新建 script 元素插入，内联用 new Function 执行", code: "try{ (new Function(PYACqI[1]))(); }catch(e){}" },
        ],
      },
    },
    payload: {
      bytes: dec.length,
      title: payloadTitle,
      metaDescription: /<meta name="description" content="([^"]*)"/.exec(payload)[1],
      referencesSvg: /button\.svg|preview\.svg/.test(payload),
      externalLinkTarget: "https://pandoramods.top/",
      externalLinkCount: (payload.match(/https:\/\/pandoramods\.top\//g) || []).length,
      fakeRelease: { file: "release-x64.zip", size: "101.0 MB", sha256: fakeSha },
      redirect: {
        target: "https://pandoramods.top/",
        delayMs: 9166,
        raw: redirectScript,
      },
    },
  },
  resourcePaths: {
    note: "index.html 外壳与解码载荷均不引用 button.svg / preview.svg；3 处引用全部在 README.md，且全部写死为绝对 URL。仓库根同时存在同名本地文件，若按相对引用则只能以 README.md 所在目录为基准解析——绝对与相对是两套基准，分别解析、分线呈现，不合并。",
    references: refs.map((r) => ({
      ...r,
      localCounterpart: {
        kind: "relative",
        base: "README.md 所在目录（仓库根）",
        resolved: "./" + r.name,
        ...localFiles.find((f) => f.file === r.name),
      },
      divergence: "绝对引用基准是 raw.githubusercontent.com 上 main 分支的目录（远端快照，随 main 未来提交可变）；本地同名文件按相对基准钉在当前工作区。两套基准各自解析，即使内容快照此刻一致也不并线。",
    })),
    localFiles,
  },
  triggerToPublish: {
    workflow: {
      path: ".github/workflows/UVRgspkjdwor.yml",
      presentInWorkspace: false,
      name: "qnTFIcFHOtcFOM",
      on: {
        schedule: [{ cron: "0 * * * *", meaning: "每小时整点（UTC）" }],
        workflow_dispatch: {},
        push: null,
        pull_request: null,
      },
      branchFilters: {
        onPush: null,
        onPullRequest: null,
        hardcodedInScript: "main",
        note: "触发器层面没有任何 branches 过滤（也没有 push/PR 触发可过滤）；唯一的分支约束是脚本内 const branch = \"main\"，读取、写入、409 重试全部围绕 main。",
      },
      permissions: {
        workflowLevel: { contents: "write" },
        jobLevel: { job: "HwfFwfDyqoOM", contents: "write" },
        minimumNeeded: "contents: write（createOrUpdateFileContents 要在 main 上创建提交）",
        redundant: "job 级与 workflow 级重复声明同一值；未声明 pages/actions/packages 等任何其他权限。",
      },
      runsOn: "ubuntu-22.04",
      action: "actions/github-script@v7",
      artifact: {
        path: ".github/HISIHFPxsifNnF",
        directory: ".github/",
        kind: "直接提交回仓库的追加式戳记文件（非 Actions artifact）",
        branch: "main",
        op: "repos.createOrUpdateFileContents：读取→追加一行 ISO 时间戳/runId/随机数→以随机两词+#编号 为提交信息写回",
        retries: "409 冲突最多重试 4 次，退避 1500*attempt ms",
        companionObservedLines: stampLines.length,
        companionFirstLine: stampLines[0],
        companionLastLine: stampLines[stampLines.length - 1],
      },
      publishTarget: {
        declaredInReadme: "https://zayfern.github.io/artisanal-streamlit-brew-metrics/",
        deliveredByWorkflow: null,
        actuallyWrites: "main 分支上的 .github/HISIHFPxsifNnF",
        mismatch: "README 的 Download 按钮指向 GitHub Pages 站点，但该工作流没有 pages 部署步骤、没有 pages: write 权限、不上传任何 Pages artifact；所谓“发布”只是每小时向 main 提交一行戳记。",
      },
      snippets: {
        triggers: "on:\n  schedule:\n    - cron: '0 * * * *'\n  workflow_dispatch: {}",
        permissions: "permissions:\n  contents: write\n...\n    permissions:\n      contents: write",
        artifact: "            const stampPath = \".github/HISIHFPxsifNnF\";\n            const branch = \"main\";",
        write: "const { data } = await github.rest.repos.createOrUpdateFileContents({",
      },
    },
  },
};

fs.mkdirSync(path.join(root, "trace"), { recursive: true });
fs.writeFileSync(path.join(root, "trace", "data.json"), JSON.stringify(data, null, 1) + "\n");
console.log("trace/data.json written,", JSON.stringify(data).length, "bytes json");
