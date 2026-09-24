import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignImageSrc, setImageSrcAttribute } from '../../src/common/image-source.js';

/**
 * setAttribute を記録する偽の画像要素を作る。
 * @returns {{src: string, attributes: Map<string, string>, setAttribute: (name: string, value: string) => void}}
 */
function fakeImage() {
	const attributes = new Map();
	return {
		src: '',
		attributes,
		setAttribute(name, value) {
			attributes.set(name, value);
		},
	};
}

test('wrappedJSObject が無い環境 (Chrome) では要素そのものの src に入れる', () => {
	const image = fakeImage();
	assignImageSrc(image, 'https://i.pximg.net/a.jpg');
	assert.equal(image.src, 'https://i.pximg.net/a.jpg');
});

test('wrappedJSObject が無い環境 (Chrome) では要素そのものの src 属性に入れる', () => {
	const image = fakeImage();
	setImageSrcAttribute(image, 'https://i.pximg.net/a.jpg');
	assert.equal(image.attributes.get('src'), 'https://i.pximg.net/a.jpg');
});

test('空文字も入れられる (読み込みを止めるのに使う)', () => {
	const image = fakeImage();
	image.src = 'https://i.pximg.net/a.jpg';
	assignImageSrc(image, '');
	assert.equal(image.src, '');
});

test('wrappedJSObject がある環境 (Firefox) ではページ側の要素へ入れる', () => {
	// ページ側が入れたのと同じ扱いにして、content script の資源として Referer を落とされないようにする
	const pageImage = fakeImage();
	const image = { ...fakeImage(), wrappedJSObject: pageImage };
	assignImageSrc(image, 'https://i.pximg.net/a.jpg');
	setImageSrcAttribute(image, 'https://i.pximg.net/b.jpg');
	assert.equal(pageImage.src, 'https://i.pximg.net/a.jpg');
	assert.equal(pageImage.attributes.get('src'), 'https://i.pximg.net/b.jpg');
	assert.equal(image.src, '');
	assert.equal(image.attributes.size, 0);
});
