/* URL parsing and Bilibili player helpers.
 * UMD: browser -> window.MMDMedia, Node -> module.exports.
 * No network, no cover hotlinking, no Bilibili API.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MMDMedia = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const ERROR_TEXT = {
    'invalid-url': '链接格式无效',
    'not-https': '只接受 https 链接',
    credentials: '链接不能包含账号或密码',
    port: '链接不能包含端口',
    'short-link': '不接受 b23.tv 短链，请使用 Bilibili 规范链接',
    query: '不接受跟踪参数；视频只允许 ?p=N',
    hash: '链接不能包含 # 片段',
    'bad-page': '分P参数必须是正整数',
    host: '只接受 Bilibili 或简书链接',
    path: '无法识别的链接路径'
  };

  function cleanHost(host) {
    return String(host || '').toLowerCase().replace(/^www\./, '');
  }

  function isPositiveInt(value) {
    return /^\d+$/.test(String(value)) && Number(value) >= 1;
  }

  function unknown(reason) {
    return { kind: 'unknown', provider: null, reason };
  }

  function parseMedia(raw) {
    let u;
    try {
      u = new URL(String(raw == null ? '' : raw).trim());
    } catch (error) {
      return unknown('invalid-url');
    }

    if (u.protocol !== 'https:') return unknown('not-https');
    if (u.username || u.password) return unknown('credentials');
    if (u.port) return unknown('port');
    if (u.hash) return unknown('hash');

    const host = cleanHost(u.hostname);
    if (host === 'b23.tv') return unknown('short-link');
    const params = Array.from(u.searchParams.keys());
    if (params.some((key) => key !== 'p')) return unknown('query');
    const rawPage = u.searchParams.get('p');
    if (rawPage != null && !isPositiveInt(rawPage)) return unknown('bad-page');
    const page = rawPage == null ? 1 : Number(rawPage);

    const isBilibili = host === 'bilibili.com' || host === 'm.bilibili.com';
    const isJianshu = host === 'jianshu.com';

    if (isBilibili) {
      const video = u.pathname.match(/^\/video\/(BV[0-9A-Za-z]+|av\d+)\/?$/i);
      if (video) {
        const id = video[1];
        const bvid = id.slice(0, 2).toLowerCase() === 'bv' ? id : null;
        const aid = bvid ? null : id.slice(2);
        const canonicalUrl = `https://www.bilibili.com/video/${id}${page > 1 ? `?p=${page}` : ''}`;
        return {
          kind: 'video',
          provider: 'bilibili',
          bvid,
          aid,
          page,
          canonicalUrl,
          key: bvid ? `bilibili:video:bv:${bvid}` : `bilibili:video:av:${aid}`
        };
      }

      const cv = u.pathname.match(/^\/read\/cv(\d+)\/?$/);
      if (cv) {
        const id = cv[1];
        return {
          kind: 'article',
          provider: 'bilibili',
          subtype: 'cv',
          canonicalUrl: `https://www.bilibili.com/read/cv${id}`,
          key: `bilibili:read:cv:${id}`
        };
      }

      const opus = u.pathname.match(/^\/opus\/(\d+)\/?$/);
      if (opus) {
        const id = opus[1];
        return {
          kind: 'article',
          provider: 'bilibili',
          subtype: 'opus',
          canonicalUrl: `https://www.bilibili.com/opus/${id}`,
          key: `bilibili:opus:${id}`
        };
      }

      const list = u.pathname.match(/^\/read\/readlist\/([0-9A-Za-z]+)\/?$/);
      if (list) {
        const id = list[1];
        return {
          kind: 'article',
          provider: 'bilibili',
          subtype: 'readlist',
          canonicalUrl: `https://www.bilibili.com/read/readlist/${id}`,
          key: `bilibili:readlist:${id}`
        };
      }

      return unknown('path');
    }

    if (isJianshu) {
      const post = u.pathname.match(/^\/p\/([0-9A-Za-z]+)\/?$/);
      if (post) {
        const id = post[1];
        return {
          kind: 'article',
          provider: 'jianshu',
          subtype: 'post',
          canonicalUrl: `https://www.jianshu.com/p/${id}`,
          key: `jianshu:post:${id}`
        };
      }
      return unknown('path');
    }

    return unknown('host');
  }

  function playerUrl(info, page) {
    if (!info || info.kind !== 'video') return null;
    const requested = Number(page) || Number(info.page) || 1;
    const safePage = Math.max(1, Math.floor(requested));
    const idPart = info.bvid ? `bvid=${encodeURIComponent(info.bvid)}` : `aid=${encodeURIComponent(info.aid)}`;
    return `https://player.bilibili.com/player.html?${idPart}&page=${safePage}&autoplay=0&danmaku=0&high_quality=1`;
  }

  function validateUrl(raw) {
    const info = parseMedia(raw);
    if (info.kind === 'unknown') {
      return { info, error: ERROR_TEXT[info.reason] || '链接无效' };
    }
    return { info, error: null };
  }

  return {
    ERROR_TEXT,
    parseMedia,
    playerUrl,
    validateUrl
  };
});
