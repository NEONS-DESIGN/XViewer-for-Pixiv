<div align="center">

<img src="src/icons/icon-128.png" width="96" alt="XViewer for Pixiv 的图标" />

# XViewer for Pixiv

**一款浏览器扩展程序，为 pixiv 用户页面添加接近 X.com 媒体浏览体验的图片查看器**

[![version](https://img.shields.io/github/package-json/v/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](package.json)
[![license](https://img.shields.io/github/license/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](LICENSE)
![manifest](https://img.shields.io/badge/manifest-v3-0096fa)
![tests](https://img.shields.io/badge/tests-1058%20passing-0096fa)

**[项目主页](https://xviewer.neonsdesign.com/zh-cn/)** ・
[隐私政策](https://xviewer.neonsdesign.com/zh-cn/privacy.html) ・
[日本語](README.md) ・
[English](README.en.md) ・
[한국어](README.ko.md) ・
[繁體中文](README.zh-TW.md)

</div>

---

> [!NOTE]
> 本文档是 [README.md](README.md) 的参考译文。
> 扩展程序本身支持简体中文显示。（请参阅[支持的语言](#支持的语言)）

---

> [!IMPORTANT]
> **这是利用 pixiv 平台开发的非官方扩展程序。**
> **并非由 pixiv Inc. 制作或发布的应用程序。**
> 本扩展程序与该公司没有任何关系，也未获得其合作、支持或推荐。
> 因使用本扩展程序而产生的一切后果，均由用户自行承担。

---

## 这是什么

在 pixiv 的用户页面点击作品后，**无需跳转页面，就会在当前页面打开弹窗。**
多张图片的切换、动图的播放、作品说明和评论的阅读，乃至点赞、收藏、关注和发表评论，
都可以在弹窗中完成。关闭后会回到原来的网格和原来的滚动位置。

![在查看器中打开作品的界面](docs/images/viewer.jpg)

## 主要功能

### 查看器

| | |
| --- | --- |
| **在弹窗中打开** | 接管网格中的点击，不跳转页面直接显示。URL 会替换为 `/artworks/{id}`，因此也可以刷新和分享 |
| **切换多张图片** | 用 `←` `→` 或屏幕边缘的箭头翻页。会预加载前后的图片，切换很快 |
| **切换作品** | 用 `↑` `↓` 移到网格中的上一个或下一个作品。到达末尾时会自动加载下一页的内容。在插画 / 漫画标签页中只会依次浏览该类别的作品 |
| **动图** | 解压 zip 并组合帧，支持播放和暂停 |
| **查看原图** | 点击图片后，以原始尺寸铺满整个屏幕打开（与 pixiv 作品页面的显示方式相同）。点击左右边缘或按 `←` `→` 翻页（默认关闭） |

### 侧边栏

作品说明、标签、投稿时间、各项计数和评论会在图片旁纵向排成一列。

![侧边栏中的评论显示](docs/images/sidebar-comments.jpg)

| | |
| --- | --- |
| **作品信息** | 作品说明、标签、投稿时间、点赞数 / 收藏数 / 浏览量，以及作者的头像和关注按钮 |
| **阅读评论** | 以图片形式显示贴图和表情。支持展开回复和加载更多。即使加载失败，也可以通过“重试”继续阅读 |
| **发表评论** | 可以在弹窗中对作品发表评论和回复。表情和贴图从面板中选择。自己的评论经确认后可以删除 |
| **操作** | 点赞、收藏（Shift + 点击为非公开）、关注、分享（X / Facebook / Pawoo / 复制链接）。在其他标签页中已点过的赞不会重复计算，登录失效时也会提示。在自己的作品中不显示这 3 个按钮（与 pixiv 网站相同） |

![评论输入框和表情面板](docs/images/comment-form.jpg)

### 用户页面

| | |
| --- | --- |
| **无限滚动** | 可以将插画和漫画列表的分页（1 2 3 …）改为向下连续加载。URL 中的 `?p=` 会跟随屏幕上显示的页码，刷新后也能回到大致相同的位置（默认关闭） |
| **隐藏精选** | 隐藏个人资料主页中显示的“精选”，让作品列表一眼可见（默认关闭） |
| **整理 Tab 顺序** | 在网格中按 Tab 时，可以将收藏和标题从焦点顺序中移除（默认保持 pixiv 的标准行为） |

### 其他

| | |
| --- | --- |
| **主题** | 查看器跟随 pixiv 网站的夜间 / 日间设置。设置页面可以自行切换 |
| **细致的设置** | 分为查看器、图片、用户页面、操作 4 类，可以按喜好调整画质、预加载张数、侧边栏的显示方式、无限滚动等 |
| **无障碍** | 焦点陷阱、`role="dialog"`、整理网格的 Tab 顺序。仅用键盘即可完成从打开到关闭的全部操作 |

## 支持的浏览器

支持 Manifest V3 的 Chromium 内核浏览器（Chrome / Brave / Edge 等）。需要 **Chrome 120 及以上版本**。
（使用了内容脚本的 `"world": "MAIN"`、`color-mix()` 和 CSS nesting）
Edge 也可以从 [Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl) 安装。
Firefox（Firefox 140 及以上的桌面版）可以从 [Firefox 附加组件](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/) 安装。不支持 Safari。

## 支持的语言

扩展程序的显示语言会跟随 pixiv 的显示语言切换。
（设置页面会跟随最后打开的 pixiv 页面的显示语言）

| 语言 | 支持情况 |
| --- | --- |
| 日语 | 支持 |
| 英语 | 支持 |
| 韩语 | 支持 |
| 中文（简体） | 支持 |
| 中文（繁体） | 支持 |
| 泰语 | 视需求而定 |
| 马来语 | 视需求而定 |

上表是 pixiv 可选的 7 种显示语言。当 pixiv 以“视需求而定”的语言显示时，扩展程序将以英语显示。
如果希望支持某种语言，请通过下方的“问题反馈、咨询与需求”告诉我们。

## 安装

可以从 **[Chrome 应用商店](https://chromewebstore.google.com/detail/xviewer-for-pixiv/hbnpmpiipnocflhikmpamobpodadfbpd)** 安装。Brave / Edge 等 Chromium 内核浏览器也可以从同一个商店页面安装。
Edge 也可以从 **[Edge 加载项](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl)** 安装。
Firefox 可以从 **[Firefox 附加组件](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/)** 安装。

如果不想通过商店安装，请用以下任一方法加载。

### 使用发布版 zip

1. 从 [Releases](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/releases) 下载最新版的 `XViewer.for.Pixiv_x.y.z.zip` 并解压
2. 打开 `chrome://extensions/`
3. 打开右上角的 **开发者模式**
4. 点击 **加载已解压的扩展程序**
5. 选择解压后的文件夹

### 从源代码构建

```bash
git clone https://github.com/NEONS-DESIGN/XViewer-for-Pixiv.git
cd XViewer-for-Pixiv
npm install
npm run build
```

1. 打开 `chrome://extensions/`
2. 打开右上角的 **开发者模式**
3. 点击 **加载已解压的扩展程序**
4. 选择生成的 **`dist/`** 文件夹

请选择 `dist/` 而不是 `src/`。只有构建后的产物才能运行。

## 使用方法

打开 pixiv 的**用户页面**（`https://www.pixiv.net/users/{id}` 等），点击作品即可。

### 键盘操作

| 按键 | 操作 |
| --- | --- |
| `←` `→` | 在同一作品中翻页（查看原图时也一样） |
| `↑` `↓` | 移到上一个或下一个作品 |
| `Ctrl` + `Enter` | 在评论输入框中发送（Mac 为 `Cmd` + `Enter`）。`Enter` 为换行 |
| `Esc` | 从最前面的内容开始依次关闭（表情面板 → 查看原图 / 分享菜单 → 弹窗）。有尚未发送的评论时不会关闭弹窗 |
| `Tab` | 在弹窗内移动焦点（不会移出弹窗） |

输入评论时，`←` `→` `↑` `↓` 用于移动光标（不会切换作品）。

### 设置

从工具栏的图标打开。可以按查看器、图片、用户页面、操作的分类细致地调整以下各项。
“许可证”标签页中列有免责声明，以及随附的第三方资源的说明。

| 分类 | 项目 | 默认值 | 效果 |
| --- | --- | --- | --- |
| 查看器 | 使用查看器 | 开 | 关闭后将恢复 pixiv 的默认行为 |
| 查看器 | 显示侧边栏 | 开 | 在图片旁显示作品说明、标签、点赞数和评论 |
| 查看器 | 侧边栏的滚动方式 | 整个侧边栏一起滚动 | 将作品说明到评论连成一体滚动，还是固定作品说明、只滚动评论 |
| 图片 | 图片分辨率 | 标准（长边 1200px） | 选择原图会更清晰，但加载较慢 |
| 图片 | 预加载 | 前后各 1 张 | 提前加载的图片张数（不预加载 / 前后各 1 张 / 前后各 3 张） |
| 图片 | 预加载前后作品 | 关 | 显示完成后，会预先加载 1 件 `↑` `↓` 可能移动到的作品。切换更快，但即使未切换就关闭，也会增加流量消耗 |
| 图片 | 点击查看原图 | 关 | 点击图片后，以原始尺寸铺满整个屏幕打开。无论上方的分辨率设置如何，都会加载原图 |
| 用户页面 | 隐藏精选栏 | 关 | 隐藏个人资料主页中显示的“精选” |
| 用户页面 | 无限滚动 | 不使用 | 可选择“滚动到底部时加载”或“始终提前加载下一页” |
| 操作 | 点击背景关闭 | 开 | 点击图片外侧时是否关闭 |
| 操作 | 网格中的 Tab 键导航 | 不跳过 | 在网格中按 Tab 时，是否将收藏和标题从焦点顺序中移除 |

设置页面的配色可以通过右上角的图标在夜间 / 日间之间切换。初始状态跟随操作系统的设置，
切换一次后就会固定为所选的配色（通过“重置设置”可恢复为跟随操作系统）。
此配色仅作用于设置页面，查看器仍然跟随 pixiv 网站的设置。

## 注意事项

- **这是非官方的扩展程序。** 它是利用 pixiv 平台开发的，
  并非由 pixiv Inc. 制作或发布的应用程序。与该公司没有任何关系
- **使用风险自负。** 对于因使用本扩展程序而造成的损失，作者及 pixiv Inc. 概不负责
- **R-18 作品的显示遵循 pixiv 的设置。** 本扩展程序不会绕过年龄限制
- **赞无法取消。** 这是 pixiv 的机制，即使误点也无法撤回
- **发表和删除评论与在 pixiv 网站上操作相同。** 每次点击都会直接发送到 pixiv。
  删除后无法恢复，因此设有两步确认
- **没有收集作品的功能。** 既没有下载功能，也没有批量操作的自动化。
  只获取当前打开的作品及其前后的几张图片
- **无限滚动按与 pixiv 网站相同的分页读取。** 每次 1 页（48 个作品），
  只在向下浏览时逐页获取，不会一次性批量获取作品
- **可能会因 pixiv 的改版而无法运行。** pixiv 及相关服务可能会在不事先通知的情况下
  修订、更改或停止提供功能及内容
- 直接访问 `/artworks/{id}` 时，以及在搜索结果、排行榜、标签页面中不会启动

以上内容遵循 [pixiv Inc. 服务使用条款](https://policies.pixiv.net/) 中“注册商标使用指南 &gt; 关于在应用程序及各类服务等中的使用”的规定。

## 问题反馈、咨询与需求

问题反馈、使用方法的咨询和功能需求，请通过 **[联系表单](https://forms.gle/C7AWaUHWmwnoeDV66)** 发送。表单为英文，但可以直接用中文填写。
使用 GitHub 的用户也可以通过 [Issues](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/issues) 反馈。

## 开发

| 命令 | 内容 |
| --- | --- |
| `npm run build` | 生成 Chromium 内核浏览器用的 `dist/` 和 Firefox 用的 `dist-firefox/` |
| `npm run build:chrome` / `npm run build:firefox` | 只生成其中一个 |
| `npm run watch` | 构建的监视模式 |
| `npm test` | 用 `node --test` 运行测试（1124 tests） |
| `npm run build:icons` | 生成扩展程序图标的 PNG（生成物已提交） |
| `npm run build:symbols` | 重新生成界面图标的图形数据（生成物已提交） |
| `npm run build:site-images` | 导出项目主页的图片（WebP 和 OGP 用的 JPEG）（生成物已提交。原始素材 PNG 不包含在仓库中，因此无法在本地运行） |
| `npm run build:screenshots` | 组合 Chrome 应用商店用的截图（原始截图不包含在仓库中，因此无法在本地运行） |
| `npm run pack:crx -- --key <私钥>` | 生成上传到商店的已签名 CRX（用于 Chrome 应用商店的“经过验证的 CRX 上传”。签名私钥仅由作者持有） |

版本号的唯一来源是 `package.json` 的 `version`，构建时会写入 `dist/manifest.json` 和 `dist-firefox/manifest.json`。
所支持浏览器的最低版本（esbuild 的 target、`minimum_chrome_version`、Firefox 的 `strict_min_version`）的来源是 `scripts/targets.mjs`。

`site/` 是[项目主页](https://xviewer.neonsdesign.com/zh-cn/)的源文件，没有构建步骤。
推送到 `main` 后，`.github/workflows/pages.yml` 只会将 `site/` 发布到 GitHub Pages。
在本地确认时，请运行 `cd site && python -m http.server 8000` 并打开 `http://localhost:8000/`。
（以 `file://` 打开时，只有根相对链接的行为会有所不同）

## 许可证

[MIT License](LICENSE)

关于随附的第三方资源，请参阅 [`NOTICE`](NOTICE)。Apache License 2.0 的全文随附于 [`LICENSES/`](LICENSES)。
