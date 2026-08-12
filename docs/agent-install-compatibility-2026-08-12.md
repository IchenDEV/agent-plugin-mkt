# Agent 安装兼容性调研

日期：2026-08-12

## 结论

现有 Codex 与 Claude Code marketplace 之外，最值得优先接入的是 **Qwen Code、Qoder CLI 和 CodeBuddy**：三者都有完整插件与 marketplace 能力，并能直接或经轻量适配复用 Claude 结构。**Kimi Code** 也可完整支持，但需要生成 Kimi manifest 和部分 ZIP 产物。**OpenCode、TRAE、Lingma** 先以 Agent Skills 和 MCP 分层接入，避免把“能读取 `SKILL.md`”误标为“能安装完整插件”。

## 兼容性矩阵

| Agent | Agent Skills | MCP | 完整插件 / Marketplace | 可直接复用现有产物 | 推荐安装入口 | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| Codex | 原生 | 原生 | 原生 Codex marketplace | `.codex-plugin/plugin.json`、`.agents/plugins/marketplace.json` | `codex plugin marketplace add` + `codex plugin add` | 已支持 |
| Claude Code | 原生 | 原生 | 原生 Claude marketplace | `.claude-plugin/plugin.json`、`.claude-plugin/marketplace.json` | `claude plugin marketplace add` + `claude plugin install` | 已支持 |
| Qoder CLI | 原生；用户级 `~/.qoder/skills/`，项目级 `.qoder/skills/` | 原生；本地与远程服务 | 原生插件及 marketplace；标准 manifest 为 `.qoder-plugin/plugin.json` | 当前 CLI 发布包还扫描 `.claude-plugin/plugin.json` 与 `.claude-plugin/marketplace.json`；不扫描 Codex manifest | `qodercli plugins marketplace add` + `qodercli plugins install` | 建议正式支持，先复用 Claude 清单并做真实安装验证 |
| Qoder IDE / QoderWork | 原生；QoderWork 使用 `~/.qoderwork/skills/` | IDE 支持 MCP 广场与确认式 Deeplink | IDE 有内置市场和本地文件夹导入；QoderWork 可上传插件 ZIP | QoderWork 明确接受含 `.claude-plugin/plugin.json` 的 ZIP；未证明 IDE 可注册外部 Claude marketplace | Skills CLI、IDE 市场、QoderWork ZIP 上传、MCP Deeplink | 分产品表述，不能把 QoderWork 能力外推到全部 Qoder 表面 |
| Qwen Code | 原生；个人 `.qwen/skills/`、项目 `.qwen/skills/` | 原生；Extension 可携带 MCP | 完整 Extensions 与 Marketplace Sources | **官方明确支持 Claude Code Marketplace**，安装时自动转换 manifest、Agents、Skills 和工具映射 | `qwen extensions install <marketplace>:<plugin>` | 建议第一批正式支持，复用 Claude 清单后验证 `git-subdir` |
| Kimi Code CLI | 原生 `SKILL.md` | 原生；插件可携带 MCP | 完整插件及自定义 Marketplace JSON | 不直接读取 Codex/Claude manifest；需 `kimi.plugin.json` 或 `.kimi-plugin/plugin.json` | `/plugins install <path-or-url>` 或 `/plugins marketplace <json-url>` | 可完整支持，但需生成 Kimi manifest；monorepo 子目录建议产出独立 ZIP |
| OpenCode | 原生；`.opencode/skills/`、`~/.config/opencode/skills/`，并读取 `.claude/skills/`、`.agents/skills/` | 原生；支持本地与远程 MCP | 有 OpenCode JS/TS/npm 插件，但没有 Claude/Codex 式统一 marketplace | 仅 `SKILL.md` 可直接复用；不消费 `.claude-plugin`、`.codex-plugin` 或现有 marketplace JSON | `npx skills add ... -a opencode -y`；MCP 用 `opencode mcp add` | 先支持 Skill；完整插件需 OpenCode npm/本地模块 adapter |
| CodeBuddy | 原生 | 原生 | 完整插件及 Marketplace | 兼容 Claude plugin manifest，可复用 Claude 产物作为适配基础 | CodeBuddy plugin marketplace / install 流程 | 建议在 Qoder CLI 之后接入并做端到端安装验证 |
| TRAE | 支持 Skill 层 | 支持 MCP 层 | 未确认存在可消费现有 Claude/Codex marketplace 的完整插件安装协议 | 可复用 `SKILL.md` 和 MCP 配置语义；不能直接宣称完整插件兼容 | Skill 安装 + MCP 配置分开提供 | 仅做 Skill/MCP 分层支持 |
| Lingma / Qoder CN | Skills CLI 可直接安装对应目标 | Qoder CN 可由插件或独立配置承载 MCP | Qoder CN 完整插件采用 `.qoder-plugin/plugin.json` | Skill 可直接复用；完整插件需要 `.qoder-plugin` 适配，Codex manifest 不可直接用 | `npx skills add ... -a lingma` / `-a qoder-cn`；完整插件走 Qoder CN CLI | Skill 可先上；完整插件后续适配 |

