import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('../src/schema.js');
const media = require('../src/media.js');

function expectUnknown(url, reason) {
  const info = media.parseMedia(url);
  assert.equal(info.kind, 'unknown', `${url} should be unknown`);
  assert.equal(info.reason, reason, `${url} reason`);
}

const record = schema.newRecord(602);
assert.deepEqual(Object.keys(record), schema.KEY_ORDER, 'newRecord key order');
assert.equal(record.seq, 602);
assert.equal(record.status, 'pending');
assert.equal(record.confidence, 'low');
assert.equal(record.needsReview, true);
assert.equal(record.reviewCleared, false);
assert.equal(record.readBody, 'false');
assert.equal(record.anchor, 'false');
assert.equal(record.anchorConflict, false);
assert.equal(record.videoPages, '');
assert.equal(record.videoDuration, '');

record.title = '测试条目';
record.url = 'https://www.bilibili.com/video/BV1xx411c7mD';
record.status = 'approved';
record.newL1 = '入门';
record.type = '教程';
const checked = schema.checkTypes(record);
assert.equal(checked.errors.length, 0, checked.errors.join('; '));

const broken = { ...record, readBody: true };
assert.ok(schema.checkTypes(broken).errors.some((message) => message.includes('readBody')), 'readBody boolean rejected');

const custom = { ...record, customField: 'x' };
assert.ok(schema.checkTypes(custom).warnings.some((message) => message.includes('customField')), 'unknown key warns');
assert.equal(schema.checkTypes(custom).errors.length, 0, 'unknown key is not an error');

const dangerous = { ...record };
Object.defineProperty(dangerous, '__proto__', { value: 'x', enumerable: true });
assert.ok(schema.checkTypes(dangerous).errors.some((message) => message.includes('__proto__')), 'dangerous key rejected');

const bv = media.parseMedia('https://www.bilibili.com/video/BV1xx411c7mD');
assert.equal(bv.kind, 'video');
assert.equal(bv.bvid, 'BV1xx411c7mD');
assert.equal(bv.page, 1);
assert.equal(bv.key, 'bilibili:video:bv:BV1xx411c7mD');
assert.equal(bv.canonicalUrl, 'https://www.bilibili.com/video/BV1xx411c7mD');

const multi = media.parseMedia('https://www.bilibili.com/video/BV1xx411c7mD?p=3');
assert.equal(multi.page, 3);
assert.equal(multi.canonicalUrl, 'https://www.bilibili.com/video/BV1xx411c7mD?p=3');

const av = media.parseMedia('https://www.bilibili.com/video/av123');
assert.equal(av.kind, 'video');
assert.equal(av.aid, '123');
assert.equal(av.bvid, null);

const cv = media.parseMedia('https://www.bilibili.com/read/cv123');
assert.equal(cv.kind, 'article');
assert.equal(cv.provider, 'bilibili');
assert.equal(cv.key, 'bilibili:read:cv:123');

assert.equal(media.parseMedia('https://www.bilibili.com/opus/456').kind, 'article');
assert.equal(media.parseMedia('https://www.bilibili.com/read/readlist/rl123').kind, 'article');
assert.equal(media.parseMedia('https://www.jianshu.com/p/abc123').kind, 'article');
assert.equal(media.parseMedia('https://WWW.BILIBILI.COM/video/BV1xx411c7mD/').kind, 'video');
assert.equal(media.parseMedia('https://www.bilibili.com/video/BV1xx411c7mD/').canonicalUrl, 'https://www.bilibili.com/video/BV1xx411c7mD');

expectUnknown('http://www.bilibili.com/video/BV1xx411c7mD', 'not-https');
expectUnknown('https://b23.tv/abc', 'short-link');
expectUnknown('https://example.com/video/BV1xx411c7mD', 'host');
expectUnknown('https://www.bilibili.com/video/BV1xx411c7mD?spm_id_from=333', 'query');
expectUnknown('https://www.bilibili.com/video/BV1xx411c7mD#x', 'hash');
expectUnknown('https://www.bilibili.com/video/BV1xx411c7mD?p=0', 'bad-page');

const player = media.playerUrl(bv, 2);
assert.ok(player.includes('bvid=BV1xx411c7mD'));
assert.ok(player.includes('page=2'));
assert.ok(player.includes('autoplay=0'));
assert.equal(media.playerUrl(cv, 1), null);

console.log('selftest: ok');
