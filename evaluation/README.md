# 行为观察评测

评测调用同一个受控浏览器采集器，保存实际报告、PNG、WebM 与 `comparison.json`。默认 8 个原创 HTML 样例、9 项正向预期，以及静态目标／自主计数两项悬停误报检查。样例在本轮机制开发时定义，不是盲测集，也不代表陌生真实网站或用户最关注效果的识别率。

## 运行

安装项目依赖与 Chromium 后，在仓库根目录运行：

```sh
npm run evaluate
npm run evaluate -- --baseline /absolute/path/to/frozen-source --out .pageprism/evaluation/comparison
```

基线目录需包含自身的 `server/`、`shared/`、`package.json` 及兼容依赖。使用本项目旧提交的只读源码快照即可，不必切换当前工作分支。快照根目录可用 `.evaluation-revision` 记录提交号；Git 检出目录则读取 HEAD。结果的 revision 只记录提交号，因此应先提交待测采集器，避免用未提交修改冒充该提交。

同一进程按基线、候选顺序逐页运行；两者数据隔离在输出目录的 `baseline/runs/` 和 `candidate/runs/`。总耗时含启动、采集、录像与写盘，受网络、硬件和页面状态影响。本地 HTML 仅使用评测器自己的受信夹具入口；公网 URL 经过产品原有的地址与请求检查。

## 人工标注样例

```sh
npm run evaluate -- --cases /absolute/path/to/cases.json --out .pageprism/evaluation/manual
```

文件是 JSON 数组；每项提供 `html` 或 `url` 其中一个。执行前人工核实触发动作、稳定选择器和实际变化属性，保留原站参考画面及日期。例子：

```json
[
  {
    "id": "my-reference",
    "title": "人工确认的悬停反馈",
    "url": "https://example.com/",
    "expected": [
      {
        "selector": "#control",
        "trigger": "hover",
        "property": "filter",
        "valueIncludes": "none"
      }
    ],
    "noObservedHover": ["#static-control"]
  }
]
```

`trigger` 支持 `hover`、`automatic`、`scroll`。属性使用报告的事实字段名称，例如 `transform`、`fill`、`出现的文字`。`expected: []` 只能检查任务与证据是否正常输出，没有识别率含义。真实网站选择器和内容可能变化，需重新确认标注；不要为提升得分添加域名或文案专用适配。

## 指标

- `matched / expected`：按目标选择器、触发类别、事实属性及可选值片段匹配预期，不按生成标题评分。滚动时看到变化不代表已证明滚动因果。
- `falseObservedHover`：仅在人工列出的负向目标中，统计被标为已观察悬停的条目；不是全站误报率。
- `structured`：已匹配条目中具有参与者和至少两个阶段的条目数，多个预期可对应一个条目。这是输出完整性检查，不能证明解释正确。
- `remainingGaps`：结构化覆盖记录里未完成／受阻／受限的检查数。旧版无该字段时为 `null`，不能解释成没有缺口；值为零也不代表网页被完全识别。
- `status`、`seconds`、`runId`：任务状态、实际耗时及报告定位。失败或部分结果不得从统计中静默剔除。

本轮实测与边界见[验证记录](../docs/testing/2026-10-25-evidence-guided.md)。后续需要独立人工真实网站金标和用户重要性标注，才能评估普适覆盖和使用价值。
