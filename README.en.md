<div align="center">

<img src="src/icons/icon-128.png" width="96" alt="The XViewer for Pixiv icon" />

# XViewer for Pixiv

**A browser extension that adds an X.com-style image viewer to pixiv user pages, the home page, and search results**

[![version](https://img.shields.io/github/package-json/v/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](package.json)
[![license](https://img.shields.io/github/license/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](LICENSE)
![manifest](https://img.shields.io/badge/manifest-v3-0096fa)
![tests](https://img.shields.io/badge/tests-passing-0096fa)

**[Website](https://xviewer.neonsdesign.com/en/)** ・
[Privacy policy](https://xviewer.neonsdesign.com/en/privacy.html) ・
[日本語](README.md) ・
[한국어](README.ko.md) ・
[简体中文](README.zh-CN.md) ・
[繁體中文](README.zh-TW.md)

</div>

---

> [!NOTE]
> This document is a translation of [README.md](README.md) for reference.
> The extension itself is available in English. (See [Languages](#languages))

---

> [!IMPORTANT]
> **This is an unofficial extension built on top of the pixiv platform.**
> **It is not an application created or distributed by pixiv Inc.**
> It is not affiliated with, endorsed by, or supported by pixiv Inc. in any way.
> You are responsible for anything that results from using it.

---

## What this is

Click an artwork on a pixiv user page, the home page or search results and **a modal opens right there, without navigating away.**
Paging through multi-image works, ugoira playback, reading the caption and comments, and liking,
bookmarking, following and posting comments all happen inside the modal. Close it and you are back
on the grid, at the scroll position you left.

![An artwork open in the viewer](docs/images/viewer.jpg)

## Features

### Viewer

| | |
| --- | --- |
| **Opens in place** | The viewer takes over the grid click and renders without navigating. Besides the artwork list on user pages, artworks on the home page and in search results (tag pages and the search screen) open this way too. The URL still changes to `/artworks/{id}`, so reloading and sharing both work |
| **Multi-image works** | `←` `→` and the on-screen arrows page through the work. With the setting on, clicking the left or right edge of the screen does too. Neighbouring images are prefetched, so switching is immediate |
| **Work to work** | `↑` `↓` move to the previous or next work in the grid. With the setting on, clicking the top or bottom edge of the screen does too. On user pages, reaching the end loads the next page for you, and on the illustration and manga tabs only works of that kind are visited. On the home page and in search results, you move within the section of the work you clicked |
| **Ugoira** | The zip is decoded into frames and played in the viewer, with pause and resume |
| **Actual size** | Click the image to open it at its original resolution, filling the screen. (The same way pixiv's own artwork page looks) Page through with the screen edges or `←` `→` (off by default) |

### Sidebar

The caption, tags, post date, counters and comments sit beside the image in a single column.

![Comments in the sidebar](docs/images/sidebar-comments.jpg)

| | |
| --- | --- |
| **Artwork details** | Caption, tags, post date, like / bookmark / view counts, and the author's avatar and follow button |
| **Reading comments** | Stamps and emoji are rendered as images. Replies expand in place and more comments load on demand. If a request fails, "retry" picks up where it stopped |
| **Writing comments** | Comments and replies can be posted from inside the modal. Emoji and stamps come from a panel. Your own comments can be deleted behind a confirmation |
| **Actions** | Like, bookmark (Shift + click to keep it private), follow and share. (X / Facebook / Pawoo / copy link) A like you already gave in another tab is never counted twice, and if your session has expired you are told so. None of the three are shown on your own works (the same as pixiv itself) |

![The comment box and the emoji panel](docs/images/comment-form.jpg)

### User pages

| | |
| --- | --- |
| **Infinite scroll** | The paginator (1 2 3 …) on illustration and manga listings can be replaced with continuous loading. The `?p=` in the URL follows whatever is on screen, so a reload brings you back to roughly the same place (off by default) |
| **Hide the pickup section** | Hides the "pickup" block on a profile home so the listing is the first thing you see (off by default) |
| **Tidier tab order** | The bookmark button and the title can be taken out of the focus order in artwork lists (user pages, the home page and search results). Artist links stay (pixiv's own order by default) |

### Elsewhere

| | |
| --- | --- |
| **Theme** | The viewer follows pixiv's own dark / light setting. The settings popup can be switched by hand |
| **Fine-grained settings** | The Settings tab (viewer, images, user pages, controls) and the Advanced tab (viewer, controls, comments) let you tune where the viewer is used, image quality, prefetch, how the sidebar appears and how wide it is, background darkness, infinite scroll and more |
| **Accessibility** | A focus trap, `role="dialog"`, and a tidier tab order on the grid. Opening and closing works entirely from the keyboard |

## Requirements

Any Chromium-based browser with Manifest V3 support. (Chrome / Brave / Edge and so on) **Chrome 120 or newer** is required.
(It uses `"world": "MAIN"` content scripts, `color-mix()` and CSS nesting)
Edge can also install it from [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl).
Firefox (desktop, Firefox 140 or newer) can install it from [Firefox Add-ons](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/). Safari is not supported.

## Languages

The extension follows the display language you have set on pixiv.
(The settings popup follows the language of the last pixiv page you opened)

| Language | Status |
| --- | --- |
| Japanese | Supported |
| English | Supported |
| Korean | Supported |
| Chinese (Simplified) | Supported |
| Chinese (Traditional) | Supported |
| Thai | On request |
| Malay | On request |

The table covers the seven display languages pixiv offers. If pixiv is shown in a language marked "On request", the extension falls back to English.
If you would like another language, please ask through "Bugs, questions and requests" below.

## Installing

Install it from the **[Chrome Web Store](https://chromewebstore.google.com/detail/xviewer-for-pixiv/hbnpmpiipnocflhikmpamobpodadfbpd)**. Brave, Edge and other Chromium browsers can install it from the same store page.
Edge can also install it from **[Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/pmkplomaebdlciailfpopkocnfpcdmgl)**.
Firefox can install it from **[Firefox Add-ons](https://addons.mozilla.org/firefox/addon/xviewer-for-pixiv/)**.

To install it without the store, load the extension in one of the two ways below.

### From the release zip

1. Download the latest `XViewer.for.Pixiv_x.y.z.zip` from [Releases](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/releases) and extract it
2. Open `chrome://extensions/`
3. Turn on **Developer mode** in the top right
4. Press **Load unpacked**
5. Select the extracted folder

### Building from source

```bash
git clone https://github.com/NEONS-DESIGN/XViewer-for-Pixiv.git
cd XViewer-for-Pixiv
npm install
npm run build
```

1. Open `chrome://extensions/`
2. Turn on **Developer mode** in the top right
3. Press **Load unpacked**
4. Select the generated **`dist/`** folder

Select `dist/`, not `src/`. Only the build output runs.

## Using it

Open a pixiv **user page** (`https://www.pixiv.net/users/{id}` and its tabs), the **home page** (Home / Illustrations / Manga) or **search results** (tag pages and the search screen), and click an artwork.

### Keyboard

| Key | Action |
| --- | --- |
| `←` `→` | Page through the current work (the same at actual size) |
| `↑` `↓` | Previous or next work |
| `Ctrl` + `Enter` | Send from the comment box. (`Cmd` + `Enter` on Mac) `Enter` is a line break |
| `Esc` | Closes the frontmost thing first. (emoji panel → actual size or the share menu → the viewer) It will not close the viewer while a draft is unsent |
| `Tab` | Move focus inside the modal (it never leaves) |

While you are writing a comment, `←` `→` `↑` `↓` move the caret. (The work stays put)

### Settings

Open the popup from the toolbar icon. It has a Settings tab and an Advanced tab, and the settings below
are grouped so you can tune each part to suit you. Settings marked `↳` belong to the one above them.
A setting cannot be changed while the setting it depends on is off. (Everything to do with the viewer while
"Use the viewer" is off, the sidebar widths and the number of comments while "Show the sidebar" is off, the edge
click area width while "Click the edges to navigate" is Off, and the actual-size click area width while "Click to
view at actual size" is off) The Licenses tab carries the disclaimer and the notices for the bundled third-party assets.

**Settings tab**

| Group | Setting | Default | Effect |
| --- | --- | --- | --- |
| Viewer | Use the viewer | On | Turn it off and pixiv behaves exactly as it did before. Hide the Pickup section, Infinite scroll and Tab movement in the grid keep working even when it is off |
| Viewer | ↳ Use on user pages | On | Shows the viewer when you open an artwork from a user page's artwork list |
| Viewer | ↳ Use on the home page | On | Shows the viewer for artworks on pixiv's home (Home / Illustrations / Manga tabs) |
| Viewer | ↳ Use on search results | On | Shows the viewer when you open an artwork from search results (tag pages and the search screen) |
| Viewer | Show the sidebar | On | Puts the caption, tags, like count and comments beside the image. When off, a link to the artwork page appears next to the close button. On narrow screens, open it with the button at the top right |
| Viewer | ↳ Sidebar scrolling | Scroll the whole sidebar | Scroll caption and comments as one, or pin the caption and scroll only the comments |
| Images | Image resolution | Standard (1200px long edge) | Original is sharper but heavier to load |
| Images | Prefetch | 1 image each way | How many neighbouring pages to load ahead of time: Off, 1 or 3 images each way, or Custom, which lets you choose 1 to 20 each way (at 10 or more, a note warns that it uses a lot of memory) |
| Images | Also prefetch the adjacent artwork | Off | After an artwork finishes showing, prefetches just one artwork `↑` `↓` may move to next. Moving is faster, but data is used even if you close without moving |
| Images | Click to view at actual size | Off | Clicking the image opens it at actual size, filling the screen. It loads the original regardless of the resolution setting above |
| User pages | Hide the Pickup section | Off | Hides the "Pickup" section on a profile home |
| User pages | Infinite scroll | Off | Load when you reach the bottom, or always keep one page ahead |
| Controls | Click the background to close | On | Whether clicking outside the image closes the viewer |
| Controls | Click the edges to navigate | Off | The left and right edges of the screen turn pages, the top and bottom edges switch artworks. Choose left/right only, top/bottom only, or both. Edges you cannot move past show a not-allowed cursor, so they are easy to tell from the empty area that closes the viewer |
| Controls | Tab movement in the grid | Do not skip | Whether Tab skips the bookmark button and the title in artwork lists (user pages, the home page and search results). Artist links are not skipped |

**Advanced tab**

| Group | Setting | Default | Effect |
| --- | --- | --- | --- |
| Viewer | Sidebar width | 384px | Width of the sidebar shown on the right when the window is wide. Choose 320, 384, 448 or 512px |
| Viewer | Pulled-out sidebar width | 60% | Maximum width, relative to the window, of the sidebar you pull out when the window is narrow (900px wide or less). Choose 50, 60, 70 or 80% |
| Viewer | Background darkness | Match the theme | How dark the black layer behind the image is: match the theme (92% in dark mode, 88% in light mode) or, with Custom, choose from 0% to 100% in 10% steps. Lower values let the page behind show through |
| Controls | Edge click area width | 25% | Width of the edges used for edge-click navigation, relative to the image area. With Custom, choose the left/right and top/bottom widths separately, from 5% to 35% in 5% steps |
| Controls | Actual-size click area width | 25% | Width of the left and right edges used to turn pages in actual-size view. With Custom, choose from 5% to 35% in 5% steps |
| Comments | Comments loaded at once | 30 comments | Number of comments loaded when an artwork opens and when you press "Show more". Choose 10, 20, 30 or 50. Applies from the next artwork you open |

The settings popup can be switched between dark and light from the icon in its top right. It follows
the OS setting until you switch it, and stays on your choice from then on. ("Reset settings" returns
it to following the OS) This applies to the settings popup only; the viewer keeps following pixiv's
own setting.

## Things to know

- **This is an unofficial extension.** It was built on top of the pixiv platform and is not created
  or distributed by pixiv Inc. It is not affiliated with pixiv Inc. in any way
- **Use it at your own risk.** Neither the author nor pixiv Inc. is liable for any damage arising from its use
- **Age-restricted works follow your pixiv account settings.** The extension never works around them
- **A like cannot be undone.** That is how pixiv works, so a misclick cannot be taken back
- **Posting and deleting comments behaves exactly as it does on pixiv itself.** What you press is sent
  to pixiv as-is. A deletion cannot be undone, so it sits behind a two-step confirmation
- **There is nothing here for collecting works.** No downloads, no batch automation. Only the work you
  have open and the few around it are fetched
- **Infinite scroll reads in the same page units as pixiv itself.** One page (48 items) at a time as
  you move down, never fetching works in bulk
- **Changes on pixiv's side may break it at any time.** pixiv and its related services may revise,
  change or discontinue features and content without notice
- It does not start on `/artworks/{id}` opened directly, nor on rankings or the list of works from users you follow

These follow the "Guidelines for registered trademarks &gt; Use in applications and services" section of
the [pixiv Inc. Terms of Service](https://policies.pixiv.net/).

## Bugs, questions and requests

Send bug reports, questions and feature requests through the **[contact form](https://forms.gle/C7AWaUHWmwnoeDV66)**.
If you prefer GitHub, [Issues](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/issues) work too.

## Development

| Command | What it does |
| --- | --- |
| `npm run build` | Builds `dist/` for Chromium browsers and `dist-firefox/` for Firefox |
| `npm run build:chrome` / `npm run build:firefox` | Builds only one of them |
| `npm run watch` | Build in watch mode |
| `npm test` | Runs the tests with `node --test` |
| `npm run build:icons` | Regenerates the extension icon PNGs (the output is committed) |
| `npm run build:symbols` | Regenerates the UI icon shape data (the output is committed) |
| `npm run build:site-images` | Exports the website images (WebP, plus JPEG for OGP) (the output is committed. The source PNGs are not in the repository, so it will not run on a fresh clone) |
| `npm run build:screenshots` | Composes the Chrome Web Store screenshots (the source captures are not in the repository, so it will not run on a fresh clone) |
| `npm run pack:crx -- --key <private key>` | Builds the signed CRX uploaded to the store (for the Chrome Web Store's verified CRX uploads. Only the author holds the signing key) |

The single source of the version is `version` in `package.json`; the build writes it into
`dist/manifest.json` and `dist-firefox/manifest.json`. The single source of the minimum browser
versions (esbuild's targets, `minimum_chrome_version`, and Firefox's `strict_min_version`) is
`scripts/targets.mjs`.

`site/` is the [website](https://xviewer.neonsdesign.com/en/) itself. There is no build step.
Pushing to `main` makes `.github/workflows/pages.yml` publish `site/` alone to GitHub Pages.
To check it locally, run `cd site && python -m http.server 8000` and open `http://localhost:8000/`.
(Opening it over `file://` changes the behaviour of root-relative links only)

## License

[MIT License](LICENSE)

See [`NOTICE`](NOTICE) for the bundled third-party assets. The full text of the Apache License 2.0 is included in [`LICENSES/`](LICENSES).
