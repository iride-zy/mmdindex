/* MMD record schema shared by the page, editor, and Node validation.
 * UMD: browser -> window.MMDSchema, Node -> module.exports.
 * The 31 keys below are the current known contract. Extra keys are allowed
 * (warned, not dropped) so the data can grow without breaking old pages.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.MMDSchema = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const KEY_ORDER = [
    'seq',
    'title',
    'author',
    'platform',
    'url',
    'origL1',
    'origL2',
    'newL1',
    'newL2',
    'newL3',
    'status',
    'type',
    'confidence',
    'readBody',
    'depth',
    'evidenceSource',
    'evidence',
    'mainRender',
    'rendererTags',
    'otherTags',
    'reason',
    'boundary',
    'candidate',
    'anchor',
    'anchorConflict',
    'userNote',
    'analysisNote',
    'videoPages',
    'videoDuration',
    'reviewCleared',
    'needsReview'
  ];

  const CAT_ORDER = ['入门', '渲染', 'MME', '模型', '动画', '静画', '小工具', '其他'];

  const GROUPS = [
    { id: 'identity', label: '基础' },
    { id: 'taxonomy', label: '分类' },
    { id: 'render', label: '渲染与标签' },
    { id: 'review', label: '审核与上下文' },
    { id: 'video', label: '视频元数据（可选）' }
  ];

  const FIELDS = [
    { key: 'seq', label: 'seq', group: 'identity', type: 'number', required: true, hint: '正整数；新条目默认当前最大值 + 1' },
    { key: 'title', label: '标题', group: 'identity', type: 'text', required: true },
    { key: 'author', label: '作者', group: 'identity', type: 'text' },
    { key: 'platform', label: '平台', group: 'identity', type: 'datalist', options: ['B站', '简书'] },
    { key: 'url', label: 'URL', group: 'identity', type: 'text', required: true, hint: '只接受 https；视频由链接自动识别' },
    { key: 'type', label: '类型', group: 'identity', type: 'datalist', options: ['教程', '案例', '工具', '文章'] },

    { key: 'origL1', label: '原一级分类', group: 'taxonomy', type: 'text' },
    { key: 'origL2', label: '原二级分类', group: 'taxonomy', type: 'text' },
    { key: 'newL1', label: '一级分类', group: 'taxonomy', type: 'datalist', options: CAT_ORDER },
    { key: 'newL2', label: '二级分类', group: 'taxonomy', type: 'text' },
    { key: 'newL3', label: '三级分类', group: 'taxonomy', type: 'text' },

    { key: 'mainRender', label: '主渲染器', group: 'render', type: 'text' },
    { key: 'rendererTags', label: '渲染器标签', group: 'render', type: 'text' },
    { key: 'otherTags', label: '其他标签', group: 'render', type: 'text', hint: '原始文本；不做标签状态' },

    { key: 'status', label: '状态', group: 'review', type: 'select', options: ['approved', 'pending', 'rejected'] },
    { key: 'confidence', label: '置信度', group: 'review', type: 'select', options: ['high', 'medium', 'low'] },
    { key: 'readBody', label: '已读正文', group: 'review', type: 'string-bool', options: ['false', 'true'] },
    { key: 'depth', label: '读取深度', group: 'review', type: 'text' },
    { key: 'evidenceSource', label: '证据来源', group: 'review', type: 'text' },
    { key: 'evidence', label: '证据摘录', group: 'review', type: 'textarea', rows: 4 },
    { key: 'reason', label: '收录理由', group: 'review', type: 'textarea', rows: 5 },
    { key: 'boundary', label: '边界', group: 'review', type: 'textarea', rows: 3 },
    { key: 'candidate', label: '候选说明', group: 'review', type: 'text' },
    { key: 'anchor', label: '锚点', group: 'review', type: 'string-bool', options: ['false', 'true'] },
    { key: 'anchorConflict', label: '锚点冲突', group: 'review', type: 'checkbox' },
    { key: 'userNote', label: '用户备注', group: 'review', type: 'textarea', rows: 3 },
    { key: 'analysisNote', label: '分析备注', group: 'review', type: 'textarea', rows: 4 },
    { key: 'reviewCleared', label: '已复核', group: 'review', type: 'checkbox' },
    { key: 'needsReview', label: '待复核', group: 'review', type: 'checkbox' },

    { key: 'videoPages', label: '分P数', group: 'video', type: 'text', hint: '可选；播放由 URL 识别' },
    { key: 'videoDuration', label: '总时长（秒）', group: 'video', type: 'text', hint: '可选；仅展示' }
  ];

  const FIELD_BY_KEY = Object.create(null);
  for (const field of FIELDS) FIELD_BY_KEY[field.key] = field;

  const BOOL_KEYS = ['anchorConflict', 'reviewCleared', 'needsReview'];
  const STRING_BOOL_KEYS = ['readBody', 'anchor'];
  const STATUS_VALUES = ['approved', 'pending', 'rejected'];
  const CONFIDENCE_VALUES = ['high', 'medium', 'low'];
  const DANGEROUS_KEYS = ['__proto__', 'constructor', 'prototype'];

  function isPlainObject(value) {
    return !!value && typeof value === 'object' && !Array.isArray(value);
  }

  function emptyRecord(seq) {
    return {
      seq: Number(seq) || 0,
      title: '',
      author: '',
      platform: 'B站',
      url: '',
      origL1: '',
      origL2: '',
      newL1: '',
      newL2: '',
      newL3: '',
      status: 'pending',
      type: '',
      confidence: 'low',
      readBody: 'false',
      depth: '',
      evidenceSource: '',
      evidence: '',
      mainRender: '',
      rendererTags: '',
      otherTags: '',
      reason: '',
      boundary: '',
      candidate: '',
      anchor: 'false',
      anchorConflict: false,
      userNote: '',
      analysisNote: '',
      videoPages: '',
      videoDuration: '',
      reviewCleared: false,
      needsReview: true
    };
  }

  function newRecord(seq) {
    return emptyRecord(seq);
  }

  function checkTypes(record) {
    const errors = [];
    const warnings = [];
    if (!isPlainObject(record)) {
      return { errors: ['record 必须是对象'], warnings };
    }

    for (const key of KEY_ORDER) {
      if (!Object.prototype.hasOwnProperty.call(record, key)) {
        errors.push(`${key}: 缺少字段`);
        continue;
      }
      const value = record[key];
      if (key === 'seq') {
        if (!Number.isInteger(value) || value < 1) errors.push('seq: 必须是正整数');
      } else if (BOOL_KEYS.includes(key)) {
        if (typeof value !== 'boolean') errors.push(`${key}: 必须是 boolean`);
      } else if (STRING_BOOL_KEYS.includes(key)) {
        if (value !== 'true' && value !== 'false') errors.push(`${key}: 必须是字符串 "true" 或 "false"`);
      } else if (key === 'status') {
        if (!STATUS_VALUES.includes(value)) errors.push('status: 必须是 approved/pending/rejected');
      } else if (key === 'confidence') {
        if (!CONFIDENCE_VALUES.includes(value)) errors.push('confidence: 必须是 high/medium/low');
      } else if (key === 'videoPages' || key === 'videoDuration') {
        if (typeof value !== 'string') errors.push(`${key}: 必须是字符串`);
        else if (value !== '' && !/^\d+$/.test(value)) errors.push(`${key}: 只能为空或数字字符串`);
        else if (key === 'videoPages' && value !== '' && Number(value) < 1) errors.push('videoPages: 必须 >= 1');
      } else if (typeof value !== 'string') {
        errors.push(`${key}: 必须是字符串`);
      }
    }

    if (typeof record.title === 'string' && !record.title.trim()) errors.push('title: 不能为空');
    if (typeof record.url === 'string' && !record.url.trim()) errors.push('url: 不能为空');

    for (const key of Object.keys(record)) {
      if (KEY_ORDER.includes(key)) continue;
      if (DANGEROUS_KEYS.includes(key)) {
        errors.push(`${key}: 不允许的自定义字段名`);
      } else {
        warnings.push(`${key}: 未在 schema 中声明，将作为自定义字段保留`);
      }
    }

    if (typeof record.newL1 === 'string' && record.newL1 && !CAT_ORDER.includes(record.newL1)) {
      warnings.push(`newL1: "${record.newL1}" 不在 CAT_ORDER，页面会归到「其他」`);
    }

    return { errors, warnings };
  }

  return {
    KEY_ORDER,
    CAT_ORDER,
    GROUPS,
    FIELDS,
    FIELD_BY_KEY,
    BOOL_KEYS,
    STRING_BOOL_KEYS,
    STATUS_VALUES,
    CONFIDENCE_VALUES,
    DANGEROUS_KEYS,
    isPlainObject,
    newRecord,
    checkTypes
  };
});