## 推荐优先级

1. **P0：Qwen Code、CodeBuddy、Qoder CLI**——Qwen 与 Qoder 先复用当前 Claude 清单；CodeBuddy 生成 `.codebuddy-plugin/marketplace.json`。三者都要验证 marketplace 添加、`git-subdir`、manifest 识别和实际组件加载。
2. **P1：Kimi Code**——生成 Kimi Marketplace、manifest 和必要的独立 ZIP 产物。
3. **P1：OpenCode Skill**——为包含标准 `SKILL.md` 的条目生成 `npx skills add <repo-or-subdir> --skill <name> -a opencode -y`。完整插件暂不展示为兼容。
4. **P1：Qoder IDE MCP**——对单一 MCP 条目生成 `qoder://aicoding.aicoding-deeplink/mcp/add?...`，保留 Qoder 的确认页面；不要把它称为插件一键安装。
5. **P2：TRAE、Lingma、Qoder CN**——先提供 Skill/MCP 分层入口；只有生成并验证 `.qoder-plugin` 或相应原生包后，才显示“完整插件”。

## 适配规则

- **Skill-only 条目**：优先使用标准 Skills CLI，按目标 agent 写入其原生目录；保留 `SKILL.md` 及脚本、引用等整个目录，不能只复制单个 Markdown 文件。
- **MCP-only 条目**：读取插件中的 MCP 声明，转换为目标 agent 的配置结构。Qoder IDE 可生成确认式 Deeplink；OpenCode 写入 `opencode.json` 或调用交互式 `opencode mcp add`。
- **完整插件条目**：必须验证目标 runtime 的 manifest、marketplace source 类型、hooks/commands/agents/MCP 语义。目录名字相似不等于协议兼容。
- **Qoder CLI**：可先复用 Claude marketplace，但要规范化和验证 `git-subdir.url`；Codex-only 条目需补 `.qoder-plugin/plugin.json` 或 Claude-compatible manifest。
- **OpenCode**：若要支持完整插件，需要把能力包装为 OpenCode npm/本地 JS/TS 模块；单纯复制 `.claude-plugin` 或 `.codex-plugin` 不成立。

## 主要证据

### OpenCode

