/**
 * 紹介サイトの最小限の動き。配色の切り替えだけを持つ。
 * 言語の切り替えはただのリンクなので JS は関与しない (JS が無くても読める)。
 */
(function () {
	'use strict';

	/** localStorage に配色を覚えるときの鍵。 */
	var STORAGE_KEY = 'xviewer-site-theme';

	/** 明示的に選べる配色。無指定 (null) のときは OS の設定に従う。 */
	var THEMES = { DARK: 'dark', LIGHT: 'light' };

	/**
	 * 保存済みの配色を読む。使えない環境 (プライベートウィンドウ等) では null。
	 * @returns {string|null} 'dark' / 'light' / null
	 */
	function readStored() {
		try {
			var value = window.localStorage.getItem(STORAGE_KEY);
			return value === THEMES.DARK || value === THEMES.LIGHT ? value : null;
		} catch (error) {
			return null;
		}
	}

	/**
	 * 配色を保存する。失敗しても表示は続ける。
	 * @param {string} theme 'dark' または 'light'
	 * @returns {void}
	 */
	function store(theme) {
		try {
			window.localStorage.setItem(STORAGE_KEY, theme);
		} catch (error) {
			// 保存できなくてもその場の切り替えは効く
		}
	}

	/**
	 * OS 側の設定を読む。matchMedia が無い環境ではダーク扱い。
	 * @returns {string} 'dark' または 'light'
	 */
	function systemTheme() {
		if (!window.matchMedia) return THEMES.DARK;
		return window.matchMedia('(prefers-color-scheme: light)').matches ? THEMES.LIGHT : THEMES.DARK;
	}

	/**
	 * 今あてられている配色。属性が無ければ OS の設定を答える。
	 * @returns {string} 'dark' または 'light'
	 */
	function currentTheme() {
		var attribute = document.documentElement.getAttribute('data-theme');
		if (attribute === THEMES.DARK || attribute === THEMES.LIGHT) return attribute;
		return systemTheme();
	}

	/**
	 * 配色をあてる。ボタンの読み上げ文言も合わせて直す。
	 * @param {string} theme 'dark' または 'light'
	 * @param {HTMLElement|null} button 切り替えボタン
	 * @returns {void}
	 */
	function apply(theme, button) {
		document.documentElement.setAttribute('data-theme', theme);
		if (!button) return;
		var toLight = theme === THEMES.DARK;
		button.setAttribute('aria-label', button.getAttribute(toLight ? 'data-label-light' : 'data-label-dark') || '');
	}

	/**
	 * OS の「動きを減らす」設定を、自動再生の可否にまで効かせるか。
	 * true にすると、その設定の人には最初から止めた状態で見せる。
	 * 既定は false。止める手段 (停止ボタン) は常に出しているので WCAG 2.2.2 は満たす。
	 */
	var PAUSE_WHEN_CALM = false;

	/**
	 * 自動再生する動画に停止ボタンを配線する。
	 * 5 秒を超えて自動で動くものには止める手段が要る (WCAG 2.2.2)。
	 * @returns {void}
	 */
	function wireVideos() {
		var calm = PAUSE_WHEN_CALM
			&& Boolean(window.matchMedia) && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		var figures = document.querySelectorAll('figure.has-video');
		for (var i = 0; i < figures.length; i += 1) {
			wireOne(figures[i], calm);
		}
	}

	/**
	 * 動画 1 つ分の配線。
	 * @param {HTMLElement} figure video と .video-toggle を含む入れ物
	 * @param {boolean} calm 最初から止めておくか
	 * @returns {void}
	 */
	function wireOne(figure, calm) {
		var video = figure.querySelector('video');
		var button = figure.querySelector('.video-toggle');
		if (!video || !button) return;

		/**
		 * ボタンの見た目と読み上げ文言を今の状態に合わせる。
		 * @returns {void}
		 */
		function sync() {
			var paused = video.paused;
			button.setAttribute('data-state', paused ? 'paused' : 'playing');
			button.setAttribute('aria-label', button.getAttribute(paused ? 'data-label-play' : 'data-label-pause') || '');
		}

		if (calm) {
			video.removeAttribute('autoplay');
			try {
				video.pause();
			} catch (error) {
				// 再生前に呼ばれても問題にしない
			}
		}

		button.addEventListener('click', function () {
			if (video.paused) {
				// 自動再生を拒まれることがある。失敗しても表示は保つ
				var played = video.play();
				if (played && typeof played.catch === 'function') played.catch(function () { sync(); });
			} else {
				video.pause();
			}
		});
		video.addEventListener('play', sync);
		video.addEventListener('pause', sync);
		sync();
	}

	document.addEventListener('DOMContentLoaded', function () {
		wireVideos();
		var button = document.querySelector('.theme-toggle');
		var stored = readStored();
		// head の先読みスクリプトが既に属性を付けている。ここでは文言だけ合わせる
		apply(stored || currentTheme(), button);
		if (!button) return;

		button.addEventListener('click', function () {
			var next = currentTheme() === THEMES.DARK ? THEMES.LIGHT : THEMES.DARK;
			apply(next, button);
			store(next);
		});
	});
})();
