<div align="center">

<img src="src/icons/icon-128.png" width="96" alt="XViewer for Pixiv 的圖示" />

# XViewer for Pixiv

**一款瀏覽器擴充功能，為 pixiv 的用戶頁面加入近似 X.com 媒體瀏覽體驗的圖片檢視器**

[![version](https://img.shields.io/github/package-json/v/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](package.json)
[![license](https://img.shields.io/github/license/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](LICENSE)
![manifest](https://img.shields.io/badge/manifest-v3-0096fa)
![tests](https://img.shields.io/badge/tests-1058%20passing-0096fa)

**[介紹網站](https://xviewer.neonsdesign.com/zh-tw/)** ・
[隱私政策](https://xviewer.neonsdesign.com/zh-tw/privacy.html) ・
[日本語](README.md) ・
[English](README.en.md) ・
[한국어](README.ko.md) ・
[简体中文](README.zh-CN.md)

</div>

---

> [!NOTE]
> 本文件是 [README.md](README.md) 的翻譯，僅供參考。
> 擴充功能本身可以用繁體中文使用。（請見[支援語言](#支援語言)）

---

> [!IMPORTANT]
> **這是利用 pixiv 平台開發的非官方擴充功能。**
> **並非由 pixiv Inc. 製作或發布的應用程式。**
> 與該公司沒有任何關係，也未獲得其合作、支援或推薦。
> 因使用本擴充功能而產生的一切後果，均由使用者自行承擔。

---

## 這是什麼

在 pixiv 的用戶頁面點擊作品後，**不必跳轉頁面，就會直接在原處開啟對話框。**
切換多張圖片、播放動圖、閱讀作品說明與評論，乃至按讚、收藏、追蹤、
發表評論，全都能在對話框中完成。關閉後會回到原本的網格，以及原本的捲動位置。

![在檢視器中開啟作品的畫面](docs/images/viewer.jpg)

## 主要功能

### 檢視器

| | |
| --- | --- |
| **以對話框開啟** | 接管網格中的點擊，不跳轉頁面直接顯示。網址會替換為 `/artworks/{id}`，因此也能重新整理或分享 |
| **切換多張圖片** | 用 `←` `→` 或畫面兩端的箭頭翻頁。開啟設定後，點擊畫面左右邊緣也能翻頁。會預先載入前後的圖片，切換起來很快 |
| **切換作品** | 用 `↑` `↓` 移到網格中的上一個或下一個作品。開啟設定後，點擊畫面上下邊緣也能切換。到達盡頭時會自動載入下一頁的作品。在插畫 / 漫畫分頁中只會瀏覽該類型的作品 |
| **動圖** | 解壓縮 zip 並組合影格，支援播放與暫停 |
| **原尺寸顯示** | 點擊圖片後，會以原尺寸填滿整個畫面開啟（與 pixiv 作品頁面的顯示方式相同）。點擊左右兩端或按 `←` `→` 翻頁（預設為關閉） |

### 側邊欄

作品說明、標籤、投稿時間、各項計數及評論，會在圖片旁縱向排成一列。

![側邊欄的評論顯示](docs/images/sidebar-comments.jpg)

| | |
| --- | --- |
| **作品資訊** | 作品說明、標籤、投稿時間、讚 / 收藏 / 瀏覽量，以及作者的頭像與追蹤按鈕 |
| **閱讀評論** | 以圖片繪製貼圖與表情符號。支援展開回覆與載入更多評論。即使載入失敗，也能從「重試」繼續讀取 |
| **撰寫評論** | 可直接在對話框中對作品發表評論及回覆。表情符號與貼圖從面板中選擇。自己的評論在確認後即可刪除 |
| **操作** | 按讚、收藏（Shift + 點擊即為不公開）、追蹤、分享（X / Facebook / Pawoo / 複製連結）。在其他分頁按過的讚不會重複計算，登入狀態失效時也會提示。自己的作品不會顯示這 3 個按鈕（與 pixiv 本身相同） |

![評論輸入欄與表情符號面板](docs/images/comment-form.jpg)

### 用戶頁面

| | |
| --- | --- |
| **無限捲動** | 可將插畫、漫畫列表的分頁（1 2 3 …）改為往下持續載入的形式。網址中的 `?p=` 會跟隨畫面上顯示的頁數，因此重新整理後也能回到差不多的位置（預設為關閉） |
| **隱藏精選** | 隱藏個人資料首頁上的「精選」，讓作品列表立刻映入眼簾（預設為關閉） |
| **整理 Tab 順序** | 在網格中按 Tab 時，可將收藏與標題從焦點順序中移除（預設維持 pixiv 標準） |

### 其他

| | |
| --- | --- |
| **主題** | 檢視器會跟隨 pixiv 本身的深色 / 淺色設定。設定畫面可自行切換 |
| **細緻的設定** | 分為檢視器、圖片、用戶頁面、操作 4 個類別，可依喜好調整畫質、預先載入的張數、側邊欄的顯示方式、無限捲動等 |
| **無障礙** | 焦點陷阱、`role="dialog"`、整理網格的 Tab 順序。從開啟到關閉都能只用鍵盤操作 |

## 支援的瀏覽器

支援 Manifest V3 的 Chromium 系瀏覽器（Chrome / Brave / Edge 等）。需要 **Chrome 120 以上**。
（使用了內容腳本的 `"world": "MAIN"`、`color-mix()` 及 CSS nesting）
Edge 也可以從 [Edge 附加元件](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl) 安裝。
Firefox（Firefox 140 以上的桌面版）可以從 [Firefox 附加元件](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/) 安裝。不支援 Safari。

## 支援語言

擴充功能的顯示語言會配合 pixiv 的顯示語言切換。
（設定畫面會配合最後開啟的 pixiv 頁面的顯示語言）

| 語言 | 支援狀況 |
| --- | --- |
| 日文 | 支援 |
| 英文 | 支援 |
| 韓文 | 支援 |
| 中文（簡體） | 支援 |
| 中文（繁體） | 支援 |
| 泰文 | 視需求而定 |
| 馬來文 | 視需求而定 |

此表列出的是 pixiv 可選擇的 7 種顯示語言。當 pixiv 以「視需求而定」的語言顯示時，擴充功能會以英文顯示。
如果有希望支援的語言，請透過下方的「錯誤回報、問題與需求」告訴我們。

## 安裝

可以從 **[Chrome 線上應用程式商店](https://chromewebstore.google.com/detail/xviewer-for-pixiv/hbnpmpiipnocflhikmpamobpodadfbpd)** 安裝。Brave / Edge 等 Chromium 系瀏覽器也能從同一個商店頁面安裝。
Edge 也可以從 **[Edge 附加元件](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl)** 安裝。
Firefox 可以從 **[Firefox 附加元件](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/)** 安裝。

若想不透過商店安裝，請用以下任一種方法載入。

### 從發布用的 zip 安裝

1. 從 [Releases](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/releases) 下載最新版的 `XViewer.for.Pixiv_x.y.z.zip` 並解壓縮
2. 開啟 `chrome://extensions/`
3. 啟用右上角的**開發人員模式**
4. 按下**載入未封裝項目**
5. 選擇解壓縮後的資料夾

### 從原始碼建置

```bash
git clone https://github.com/NEONS-DESIGN/XViewer-for-Pixiv.git
cd XViewer-for-Pixiv
npm install
npm run build
```

1. 開啟 `chrome://extensions/`
2. 啟用右上角的**開發人員模式**
3. 按下**載入未封裝項目**
4. 選擇產生的 **`dist/`** 資料夾

請選擇 `dist/` 而不是 `src/`。只有建置後的產出物才能運作。

## 使用方式

開啟 pixiv 的**用戶頁面**（`https://www.pixiv.net/users/{id}` 系列），點擊作品即可。

### 按鍵操作

| 按鍵 | 動作 |
| --- | --- |
| `←` `→` | 在同一作品中翻頁（原尺寸顯示中也相同） |
| `↑` `↓` | 移到上一個或下一個作品 |
| `Ctrl` + `Enter` | 在評論輸入欄中發送（Mac 為 `Cmd` + `Enter`）。`Enter` 為換行 |
| `Esc` | 從最上層的項目依序關閉（表情符號面板 → 原尺寸顯示、分享選單 → 對話框）。有尚未發送的評論時不會關閉對話框 |
| `Tab` | 在對話框內移動焦點（不會移出對話框） |

撰寫評論時，`←` `→` `↑` `↓` 會用來移動游標（不會切換作品）。

### 設定

從工具列的圖示開啟。可依檢視器、圖片、用戶頁面、操作等類別，細緻地調整以下項目。
「授權」分頁中會列出免責聲明，以及隨附的第三方素材的標示。

| 類別 | 項目 | 預設 | 效果 |
| --- | --- | --- | --- |
| 檢視器 | 使用檢視器 | 開啟 | 關閉後會恢復為 pixiv 的標準行為 |
| 檢視器 | 顯示側邊欄 | 開啟 | 在圖片旁顯示作品說明、標籤、讚數及評論。關閉後會在關閉按鈕旁顯示作品頁面連結。螢幕較窄時，可用右上角的按鈕展開 |
| 檢視器 | 側邊欄的捲動方式 | 整個側邊欄一起捲動 | 要從作品說明到評論連成一體捲動，還是固定作品說明、只捲動評論 |
| 圖片 | 圖片解析度 | 標準（長邊 1200px） | 選擇原尺寸會更清晰，但載入較慢 |
| 圖片 | 預先載入 | 前後 1 張 | 預先載入下一頁的張數（不預先載入 / 前後 1 張 / 前後 3 張） |
| 圖片 | 預先載入前後作品 | 關閉 | 顯示完成後，會預先載入 1 件透過 `↑` `↓` 可能前往的作品。切換更快，但即使未切換就關閉，也會增加流量消耗 |
| 圖片 | 點擊以原尺寸顯示 | 關閉 | 點擊圖片後，以原尺寸填滿整個畫面開啟。無論上方的解析度設定為何，都會載入原尺寸圖片 |
| 用戶頁面 | 隱藏精選欄 | 關閉 | 隱藏個人資料首頁上的「精選」 |
| 用戶頁面 | 無限捲動 | 不使用 | 可從「捲到底部時載入」/「隨時預先載入下一頁」中選擇 |
| 操作 | 點擊背景關閉 | 開啟 | 點擊圖片外側時是否關閉 |
| 操作 | 點擊畫面邊緣翻頁 | 不使用 | 點擊畫面左右邊緣翻頁，點擊上下邊緣切換作品。可選擇只用左右、只用上下或兩者並用。移到邊緣時游標會變成箭頭 |
| 操作 | 網格中的 Tab 移動 | 不跳過 | 在網格中按 Tab 時，是否將收藏與標題從焦點順序中移除 |

設定畫面的配色可從右上角的圖示切換深色 / 淺色。初始狀態會跟隨作業系統的設定，
切換過一次之後，就會固定使用該配色（「重設設定」後會恢復為跟隨作業系統）。
此配色僅適用於設定畫面，檢視器仍會跟隨 pixiv 本身的設定。

## 注意事項

- **這是非官方的擴充功能。** 本擴充功能是利用 pixiv 平台開發的，
  並非由 pixiv Inc. 製作或發布的應用程式。與該公司沒有任何關係
- **使用風險由您自行承擔。** 對於因使用本擴充功能而產生的損害，作者及 pixiv Inc. 概不負責
- **R-18 作品的顯示依照 pixiv 端的設定。** 擴充功能不會規避年齡限制
- **讚無法取消。** 這是 pixiv 的規格，即使按錯也無法復原
- **評論的發表與刪除，與在 pixiv 本身操作相同。** 每按一次都會直接送到 pixiv。
  刪除後無法復原，因此會經過兩段式確認
- **沒有收集作品的功能。** 既沒有下載功能，也沒有自動化的批次操作。
  只會取得目前開啟的作品及其前後的幾張圖片
- **無限捲動以與 pixiv 本身相同的頁面為單位讀取。** 每次只讀取 1 頁（48 件作品），
  隨著往下捲動才去取得，不會一次大量取得作品
- **可能因 pixiv 的規格變更而無法運作。** pixiv 及相關服務可能在未經通知的情況下
  修訂、變更或停止提供功能及內容
- 直接開啟 `/artworks/{id}` 時，以及在搜尋結果、排行榜、標籤頁面中不會啟動

以上內容遵循 [pixiv Inc. 服務使用條款](https://policies.pixiv.net/) 中的「註冊商標指南 &gt; 關於在應用程式、各類服務等中的使用」。

## 錯誤回報、問題與需求

錯誤回報、使用方式的問題、功能需求，請透過 **[聯絡表單](https://forms.gle/C7AWaUHWmwnoeDV66)** 寄送。
表單是英文的，但用中文填寫也沒有問題。
有使用 GitHub 的話，也可以透過 [Issues](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/issues) 回報。

## 開發

| 指令 | 內容 |
| --- | --- |
| `npm run build` | 產生 Chrome 系用的 `dist/` 與 Firefox 用的 `dist-firefox/` |
| `npm run build:chrome` / `npm run build:firefox` | 只產生其中一個 |
| `npm run watch` | 建置的監看模式 |
| `npm test` | 以 `node --test` 執行測試（1124 tests） |
| `npm run build:icons` | 產生擴充功能圖示的 PNG（產出物已提交） |
| `npm run build:symbols` | 重新產生 UI 圖示的圖形資料（產出物已提交） |
| `npm run build:site-images` | 輸出介紹網站的圖片（WebP 與 OGP 用的 JPEG）（產出物已提交。原始素材的 PNG 不包含在儲存庫中，因此無法在本機執行） |
| `npm run build:screenshots` | 組合 Chrome 線上應用程式商店用的螢幕截圖（作為來源的擷取畫面不包含在儲存庫中，因此無法在本機執行） |
| `npm run pack:crx -- --key <私密金鑰>` | 產生要上傳到商店的已簽署 CRX（用於 Chrome 線上應用程式商店的「經過驗證的 CRX 上傳」。簽署用的私密金鑰只有作者持有） |

版本號的唯一來源是 `package.json` 的 `version`，建置時會寫入 `dist/manifest.json` 與 `dist-firefox/manifest.json`。
支援瀏覽器的最低版本（esbuild 的 target、`minimum_chrome_version`、Firefox 的 `strict_min_version`）的來源是 `scripts/targets.mjs`。

`site/` 是[介紹網站](https://xviewer.neonsdesign.com/zh-tw/)的實體。沒有建置流程。
推送到 `main` 後，`.github/workflows/pages.yml` 只會將 `site/` 發布到 GitHub Pages。
在本機確認時，請執行 `cd site && python -m http.server 8000` 並開啟 `http://localhost:8000/`。
（以 `file://` 開啟時，只有根目錄相對路徑的連結行為會不同）

## 授權

[MIT License](LICENSE)

隨附的第三方素材請參閱 [`NOTICE`](NOTICE)。Apache License 2.0 的全文收錄於 [`LICENSES/`](LICENSES)。
