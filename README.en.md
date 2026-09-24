<div align="center">

<img src="src/icons/icon-128.png" width="96" alt="The XViewer for Pixiv icon" />

# XViewer for Pixiv

**A Chrome extension that adds an X.com-style image viewer to pixiv user pages**

[![version](https://img.shields.io/github/package-json/v/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](package.json)
[![license](https://img.shields.io/github/license/NEONS-DESIGN/XViewer-for-Pixiv?color=0096fa)](LICENSE)
![manifest](https://img.shields.io/badge/manifest-v3-0096fa)
![tests](https://img.shields.io/badge/tests-1049%20passing-0096fa)

**[Website](https://xviewer.neonsdesign.com/en/)** ・
[Privacy policy](https://xviewer.neonsdesign.com/en/privacy.html) ・
[日本語](README.md)

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

Click an artwork on a pixiv user page and **a modal opens right there, without navigating away.**
Paging through multi-image works, ugoira playback, reading the caption and comments, and liking,
bookmarking, following and posting comments all happen inside the modal. Close it and you are back
on the grid, at the scroll position you left.

![An artwork open in the viewer](docs/images/viewer.jpg)

## Features

### Viewer

| | |
| --- | --- |
| **Opens in place** | The viewer takes over the grid click and renders without navigating. The URL still changes to `/artworks/{id}`, so reloading and sharing both work |
| **Multi-image works** | `←` `→` and the on-screen arrows page through the work. Neighbouring images are prefetched, so switching is immediate |
| **Work to work** | `↑` `↓` move to the previous or next work in the grid. Reach the end and the next page is loaded for you. On the illustration and manga tabs, only works of that kind are visited |
| **Ugoira** | The zip is decoded into frames and played in the viewer, with pause and resume |
| **Full size** | Click the image to open it at its original resolution, filling the screen. (The same way pixiv's own artwork page looks) Page through with the screen edges or `←` `→` (off by default) |

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
| **Tidier tab order** | The bookmark button and the title on grid cards can be taken out of the focus order (pixiv's own order by default) |

### Elsewhere

| | |
| --- | --- |
| **Theme** | The viewer follows pixiv's own dark / light setting. The settings popup can be switched by hand |
| **Fine-grained settings** | Viewer, image, user page and interaction settings let you tune image quality, prefetch, how the sidebar appears, infinite scroll and more |
| **Accessibility** | A focus trap, `role="dialog"`, and a tidier tab order on the grid. Opening and closing works entirely from the keyboard |

## Requirements

Any Chromium-based browser with Manifest V3 support. (Chrome / Brave / Edge and so on) **Chrome 120 or newer** is required.
(It uses `"world": "MAIN"` content scripts, `color-mix()` and CSS nesting)
Firefox and Safari are not supported.

## Languages

The extension follows the display language you have set on pixiv.
(The settings popup follows the language of the last pixiv page you opened)

| Language | Status |
| --- | --- |
| Japanese | Supported |
| English | Supported |
| Korean | On request |
| Chinese (Simplified) | On request |
| Chinese (Traditional) | On request |
| Thai | On request |
| Malay | On request |

The table covers the seven display languages pixiv offers. If pixiv is shown in a language marked "On request", the extension falls back to English.
If you would like another language, please ask through "Bugs, questions and requests" below.

## Installing

The Chrome Web Store listing is currently under review. Until it is published, load the extension in one of the two ways below.

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

Open a pixiv **user page** (`https://www.pixiv.net/users/{id}` and its tabs) and click an artwork.

### Keyboard

| Key | Action |
| --- | --- |
| `←` `→` | Page through the current work (the same at full size) |
| `↑` `↓` | Previous or next work |
| `Ctrl` + `Enter` | Send from the comment box. (`Cmd` + `Enter` on Mac) `Enter` is a line break |
| `Esc` | Closes the frontmost thing first. (emoji panel → full size or the share menu → the viewer) It will not close the viewer while a draft is unsent |
| `Tab` | Move focus inside the modal (it never leaves) |

While you are writing a comment, `←` `→` `↑` `↓` move the caret. (The work stays put)

### Settings

Open the popup from the toolbar icon. The settings below are grouped into viewer, image, user page
and interaction, so you can tune each part to suit you. The "license" tab carries the disclaimer and the notices for the
bundled third-party assets.

| Group | Setting | Default | Effect |
| --- | --- | --- | --- |
| Viewer | Use the viewer | On | Turn it off and pixiv behaves exactly as it did before |
| Viewer | Show the sidebar | On | Puts the caption, tags, like count and comments beside the image |
| Viewer | Sidebar scrolling | Scroll the whole sidebar | Scroll caption and comments as one, or pin the caption and scroll only the comments |
| Image | Resolution | Regular (1200px on the long edge) | Original is sharper but slower to load |
| Image | Prefetch | 1 each way | How many neighbouring pages to load ahead of time (none / 1 each way / 3 each way) |
| Image | Click to view full size | Off | Clicking the image opens it at its original resolution, filling the screen. It loads the original regardless of the resolution setting above |
| User page | Hide the pickup section | Off | Hides the "pickup" block on a profile home |
| User page | Infinite scroll | Off | Load when you reach the bottom, or always keep one page ahead |
| Interaction | Close on backdrop click | On | Whether clicking outside the image closes the viewer |
| Interaction | Grid tab order | Keep all stops | Whether Tab skips the bookmark button and the title on grid cards |

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
- It does not start on `/artworks/{id}` opened directly, nor on search results, rankings or tag pages

These follow the "Guidelines for registered trademarks &gt; Use in applications and services" section of
the [pixiv Inc. Terms of Service](https://policies.pixiv.net/).

## Bugs, questions and requests

Send bug reports, questions and feature requests through the **[contact form](https://forms.gle/C7AWaUHWmwnoeDV66)**.
If you prefer GitHub, [Issues](https://github.com/NEONS-DESIGN/XViewer-for-Pixiv/issues) work too.

## Development

| Command | What it does |
| --- | --- |
| `npm run build` | Builds `dist/` |
| `npm run watch` | Build in watch mode |
| `npm test` | Runs the tests with `node --test` (1049 tests) |
| `npm run build:icons` | Regenerates the extension icon PNGs (the output is committed) |
| `npm run build:symbols` | Regenerates the UI icon shape data (the output is committed) |
| `npm run build:site-images` | Exports the website images (WebP, plus JPEG for OGP) (the output is committed. The source PNGs are not in the repository, so it will not run on a fresh clone) |

The single source of the version is `version` in `package.json`; the build writes it into
`dist/manifest.json`. The single source of the minimum Chrome version (esbuild's target and
`minimum_chrome_version`) is `scripts/targets.mjs`.

`site/` is the [website](https://xviewer.neonsdesign.com/en/) itself. There is no build step.
Pushing to `main` makes `.github/workflows/pages.yml` publish `site/` alone to GitHub Pages.
To check it locally, run `cd site && python -m http.server 8000` and open `http://localhost:8000/`.
(Opening it over `file://` changes the behaviour of root-relative links only)

## License

[MIT License](LICENSE)

See [`NOTICE`](NOTICE) for the bundled third-party assets. The full text of the Apache License 2.0 is included in [`LICENSES/`](LICENSES).