- [Agent Skills](https://opencode.ai/docs/skills/)：列出 `.opencode/skills/`、`~/.config/opencode/skills/`、`.claude/skills/` 与 `.agents/skills/` 等发现路径。
- [Plugins](https://opencode.ai/docs/plugins/)：插件来源为本地 JS/TS 文件或 npm 包，npm 依赖由 Bun 自动安装。
- [CLI](https://dev.opencode.ai/docs/cli/#plugin)：当前命令为 `opencode plugin <module>`；MCP 可用 `opencode mcp add`。
- [统一 Marketplace feature issue](https://github.com/anomalyco/opencode/issues/28696)：统一插件、Skill、MCP marketplace 仍是功能请求，因此不能把 ecosystem 列表当作原生 marketplace 协议。

### Qoder

- [Qoder Skills](https://docs.qoder.com/extensions/skills)：确认 IDE/CLI Skill 路径，并给出 `npx skills add ... -a qoder`。
- [Qoder CLI Plugins](https://docs.qoder.com/cli/plugins)：确认 `.qoder-plugin/plugin.json`、插件目录约定、marketplace 添加/更新/安装命令以及 Git、owner/repo、本地目录和 `marketplace.json` URL 来源。
- [Qoder Plugin Reference](https://docs.qoder.com/cli/plugins-reference)：确认 marketplace schema、插件 entry source、`strict` 和命令范围。
- [QoderWork Expert Kits](https://docs.qoder.com/qoderwork/expert-kits)：上传 ZIP 可包含 `.qoder-plugin/plugin.json` 或 `.claude-plugin/plugin.json`。
- [Qoder Deeplinks](https://docs.qoder.com/user-guide/deeplink)：目前公开的写入类 Deeplink 包括规则、命令和 `/mcp/add`，没有 Skill 或 plugin install 路由。
- [官方 `@qoder-ai/qodercli` 1.1.20 发布包](https://registry.npmjs.org/@qoder-ai/qodercli/-/qodercli-1.1.20.tgz)：运行时代码扫描 `.qoder-plugin` 与 `.claude-plugin` 的 plugin/marketplace manifest。该结论与版本绑定，升级后应重新验证。

### 其他国内 Agent

- [Qwen Code Extensions](https://qwenlm.github.io/qwen-code-docs/en/users/extension/introduction/)：可直接安装 Claude Code Marketplace，并自动转换 Claude manifest、Agent、Skill 和工具映射；也支持 Git、归档、npm、本地路径和 Marketplace Sources。
- [Kimi Code Plugins](https://www.kimi.com/code/docs/en/kimi-code-cli/customization/plugins.html)：支持本地目录、ZIP URL、GitHub URL、自定义 Marketplace JSON，以及包含 Skills、Agents、Commands、Hooks 和 MCP 的 Kimi 插件 manifest。
- [CodeBuddy Plugin Marketplaces](https://www.codebuddy.ai/docs/cli/plugin-marketplaces) 与 [Plugin Reference](https://www.codebuddy.ai/docs/cli/plugins-reference)：支持完整插件、Marketplace 和 Claude-compatible manifest。
- [TRAE Agent Skill 教程](https://www.trae.ai/blog/trae_tutorial_0115) 与官方 Changelog：现有证据足以支持 Skill/MCP 分层，但不足以宣称能消费本项目的 Claude/Codex marketplace。
- [Qoder CN Plugins](https://docs.qoder.cn/cli/plugins)：Qoder CN 完整插件以 `.qoder-plugin` 协议为准；Lingma 的直接证据仅覆盖 Skill 安装目标，完整插件兼容性需单独验证。

## 证据边界

- 本文区分“官方文档声明”“官方发布包代码行为”和“尚未真实安装验证”。只有完成隔离配置目录下的 marketplace 添加、插件安装、组件发现和卸载检查后，产品 UI 才应显示“已验证安装”。
- Qoder CLI 对 `.claude-plugin` 的兼容来自当前官方发布包代码，QoderWork 的兼容来自上传文档；两者不能无条件外推到 Qoder IDE Marketplace。
- Qwen、Kimi、CodeBuddy、TRAE、Lingma/Qoder CN 本轮均未运行真实安装，因此需在接入前做隔离环境验证。
- 第三方 Skills CLI 能完成一条命令安装，不代表目标 agent 原生拥有插件 Marketplace；产品文案必须分别标注“Skill 安装”和“完整插件安装”。
