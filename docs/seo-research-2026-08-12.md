# pluginsmp.com SEO 调研与行动建议

> 调研日期：2026-08-12
> 仓库快照：`6d5db65e9ab37669bb51630d0dc076a34a0578da`
> 范围：Google 搜不到或检索效果差的诊断路径，以及适用于当前 Agent Plugins Marketplace 的收录、内容与搜索表现优化。
> 来源边界：外部结论只使用 Google Search Central / Search Console、Bing / IndexNow、Schema.org 官方资料；站点结论来自当前仓库和对生产站的只读 HTTP / DNS 探测。

## 结论先行

当前站点没有发现一个能直接解释“Google 完全搜不到”的基础技术阻断：生产 `robots.txt` 允许全站；主页和抽样详情页对普通 UA 与 Googlebot 都返回 `200`、完整服务端渲染 HTML、`index, follow` 和 self-canonical；生产 sitemap 可访问并列出 1,592 个 URL。

因此，目前最大的未知量不是“还缺哪个 meta 标签”，而是 **Google 实际处于发现、抓取、索引还是 canonical 选择的哪一步**。这只能由 Search Console 的 Page Indexing、Sitemaps、URL Inspection、Manual Actions 和 Security Issues 证实。Google 也明确说明：满足 Googlebot 可访问、HTTP 200、存在可索引内容这三个最低技术条件，只代表“有资格被索引”，不保证真的被索引。[Google Search technical requirements](https://developers.google.com/search/docs/essentials/technical)

优先级判断：

1. **P0：先建立 Search Console 证据闭环。** 确认 sitemap 已在报告中提交且读取成功，抽样检查 Google 选择的 canonical、最近抓取和未索引原因。没有这些数据就无法区分“Google 尚未知”“已发现未抓取”“已抓取但不收录”或“被当作重复页”。
2. **P1：建设真正可索引的搜索意图落地页和独立语言 URL。** 当前 `Codex`、`Claude Code`、`MCP` 等筛选 URL 都是 `noindex` 并 canonical 到 `/plugins`；中文只靠同一 URL 上的 cookie 切换，Googlebot 默认看到英文。这两点直接限制非品牌词和中文词的可见入口。
3. **P1：提高目录详情页与标签页的独特价值。** 生产数据中有 28 个插件 description 只有 `|`、2 个为空、448 个不足 80 字符、179 个超过 300 字符；100 个标签页的 H1 又都是通用的 `Find plugins`。不要追求机械字数，而应让每页回答一个明确搜索意图并提供可信、独特、可读的摘要。
4. **P1：改善缓存与真实用户性能。** 因 cookie locale + `force-dynamic`，核心 HTML 返回 `private, no-cache, no-store`；本次跨网探测详情页 TTFB 大约 0.8–3.4 秒。它未被证明是当前不收录的根因，但值得用 Search Console Core Web Vitals / CrUX 验证并改善。
5. **P2：结构化数据和 IndexNow 是增强项，不是 Google 收录开关。** 现有 `SoftwareSourceCode` / `BreadcrumbList` 方向合理；IndexNow 主要服务 Bing 和参与该协议的引擎，不能替代 Google Search Console 和 sitemap。

## 证据分级

- **已验证事实**：由当前仓库、生产 HTTP 响应或 DNS 直接验证。
- **官方事实**：来自搜索引擎或规范所有者的一手文档。
- **推断**：由已验证事实和官方机制推导，但尚未被 Search Console 的站点数据证实。
- **建议**：下一步可执行工作；不等于已发生或已生效。

## 当前站点审计快照

### 已验证事实

| 主题 | 当前状态 | 证据 |
| --- | --- | --- |
| Google 所有权验证 | 根域 DNS 有 `google-site-verification=...` TXT，说明至少配置过域名验证；不能由此确认当前账号权限、Search Console 数据或 sitemap 提交状态 | 2026-08-12 公共 DNS 查询 |
| robots | `https://pluginsmp.com/robots.txt` 返回 200，`User-Agent: *`、`Allow: /`，并声明 sitemap | 生产探测；[`app/robots.ts`](../app/robots.ts) |
| sitemap | `https://pluginsmp.com/sitemap.xml` 返回 200，267,153 bytes，共 1,592 URL：5 个静态页、100 个标签查询页、1,487 个插件详情页 | 生产探测；[`app/sitemap.ts`](../app/sitemap.ts) |
| 首页可索引性 | 普通 UA 和无 cookie 请求返回完整英文 SSR HTML、200、`index, follow`、self-canonical | 生产探测；[`app/page.tsx`](../app/page.tsx)、[`app/layout.tsx`](../app/layout.tsx) |
| 详情页可索引性 | 抽样详情页对普通 UA 和 Googlebot 返回相同字节量的完整 HTML，包含 H1、正文、JSON-LD、200、`index, follow` 和 self-canonical | 生产探测；[`app/plugins/[slug]/page.tsx`](../app/plugins/%5Bslug%5D/page.tsx) |
| CSR / SSR | 核心正文已经在初始 HTTP HTML 中，不依赖浏览器执行 JavaScript 后才出现；当前没有证据表明 CSR 是主要阻断 | 生产 HTML 探测 |
| canonical | 首页、详情页、标签页有 self-canonical；协议、组件类型、搜索词等筛选页为 `noindex, follow` 并 canonical 到 `/plugins` | 生产探测；[`app/plugins/page.tsx`](../app/plugins/page.tsx) |
| 多语言 | 英文与简中共用完全相同的 URL；cookie `pluginsmp-locale=zh-CN` 才返回中文。没有独立中文 URL 或 `hreflang`，无 cookie / Googlebot 默认得到英文 | 生产探测；[`lib/i18n-server.ts`](../lib/i18n-server.ts) |
| 页面缓存 | 首页、详情页、标签页均为动态渲染，返回 `private, no-cache, no-store, max-age=0, must-revalidate` | 生产响应头；相关页面的 `force-dynamic` |
| 现场速度 | 本次跨网、非实验室规范化探测中，首页 TTFB 约 1.2–2.1 秒；两张详情页约 0.8–3.4 秒 | 2026-08-12 `curl` 多次探测；**不是** CrUX / Core Web Vitals 现场数据 |
| 页面描述质量 | 1,487 个插件中：2 个 description 为空，28 个仅为 `|`，448 个少于 80 字符，179 个多于 300 字符，18 组重复描述涉及 72 页 | 当前 `prisma/marketplace.db` 只读 SQL |
| 标签页 | sitemap 只列计数最高的 100 个标签页；这些页面有独立 title / description / canonical，但 H1 都是通用 `Find plugins`，主体主要是同一筛选模板 | 生产探测；[`app/categories/page.tsx`](../app/categories/page.tsx)、[`app/plugins/page.tsx`](../app/plugins/page.tsx) |
| 结构化数据 | 首页有 `WebSite` / `CollectionPage`；详情页有 `WebPage`、`SoftwareSourceCode`、`BreadcrumbList`，MCP 子项使用 `SoftwareApplication` | 生产 HTML；[`components/json-ld.tsx`](../components/json-ld.tsx) |
| 外部发现入口 | 项目 GitHub README 已多处链接生产站，属于一个真实外部入口 | [`README.md`](../README.md) |
| `www` 主机 | `https://www.pluginsmp.com/` 在本次探测中未提供可用 HTTPS；主站 canonical 一致使用非 `www` | 生产探测 |

### 尚未验证，不能当作事实

- Google 是否已发现或抓取 `https://pluginsmp.com/`。
- Search Console 中 `sitemap.xml` 是否已手动提交、状态是否为 Success、发现多少 URL。
- 1,592 个 submitted URL 中有多少已索引，以及未索引原因分布。
- Google-selected canonical 是否与站点声明一致。
- 是否存在 Manual Action、Security Issue、Temporary Removal。
- Googlebot 最近抓取时间、抓取响应码分布和 Host availability。
- 真实用户 Core Web Vitals（LCP、INP、CLS）是否达标。
- “Google 搜不到”是品牌词无结果、`site:` 无结果、非品牌词无排名，还是某些详情页不收录；这四种问题的解法不同。

## P0：先完成 Google 收录诊断闭环

### P0-1 提交并验证 sitemap，而不是只让 robots.txt 引用它

**建议**

1. 在 Search Console 的 Domain property `pluginsmp.com` 打开 Sitemaps。
2. 提交准确 URL：`https://pluginsmp.com/sitemap.xml`。
3. 记录 `Status`、`Last read`、`Discovered pages` 和错误详情。
4. 在 Page Indexing 报告中按该 sitemap 过滤，导出 indexed / not indexed 数量和原因。
5. 一周后复查；不要每天重复提交未变化的 sitemap。

**完成标准**

- Sitemaps 报告显示 `Success`，而不是仅凭 robots.txt 中存在一行 `Sitemap:` 就宣布完成。
- 能给出 `Indexed / Submitted` 比例及未索引原因 Top N。

**官方依据**

- Search Console 的 Sitemaps report 用于提交 sitemap、查看提交历史和解析错误；robots.txt 自动发现的 sitemap 不会出现在该报告中，主动提交后才能监控成功与错误率。[Search Console Sitemaps report](https://support.google.com/webmasters/answer/7451001)
- sitemap 帮助发现 URL，但不保证其中所有 URL 都被抓取或索引。[Google sitemap overview](https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview)

### P0-2 用 URL Inspection 建立分层抽样，不要只检查首页

至少检查以下 10–20 个 URL：

- 首页：`/`
- 核心目录：`/plugins`、`/categories`、`/timeline`、`/docs`
- 3–5 个内容完整、来自不同仓库的详情页
- 3–5 个弱内容详情页，例如 description 为 `|`、空描述或 skill/MCP 信息很少的页面
- 2–3 个流量潜力较大的标签页

每个 URL 记录：

- `URL is on Google` / `URL is not on Google`
- Discovery 来源与 referring sitemap
- Last crawl、Crawled as、Page fetch
- Crawl allowed、Indexing allowed
- User-declared canonical、Google-selected canonical
- View crawled page 的 HTML、截图与加载失败资源

Google 官方说明，URL Inspection 能查看索引版本、测试 live URL、查看渲染结果并请求单页索引；但 live test 不能预测 `Crawled - currently not indexed` 或最终 canonical 选择。[URL Inspection tool](https://support.google.com/webmasters/answer/9012289)

### P0-3 按 Search Console 状态分流

| Search Console 结果 | 解读 | 下一步 |
| --- | --- | --- |
| `URL is unknown to Google` | Google 尚未建立该 URL 记录 | 确认 sitemap Success、首页到该页有标准 `<a href>` 链接；对首页和少数核心页请求索引 |
| `Discovered - currently not indexed` | 已发现但尚未抓取 | 检查 Crawl Stats、服务器稳定性、内部链接优先级和 sitemap；不要批量反复请求索引 |
| `Crawled - currently not indexed` | 已抓取但未选入索引 | 优先审视独特价值、模板重复、低质量 description、canonical 和用户需求；单纯继续提交通常不是答案 |
| Duplicate / Google chose different canonical | Google 把页面并入另一 URL | 对照 Google-selected canonical，统一 sitemap、内部链接、redirect 与 `rel=canonical` |
| Blocked by robots / noindex | 抓取或索引指令冲突 | 当前核心页现场未见该问题；按报告中的具体 URL 修复，而不是全站猜测 |
| Server error / Hostload exceeded | 服务不稳定或响应过慢 | 对照 Crawl Stats、Vercel 日志和出错 URL，先恢复稳定 200 |
| Indexed but无品牌词结果 | 不是收录问题，转为排名/查询匹配问题 | 查看 Performance 的查询、展示、位置与国家/语言，实施 P1 内容与发现策略 |

这是诊断分流，不是对当前根因的断言。Page Indexing 和 URL Inspection 才提供 Google 实际发现、抓取、索引与 canonical 数据。[Page indexing report](https://support.google.com/webmasters/answer/7440203) [URL Inspection fields](https://support.google.com/webmasters/answer/9012289)

### P0-4 排除站点级阻断

在 Search Console 检查：

- Manual Actions
- Security Issues
- Removals
- Crawl Stats / Host availability

URL Inspection 的 live success 也不检查所有 manual action、security issue、legal removal 或 temporary removal 条件，所以“Live URL available”仍不是最终可见性保证。[URL Inspection limitations](https://support.google.com/webmasters/answer/9012289)

## P1：最可能提升非品牌词和中文检索的产品改进

### P1-1 为核心搜索意图建立独立、可索引的落地页

当前这些有明确搜索需求的筛选 URL 都是 `noindex`，并 canonical 到 `/plugins`：

- `/plugins?protocol=codex`
- `/plugins?protocol=claude-code`
- `/plugins?type=mcp`

**建议**

建立稳定路径而不是把所有意图压到一个通用目录页，例如：

- `/codex-plugins`
- `/claude-code-plugins`
- `/agent-skills`
- `/mcp-servers`

每个页面应有：

- 与搜索意图一致的唯一 title、H1 和简洁摘要；
- 对该生态的原创说明：规范、安装方式、兼容范围、风险提醒、更新时间；
- 精选项目和完整结果的标准 `<a href>` 链接；
- self-canonical；
- 只在内容确实有独特价值时进入 sitemap。

Google 说明，title 应唯一、清晰、简洁并准确描述页面；内部链接的锚文本帮助用户和 Google 理解目标页。[Title link best practices](https://developers.google.com/search/docs/appearance/title-link) [Link best practices](https://developers.google.com/search/docs/crawling-indexing/links-crawlable)

### P1-2 把中文从 cookie 变体升级为独立 URL + hreflang

**当前问题**

同一 URL 根据 cookie 返回英文或中文，无 cookie 时默认英文；Googlebot 通常不会持有用户设置的 locale cookie，因此中文版本没有稳定、可分享、可 canonical 的索引 URL。

**建议**

- 使用 `/en/...` 与 `/zh-cn/...`（或等价子域 / 子目录）作为语言版本的稳定 URL。
- 每种语言页面 self-canonical，不要把中文 canonical 到英文。
- 每组对应页相互声明 `hreflang="en"`、`hreflang="zh-CN"`，并提供 `x-default`。
- sitemap 中列出语言 URL 与 alternate 关系。
- cookie 只用于记忆用户偏好，不作为搜索引擎发现语言版本的唯一机制。
- 对中文落地页写真正的中文主内容，不只翻译导航壳。

Google 明确推荐不同语言使用不同 URL，而不是依赖 cookie 或浏览器设置；locale-adaptive 页面可能无法让 Google 抓取、索引或排名所有语言变体。[Managing multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites) [Locale-adaptive pages](https://developers.google.com/search/docs/specialty/international/locale-adaptive-pages)

### P1-3 修复详情页的描述与标题质量，但不要追求“最低字数”

**当前问题**

- 28 个插件 description 为单字符 `|`，会直接生成同样的 meta description 和页面首段。
- 2 个没有 description；448 个不足 80 字符；179 个超过 300 字符。
- 18 组重复 description 涉及 72 个页面。
- 详情 title 基本是 `{plugin.name} · Agent Plugins Marketplace`，没有稳定包含兼容平台与用途。

**建议**

1. 入库时过滤 `|`、占位符、控制字符、仅标点、重复模板等无效摘要。
2. 若 manifest description 不合格，从 skill descriptions、协议、MCP、作者与仓库信息生成一条可读摘要；生成内容必须与页面可见正文一致。
3. title 可采用 `{插件名} – {用途} for {Codex/Claude Code}`，只放真实、最重要的平台信息。
4. meta description 使用页面特定数据，概括用途、兼容格式和关键组件；不要塞关键词。
5. 对没有足够独特价值的占位页，先不进 sitemap 或设 `noindex, follow`；数据完善后再开放索引。不要仅凭字符数自动 noindex。

Google 说明 snippet 主要来自可见正文，也可能使用 meta description；数据库型站点可以程序化生成描述，但应人类可读、页面特定且多样。[Meta description guidance](https://developers.google.com/search/docs/appearance/snippet) Google 同时明确表示没有神奇的最低或最高字数，应关注独特、可靠、对人有帮助的内容。[SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) [Helpful, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)

### P1-4 让标签页成为主题页，而不只是 100 份筛选模板

**建议**

- 只索引有稳定搜索意图、足够项目数量、独特介绍和可维护质量的标签。
- H1 应对应标签，例如 `Security plugins for Codex and Claude Code`，而不是所有页都叫 `Find plugins`。
- 为重要标签补一段人工或可审计生成的主题说明、选择标准、兼容性差异和代表项目。
- 泛化、拼写异常、单项目或低信息标签不进入 sitemap；它们仍可作为站内筛选。
- 为高价值主题使用清晰路径（如 `/topics/security`），query URL 保留为筛选但 canonical 到主题页。

**推断**：当前模板化标签页不一定违反 Google 规则，但它们之间的区别主要是结果集合和短 description；若 Search Console 大量报告 `Crawled - currently not indexed`，这是首要质量排查对象。Google 表示独特、更新、对人有帮助的内容通常比其他常见 SEO 调整更能影响搜索表现。[SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

### P1-5 加强内部链接层次和自然外部发现

**内部链接建议**

- 首页直接链接四个核心意图落地页。
- 详情页增加真实可见的 breadcrumbs、相关插件、同协议、同任务主题链接。
- 主题页使用描述性锚文本，不用重复的 `View` / `More`。
- 确保重要详情页能从首页通过少量标准 `<a href>` 跳转到达，而不只依赖 sitemap 或搜索表单。

**外部发现建议**

- 保持项目 GitHub README 到生产站的链接。
- 提供可选择的 `Listed on Agent Plugins Marketplace` badge / 作者页，让被索引仓库愿意自然回链；不可强制，也不要购买链接。
- 发布真正有引用价值的资料：插件协议对比、兼容性报告、验证方法、生态趋势与公开数据导出。
- 在 OpenAI / Anthropic / Agent Plugins 相关社区和仓库中，只在对讨论有帮助时分享相应深链。

Google 主要通过已抓取页面中的链接发现新页，并建议通过真实推广让相关人群知道网站；大量新页面也通过链接发现。[SEO Starter Guide: discovery and promotion](https://developers.google.com/search/docs/fundamentals/seo-starter-guide) Google 的排名系统仍使用链接分析，但外链只是多种信号之一，不能代替内容相关性与价值。[Google ranking systems](https://developers.google.com/search/docs/appearance/ranking-systems-guide)

### P1-6 改善缓存、TTFB 与真实 Core Web Vitals

**建议**

- 独立语言 URL 后，让不随用户变化的目录页和详情页可静态生成、ISR 或 CDN 缓存。
- 把 cookie 个性化限制在客户端偏好或可缓存边缘策略，不让整个 HTML 因语言 cookie 永久 `private/no-store`。
- 为 sitemap 与核心页面设置稳定缓存和条件请求；内容未变时支持合理的 `ETag` / `304`。
- 在 Search Console Core Web Vitals 查看真实用户分组；用 PageSpeed Insights / Lighthouse 做实验室诊断。
- 优先关注真实数据的 LCP、INP、CLS，而不是只优化一个 Lighthouse 总分。

Google 推荐良好阈值：LCP 2.5 秒内、INP 低于 200 ms、CLS 低于 0.1，并建议用 Search Console Core Web Vitals 报告看真实用户表现。[Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals) 更快的服务器响应也能提高抓取效率，但 1,592 URL 的站点不应在没有 Crawl Stats 证据时把“crawl budget”当作首要根因。[Troubleshoot crawling errors](https://developers.google.com/search/docs/crawling-indexing/troubleshoot-crawling-errors)

## Sitemap、canonical、robots / noindex 的具体建议

### sitemap

- 当前 1,592 URL、267 KB 远低于单 sitemap 50,000 URL / 50 MB 限制，无需因大小拆分。[Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- 可按 `core`、`plugin-details`、`topics` 拆分，不是为突破限制，而是让 Search Console 分组显示 submitted / indexed 比例。
- 只列希望进入 Google 搜索结果的 canonical URL。
- 当前 `<lastmod>` 使用仓库 `repoPushedAt` 或 `indexedAt`。应确认它代表该插件页面的**重要内容变化**，而不是 monorepo 里无关文件的 push。
- Google 忽略 sitemap 的 `<priority>` 与 `<changefreq>`，无需继续调这些数字；把精力放在准确 URL 和 `lastmod`。[Google sitemap `lastmod` guidance](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)

### canonical

- 保持核心页 self-canonical、sitemap 与内部链接都指向相同非 `www` HTTPS URL。
- 若建设独立主题页，旧 query 筛选页 canonical 到对应主题页；不要让同一页在 sitemap 和 HTML 中声明不同 canonical。
- 为 `http`、意外 `www`、尾斜杠等非首选形式提供单跳永久重定向。当前 `www` 不可用并不直接阻断非 `www` 主站，但以后若被外部引用，应明确重定向而不是 TLS 失败。

Google 把 redirect 和 `rel=canonical` 视为较强 canonical 信号，把 sitemap 纳入视为较弱信号；并建议 canonical 方法之间保持一致。[Canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)

### robots / noindex

- 当前 robots 全站允许是合理的；不要用 robots.txt 处理 canonical。
- 不想进入索引的低价值筛选页使用 `noindex, follow`，并保持 Googlebot 可抓取，Google 才能看到 noindex。
- 不要把 `noindex` 写进 robots.txt；Google 不支持这种方式。
- 若某页面应保留索引，不要同时被更上层 metadata 或 `X-Robots-Tag` 覆盖为更严格规则。

Google 说明 robots.txt 主要控制抓取负载，不是可靠的去索引机制；noindex 必须在页面可抓取时才能生效。[Robots.txt introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro) [Noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)

## SSR / JavaScript 判断

Google 会执行 JavaScript，但抓取、渲染、索引是不同阶段，渲染可能排队；Google 仍推荐 SSR 或预渲染，因为初始 HTML 对用户和爬虫更快，且并非所有机器人都执行 JavaScript。[JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)

当前站点已经把标题、canonical、H1、详情正文、内部链接和 JSON-LD 放在服务器返回 HTML 中。因此：

- **已验证**：无需为“让 Google 看见正文”重写成另一种 SSR 框架。
- **仍需验证**：URL Inspection 的 rendered screenshot / HTML 是否与现场一致、资源是否加载失败。
- **建议**：下一步重点是索引证据、内容区分度、语言 URL 和缓存，而不是引入 bot-specific dynamic rendering。Google 已把 dynamic rendering 定义为 workaround，并推荐 SSR、static rendering 或 hydration。[Dynamic rendering guidance](https://developers.google.com/search/docs/crawling-indexing/javascript/dynamic-rendering)

## 结构化数据：保留正确语义，不虚构评分

当前详情主实体使用 `SoftwareSourceCode`，这与“可访问的插件源码和仓库”语义相符；Schema.org 明确定义了 `codeRepository`、`runtimePlatform` 等字段。[Schema.org SoftwareSourceCode](https://schema.org/SoftwareSourceCode)

**建议**

- 用 [Schema Markup Validator](https://validator.schema.org/) 验证通用 Schema.org 语法。
- 用 [Google Rich Results Test](https://search.google.com/test/rich-results) 验证 Google 支持的富结果类型。
- 保留 `BreadcrumbList`，并让页面可见 breadcrumb 与 JSON-LD 一致。
- 不要为了富结果把每个插件强行改成 Google `SoftwareApplication`。Google 的 software app rich result 需要 `name`、`offers.price`，且必须有真实 `aggregateRating` 或 `review`；当前站点没有自己的真实评价数据，不能伪造。[Google SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- 结构化数据能帮助 Google 理解页面并使页面有资格展示某些增强样式，但不能替代可抓取、可索引和有价值的正文。[Structured data introduction](https://developers.google.com/search/docs/appearance/structured-data/intro-structured-data)

## Bing 与 IndexNow：作为补充通道

**建议**

1. 在 Bing Webmaster Tools 导入已验证的 Google Search Console property 或单独验证。
2. 提交同一个 sitemap，并查看 Site Explorer / URL Inspection。
3. 对插件新增、重要更新和删除事件实施 IndexNow，根目录放验证 key，批量 POST 变化 URL。
4. 只提交真正新增、更新、删除的 URL，不要定时重复推送全部 1,592 URL。

Bing 官方推荐 IndexNow 自动通知 Bing 和其他参与引擎，并明确说明它不能取代 sitemap、内容质量或可访问性，也不保证收录。[Bing URL submission](https://www.bing.com/webmasters/help/URL-Submission-62f2860b) [IndexNow protocol](https://www.indexnow.org/documentation) 当前未找到 Google 官方声明其参与 IndexNow，因此不能把 IndexNow 当作改善 Google 收录的措施。

## 不值得优先投入的做法

- **继续堆 meta keywords**：Google 明确不使用 keywords meta tag 进行网页排名。[Google: meta keywords](https://developers.google.com/search/blog/2009/09/google-does-not-use-keywords-meta-tag)
- **关键词堆砌**：重复 `Codex plugin / Claude plugin / MCP` 不会替代清晰、自然、页面特定的内容，且关键词堆砌违反 spam policies。[SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- **每天重复提交 sitemap 或每页手动 request indexing**：请求不保证进入索引；大量新/更新页应使用 sitemap。[URL Inspection: request indexing](https://support.google.com/webmasters/answer/9012289)
- **调 sitemap priority / changefreq**：Google 明确忽略这两个字段。[Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- **购买外链或批量目录提交**：目标应是相关社区与作者自然引用，而不是制造链接数量。
- **伪造 review / rating 结构化数据**：既不可信，也不符合 Google 富结果要求。
- **仅用 `site:` 结果数当监控指标**：它可做快速提示，但 Search Console Page Indexing、URL Inspection 与 Performance 才能提供站点所有者需要的诊断数据。

## 建议的 30 天执行顺序

### 第 0–2 天：取得真相

- 提交并确认 sitemap Success。
- 导出 Page Indexing 按 sitemap 的状态与原因。
- 完成 10–20 URL Inspection 抽样矩阵。
- 检查 Manual Actions、Security Issues、Removals、Crawl Stats。
- 保存基线：indexed/submitted、品牌/非品牌 impressions、top queries、国家、设备。

### 第 3–10 天：修 P1 入口与质量

- 建立四个核心意图落地页。
- 设计 `/en`、`/zh-cn` URL 与 hreflang 迁移方案。
- 修复 description 无效值和程序化摘要。
- 只保留有价值的标签页进入 sitemap，并使 H1 / intro 与标签意图一致。
- 增加相关插件与主题内部链接。

### 第 11–20 天：性能与增强

- 将稳定页面切到可缓存 SSR / ISR，复测响应头和 TTFB。
- 验证 Core Web Vitals 现场数据；无 CrUX 数据时记录“数据不足”，不要声称通过。
- 验证 Schema.org / Rich Results；只修真实错误和有价值的 warning。
- 配置 Bing Webmaster Tools 与 IndexNow。

### 第 21–30 天：复盘，不提前宣判

- 对比 sitemap submitted/indexed 和未索引原因变化。
- 对比品牌词、`Codex plugins`、`Claude Code plugins`、`agent skills marketplace`、`MCP servers directory` 等查询的 impressions、CTR、平均位置。
- 复查新增落地页和弱详情页的 URL Inspection。
- 记录哪些改动被 Google 重新抓取；Google 表示有些改动几小时可见，有些可能需要数周或数月，通常应等待几周评估效果。[SEO Starter Guide: timing](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)

## 验收指标

| 指标 | 基线 | 30 天验收方向 |
| --- | --- | --- |
| Sitemap status | 未知 | Success，Last read 持续更新 |
| Submitted / Indexed | 未知 | 有可解释的比例与未索引原因，不追求机械 100% |
| 核心页 URL Inspection | 未知 | 首页、目录、意图落地页均 indexed，Google canonical 正确 |
| 弱详情页 | 未知 | 内容修复后部分进入索引；无独特价值者主动退出 sitemap |
| 品牌词 impressions | 未知 | 开始稳定出现，首页为主要落地页 |
| 非品牌词 impressions | 未知 | 核心意图落地页获得 impressions，查询与页面意图匹配 |
| 中文检索 | 当前无独立索引 URL | `/zh-cn` 页面被发现、抓取，hreflang 互指正确 |
| CWV | 未知 | 以 Search Console 真实用户数据为准；无数据则诚实记录不足 |
| Server / crawl errors | 未知 | Crawl Stats 无持续 5xx / hostload 异常 |

## 核心官方来源

- [Google Search technical requirements](https://developers.google.com/search/docs/essentials/technical)
- [SEO Starter Guide](https://developers.google.com/search/docs/fundamentals/seo-starter-guide)
- [URL Inspection tool](https://support.google.com/webmasters/answer/9012289)
- [Page indexing report](https://support.google.com/webmasters/answer/7440203)
- [Sitemaps report](https://support.google.com/webmasters/answer/7451001)
- [Build and submit a sitemap](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [Canonicalization](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Robots.txt introduction](https://developers.google.com/search/docs/crawling-indexing/robots/intro)
- [Noindex guidance](https://developers.google.com/search/docs/crawling-indexing/block-indexing)
- [JavaScript SEO basics](https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics)
- [Managing multilingual sites](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Helpful, reliable, people-first content](https://developers.google.com/search/docs/fundamentals/creating-helpful-content)
- [Core Web Vitals](https://developers.google.com/search/docs/appearance/core-web-vitals)
- [Google SoftwareApplication structured data](https://developers.google.com/search/docs/appearance/structured-data/software-app)
- [Schema.org SoftwareSourceCode](https://schema.org/SoftwareSourceCode)
- [Bing URL submission](https://www.bing.com/webmasters/help/URL-Submission-62f2860b)
- [IndexNow documentation](https://www.indexnow.org/documentation)
