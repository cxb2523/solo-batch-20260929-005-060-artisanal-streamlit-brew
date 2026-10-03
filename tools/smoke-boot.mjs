// 用最小 DOM 桩在 Node 里完整跑一遍 trace.js 的 boot，提前暴露渲染期运行时错误
import fs from "node:fs";
import vm from "node:vm";

function makeEl(tag) {
  const el = {
    tagName: tag.toUpperCase(), children: [], style: {}, dataset: {},
    className: "", textContent: "", id: "", hidden: false, type: "",
    classList: { toggle() {}, contains: () => false },
    appendChild(c) { this.children.push(c); return c; },
    remove() {}, addEventListener() {},
    querySelector() { return { textContent: "" }; },
    scrollIntoView() {},
  };
  return el;
}
const ids = {};
const document = {
  createElement: (t) => makeEl(t),
  getElementById: (id) => (ids[id] ??= makeEl("div")),
  addEventListener() {},
  readyState: "complete",
};
const data = fs.readFileSync("trace/data.json", "utf8");
const sandbox = {
  document,
  location: { hash: "#node=artifact", pathname: "/trace/", search: "" },
  history: { replaceState() {} },
  fetch: async () => ({ json: async () => JSON.parse(data) }),
  addEventListener() {},
  console,
};
sandbox.window = sandbox;
vm.runInNewContext(fs.readFileSync("trace/trace.js", "utf8"), sandbox, { filename: "trace/trace.js" });
await new Promise((r) => setTimeout(r, 100));
const count = (el) => el.children.reduce((n, c) => n + count(c), 1);
for (const id of ["chainLocal", "chainResource", "chainTrigger"]) {
  console.log(id, "渲染元素数:", count(ids[id]));
}
console.log("boot 完成，无运行时错误");
