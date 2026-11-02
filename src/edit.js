(() => {
  'use strict';

  const payload = window.MMD_DATA;
  const schema = window.MMDSchema;
  const media = window.MMDMedia;
  const $ = (selector, root = document) => root.querySelector(selector);

  const listEl = $('#recordList');
  const searchEl = $('#search');
  const newBtn = $('#newBtn');
  const editorTitle = $('#editorTitle');
  const editorMeta = $('#editorMeta');
  const dirtyBadge = $('#dirtyBadge');
  const tabForm = $('#tabForm');
  const tabJson = $('#tabJson');
  const formPane = $('#formPane');
  const recordForm = $('#recordForm');
  const jsonPane = $('#jsonPane');
  const jsonEditor = $('#jsonEditor');
  const applyJsonBtn = $('#applyJson');
  const previewBtn = $('#previewBtn');
  const copyBtn = $('#copyBtn');
  const downloadBtn = $('#downloadBtn');
  const statusEl = $('#status');
  const errorsEl = $('#errors');
  const warningsEl = $('#warnings');
  const previewPane = $('#previewPane');
  const closePreviewBtn = $('#closePreview');
  const previewHint = $('#previewHint');
  const previewJson = $('#previewJson');
  const previewCopy = $('#previewCopy');
  const previewDownload = $('#previewDownload');

  if (!payload || payload.schemaVersion !== 1 || !Array.isArray(payload.records)
      || !schema || !media) {
    editorTitle.textContent = '数据加载失败';
    editorMeta.textContent = '请刷新页面。';
    return;
  }

  const RECORDS = payload.records;
  const KNOWN = new Set(schema.KEY_ORDER);
  const RECORD_URL_KEYS = RECORDS.map((record) => {
    if (!record || typeof record.url !== 'string') return '';
    const info = media.parseMedia(record.url);
    return info.kind === 'unknown' ? '' : info.key;
  });

  let mode = 'none';
  let currentIndex = -1;
  let originalSeq = null;
  let draft = null;
  let baseSnapshot = '';
  let dirty = false;
  let jsonDirty = false;
  let customMeta = Object.create(null);
  let lastValidation = { errors: [], warnings: [] };
  let statusTimer = 0;
  let urlInput = null;
  let urlStatus = null;
  let canonicalBtn = null;

  const el = (tag, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    return node;
  };

  const clone = (value) => JSON.parse(JSON.stringify(value));
  const isKnown = (key) => KNOWN.has(key);

  function showStatus(text, isError = false, persist = false) {
    statusEl.textContent = text;
    statusEl.hidden = false;
    statusEl.classList.toggle('err', isError);
    window.clearTimeout(statusTimer);
    if (!persist) {
      statusTimer = window.setTimeout(() => { statusEl.hidden = true; }, 3200);
    }
  }

  function hideStatus() {
    window.clearTimeout(statusTimer);
    statusEl.hidden = true;
  }

  function maxSeq() {
    let max = 0;
    for (const record of RECORDS) {
      if (record && Number.isInteger(record.seq)) max = Math.max(max, record.seq);
    }
    return max;
  }

  function findRecordIndex(seq) {
    return RECORDS.findIndex((record) => record && String(record.seq) === String(seq));
  }

  function confirmDiscard() {
    return (!dirty && !jsonDirty) || window.confirm('当前修改尚未导出，确定丢弃？');
  }

  function recordHaystack(record) {
    return [record.seq, record.title, record.author, record.url]
      .map((value) => String(value == null ? '' : value))
      .join(' ').toLowerCase();
  }

  function renderList(scrollActive = false) {
    const query = searchEl.value.trim().toLowerCase();
    const items = RECORDS
      .map((record, index) => ({ record, index }))
      .filter(({ record }) => record && typeof record === 'object')
      .filter(({ record }) => !query || recordHaystack(record).includes(query))
      .sort((a, b) => (Number(b.record.seq) || 0) - (Number(a.record.seq) || 0));

    listEl.replaceChildren();
    if (!items.length) {
      const empty = el('p', 'hint');
      empty.textContent = '没有匹配的条目。';
      listEl.append(empty);
      return;
    }

    let active = null;
    for (const { record, index } of items) {
      const item = el('button', 'record-item');
      item.type = 'button';
      item.dataset.index = String(index);
      if (index === currentIndex) {
        item.classList.add('active');
        item.setAttribute('aria-current', 'true');
        active = item;
      }

      const seq = el('span', 'record-seq');
      seq.textContent = `seq ${record.seq == null ? '?' : record.seq}`;
      const title = el('span', 'record-title');
      title.textContent = String(record.title || '').trim() || '（无标题）';
      const sub = el('span', 'record-sub');
      sub.textContent = [record.author, record.platform].filter(Boolean).join(' · ');
      const status = el('span', 'record-status');
      status.textContent = record.status || 'unknown';
      if (record.status === 'approved' || record.status === 'pending' || record.status === 'rejected') {
        status.classList.add(record.status);
      }

      item.append(seq, title, sub, status);
      listEl.append(item);
    }

    if (scrollActive && active) active.scrollIntoView({ block: 'nearest' });
  }

  function inferType(value) {
    if (value === null || Array.isArray(value) || typeof value === 'object') return 'json';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
  }

  function rawFor(type, value) {
    if (type === 'json') {
      const text = JSON.stringify(value, null, 2);
      return text == null ? '' : text;
    }
    if (value == null) return '';
    return String(value);
  }

  function initCustomMeta() {
    customMeta = Object.create(null);
    for (const key of Object.keys(draft)) {
      if (isKnown(key)) continue;
      const type = inferType(draft[key]);
      customMeta[key] = { type, raw: rawFor(type, draft[key]), error: '' };
    }
  }

  function resetDraftState() {
    jsonDirty = false;
    previewPane.hidden = true;
    hideStatus();
    renderList(true);
    renderForm();
    syncJsonEditor();
    updateDirty();
    updateEditorHead();
    refreshValidation();
  }

  function selectRecord(index) {
    const record = RECORDS[index];
    if (!record) return;
    if (!confirmDiscard()) return;

    mode = 'edit';
    currentIndex = index;
    originalSeq = record.seq;
    draft = clone(record);
    initCustomMeta();
    baseSnapshot = JSON.stringify(draft);
    resetDraftState();
  }

  function startNew() {
    if (!confirmDiscard()) return;
    mode = 'new';
    currentIndex = -1;
    originalSeq = null;
    draft = schema.newRecord(maxSeq() + 1);
    initCustomMeta();
    baseSnapshot = JSON.stringify(draft);
    resetDraftState();
  }

  function updateDirty() {
    dirty = Boolean(draft) && (JSON.stringify(draft) !== baseSnapshot || jsonDirty);
    dirtyBadge.hidden = !dirty;
  }

  function updateEditorHead() {
    if (!draft) {
      editorTitle.textContent = '选择条目';
      editorMeta.textContent = '从左侧选择，或新增条目。';
      return;
    }
    const title = String(draft.title == null ? '' : draft.title).trim();
    editorTitle.textContent = title || '未命名条目';
    if (mode === 'new') {
      editorMeta.textContent = `新增 · seq ${draft.seq == null ? '?' : draft.seq} · ${draft.status || '?'}`;
    } else {
      const changed = draft.seq !== originalSeq ? `（原 ${originalSeq}）` : '';
      editorMeta.textContent = `seq ${draft.seq == null ? '?' : draft.seq}${changed} · ${draft.status || '?'}`;
    }
  }

  function onDraftChanged() {
    updateDirty();
    updateEditorHead();
    refreshValidation();
    if (!previewPane.hidden) previewPane.hidden = true;
  }

  function fieldHint(text) {
    const hint = el('p', 'hint');
    hint.textContent = text;
    return hint;
  }

  function labelFor(field, id) {
    const label = el('label');
    label.htmlFor = id;
    label.textContent = field.label;
    if (field.required) {
      const mark = el('span', 'req');
      mark.textContent = ' *';
      label.append(mark);
    }
    return label;
  }

  function applyNumber(key, control) {
    const raw = control.value.trim();
    draft[key] = raw === '' ? '' : (Number.isInteger(Number(raw)) ? Number(raw) : raw);
  }

  function addUrlTools(wrap, field) {
    const control = wrap.querySelector('input');
    urlInput = control;
    urlStatus = el('div', 'url-status');
    canonicalBtn = el('button', 'canonical-btn');
    canonicalBtn.type = 'button';
    canonicalBtn.textContent = '使用规范链接';
    canonicalBtn.hidden = true;
    canonicalBtn.addEventListener('click', () => {
      if (!canonicalBtn.dataset.url) return;
      draft.url = canonicalBtn.dataset.url;
      if (urlInput) urlInput.value = draft.url;
      updateUrlStatus();
      onDraftChanged();
    });
    wrap.append(urlStatus, canonicalBtn);
    if (field.hint) wrap.append(fieldHint(field.hint));
  }

  function knownField(field) {
    const wrap = el('div', 'field');
    const id = `f-${field.key}`;

    if (field.type === 'checkbox') {
      wrap.classList.add('field-checkbox');
      const label = el('label');
      label.htmlFor = id;
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.id = id;
      control.checked = draft[field.key] === true;
      control.addEventListener('change', () => {
        draft[field.key] = control.checked;
        onDraftChanged();
      });
      label.append(control, document.createTextNode(field.label));
      wrap.append(label);
      if (field.hint) wrap.append(fieldHint(field.hint));
      return wrap;
    }

    wrap.append(labelFor(field, id));
    let control;

    if (field.type === 'select' || field.type === 'string-bool') {
      control = document.createElement('select');
      control.id = id;
      const options = (field.options || []).slice();
      const current = draft[field.key] == null ? '' : String(draft[field.key]);
      if (!options.includes(current)) options.push(current);
      for (const optionValue of options) {
        const option = document.createElement('option');
        option.value = optionValue;
        option.textContent = optionValue === '' ? '（无效/空）' : optionValue;
        control.append(option);
      }
      control.value = current;
      control.addEventListener('change', () => {
        draft[field.key] = control.value;
        onDraftChanged();
      });
    } else if (field.type === 'textarea') {
      control = document.createElement('textarea');
      control.id = id;
      control.rows = field.rows || 3;
      control.value = draft[field.key] == null ? '' : String(draft[field.key]);
      control.addEventListener('input', () => {
        draft[field.key] = control.value;
        onDraftChanged();
      });
    } else {
      control = document.createElement('input');
      control.id = id;
      control.type = field.type === 'number' ? 'number' : 'text';
      if (field.type === 'number') {
        control.min = '1';
        control.step = '1';
      }
      if (field.type === 'datalist') {
        const listId = `dl-${field.key}`;
        control.setAttribute('list', listId);
        const datalist = document.createElement('datalist');
        datalist.id = listId;
        for (const optionValue of field.options || []) {
          const option = document.createElement('option');
          option.value = optionValue;
          datalist.append(option);
        }
        wrap.append(datalist);
      }
      if (field.key === 'url') {
        control.spellcheck = false;
        control.autocomplete = 'off';
      }
      control.value = draft[field.key] == null ? '' : String(draft[field.key]);
      control.addEventListener('input', () => {
        if (field.type === 'number') {
          applyNumber(field.key, control);
        } else {
          draft[field.key] = control.value;
        }
        if (field.key === 'url') {
          updateUrlStatus();
          maybeAutoPlatform();
        }
        onDraftChanged();
      });
    }

    wrap.append(control);
    if (field.key === 'url') {
      addUrlTools(wrap, field);
    } else if (field.hint) {
      wrap.append(fieldHint(field.hint));
    }
    return wrap;
  }

  function updateUrlStatus() {
    if (!urlStatus || !draft) return;
    const raw = String(draft.url == null ? '' : draft.url).trim();
    urlStatus.className = 'url-status';
    if (canonicalBtn) canonicalBtn.hidden = true;
    if (!raw) {
      urlStatus.textContent = '粘贴链接后自动识别视频/文章。';
      return;
    }
    const result = media.validateUrl(raw);
    if (result.error) {
      urlStatus.textContent = result.error;
      urlStatus.classList.add('err');
      return;
    }
    const info = result.info;
    let text;
    if (info.kind === 'video') {
      text = `视频 · ${info.bvid || `av${info.aid}`}`;
      if (info.page > 1) text += ` · P${info.page}`;
    } else {
      text = `文章 · ${info.provider}`;
    }
    urlStatus.textContent = text;
    urlStatus.classList.add('ok');
    if (canonicalBtn && info.canonicalUrl && info.canonicalUrl !== raw) {
      canonicalBtn.hidden = false;
      canonicalBtn.dataset.url = info.canonicalUrl;
    }
  }

  function maybeAutoPlatform() {
    if (!draft || String(draft.platform || '').trim()) return;
    const info = media.parseMedia(draft.url);
    if (info.kind === 'unknown') return;
    const platform = info.provider === 'bilibili' ? 'B站' : info.provider === 'jianshu' ? '简书' : '';
    if (!platform) return;
    draft.platform = platform;
    const control = $('#f-platform');
    if (control) control.value = platform;
  }

  function customKeyError(key, oldKey) {
    if (!key) return '字段名不能为空';
    if (isKnown(key)) return '该字段已在 schema 中';
    if (schema.DANGEROUS_KEYS.includes(key)) return '不允许的字段名';
    if (key !== oldKey && Object.prototype.hasOwnProperty.call(draft, key)) return '字段名重复';
    return '';
  }

  function setRowError(row, message) {
    const target = row.querySelector('.custom-error');
    if (!target) return;
    target.textContent = message || '';
    target.hidden = !message;
  }

  function syncMetaValue(key, meta, value) {
    meta.raw = rawFor(meta.type, value);
    meta.error = '';
    draft[key] = value;
  }

  function customRow(key) {
    const meta = customMeta[key] || { type: inferType(draft[key]), raw: rawFor(inferType(draft[key]), draft[key]), error: '' };
    customMeta[key] = meta;
    const row = el('div', 'custom-row');

    const keyInput = document.createElement('input');
    keyInput.className = 'custom-key';
    keyInput.value = key;
    keyInput.setAttribute('aria-label', '字段名');
    keyInput.spellcheck = false;
    keyInput.addEventListener('change', () => {
      const next = keyInput.value.trim();
      if (next === key) {
        keyInput.value = key;
        return;
      }
      const error = customKeyError(next, key);
      if (error) {
        setRowError(row, error);
        keyInput.value = key;
        return;
      }
      const rebuilt = {};
      for (const current of Object.keys(draft)) {
        rebuilt[current === key ? next : current] = draft[current];
      }
      draft = rebuilt;
      customMeta[next] = customMeta[key];
      delete customMeta[key];
      renderForm();
      onDraftChanged();
    });

    const typeSelect = document.createElement('select');
    typeSelect.className = 'custom-type';
    typeSelect.setAttribute('aria-label', '字段类型');
    for (const type of ['string', 'number', 'boolean', 'JSON']) {
      const option = document.createElement('option');
      option.value = type === 'JSON' ? 'json' : type;
      option.textContent = type;
      typeSelect.append(option);
    }
    typeSelect.value = meta.type;
    typeSelect.addEventListener('change', () => {
      meta.type = typeSelect.value;
      meta.error = '';
      if (meta.type === 'number') {
        const number = Number(draft[key]);
        syncMetaValue(key, meta, Number.isFinite(number) ? number : 0);
      } else if (meta.type === 'boolean') {
        syncMetaValue(key, meta, draft[key] === true);
      } else if (meta.type === 'string') {
        syncMetaValue(key, meta, draft[key] == null ? '' : String(draft[key]));
      } else {
        meta.raw = rawFor('json', draft[key]);
      }
      renderForm();
      onDraftChanged();
    });

    const valueWrap = el('div', 'custom-value');
    if (meta.type === 'boolean') {
      const checkLabel = el('label', 'field-checkbox');
      const control = document.createElement('input');
      control.type = 'checkbox';
      control.checked = draft[key] === true;
      control.addEventListener('change', () => {
        draft[key] = control.checked;
        meta.raw = String(control.checked);
        meta.error = '';
        setRowError(row, '');
        onDraftChanged();
      });
      checkLabel.append(control, document.createTextNode('true / false'));
      valueWrap.append(checkLabel);
    } else if (meta.type === 'json') {
      const control = document.createElement('textarea');
      control.value = meta.raw;
      control.spellcheck = false;
      control.placeholder = '{ }';
      control.addEventListener('input', () => {
        meta.raw = control.value;
        try {
          const parsed = JSON.parse(control.value);
          draft[key] = parsed;
          meta.error = '';
          setRowError(row, '');
        } catch (error) {
          meta.error = 'JSON 解析失败';
          setRowError(row, meta.error);
        }
        onDraftChanged();
      });
      valueWrap.append(control);
    } else if (meta.type === 'number') {
      const control = document.createElement('input');
      control.type = 'text';
      control.inputMode = 'decimal';
      control.value = meta.raw;
      control.addEventListener('input', () => {
        meta.raw = control.value;
        const raw = control.value.trim();
        if (!raw) {
          meta.error = '不能为空';
          setRowError(row, meta.error);
        } else {
          const number = Number(raw);
          if (Number.isFinite(number)) {
            draft[key] = number;
            meta.error = '';
            setRowError(row, '');
          } else {
            meta.error = '不是有效数字';
            setRowError(row, meta.error);
          }
        }
        onDraftChanged();
      });
      valueWrap.append(control);
    } else {
      const control = document.createElement('input');
      control.type = 'text';
      control.value = meta.raw;
      control.addEventListener('input', () => {
        meta.raw = control.value;
        draft[key] = control.value;
        meta.error = '';
        setRowError(row, '');
        onDraftChanged();
      });
      valueWrap.append(control);
    }

    const del = el('button', 'custom-del');
    del.type = 'button';
    del.textContent = '删除';
    del.addEventListener('click', () => {
      delete draft[key];
      delete customMeta[key];
      renderForm();
      onDraftChanged();
    });

    const error = el('p', 'custom-error');
    error.textContent = meta.error || '';
    error.hidden = !meta.error;

    row.append(keyInput, typeSelect, valueWrap, del, error);
    return row;
  }

  function customGroup() {
    const section = el('section', 'group');
    const heading = el('h2');
    heading.textContent = '其他字段';
    const note = el('span', 'group-note');
    note.textContent = '未在 schema 中；导出会保留';
    heading.append(note);
    section.append(heading);

    const list = el('div', 'custom-list');
    for (const key of Object.keys(draft)) {
      if (isKnown(key)) continue;
      list.append(customRow(key));
    }
    section.append(list);

    const add = el('div', 'custom-add');
    const input = document.createElement('input');
    input.placeholder = '新字段 key';
    input.setAttribute('aria-label', '新字段 key');
    input.spellcheck = false;
    const button = el('button', 'btn');
    button.type = 'button';
    button.textContent = '添加字段';
    const addError = el('p', 'custom-error');
    addError.hidden = true;
    const doAdd = () => {
      const key = input.value.trim();
      const errorText = customKeyError(key, null);
      if (errorText) {
        addError.textContent = errorText;
        addError.hidden = false;
        return;
      }
      draft[key] = '';
      customMeta[key] = { type: 'string', raw: '', error: '' };
      renderForm();
      onDraftChanged();
      const keys = recordForm.querySelectorAll('.custom-key');
      const last = keys[keys.length - 1];
      if (last) last.focus();
    };
    button.addEventListener('click', doAdd);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        doAdd();
      }
    });
    add.append(input, button, addError);
    section.append(add);
    return section;
  }

  function renderForm() {
    recordForm.replaceChildren();
    urlInput = null;
    urlStatus = null;
    canonicalBtn = null;
    if (!draft) return;

    for (const group of schema.GROUPS) {
      const fields = schema.FIELDS.filter((field) => field.group === group.id);
      if (!fields.length) continue;
      const section = el('section', 'group');
      const heading = el('h2');
      heading.textContent = group.label;
      section.append(heading);
      for (const field of fields) section.append(knownField(field));
      recordForm.append(section);
    }
    recordForm.append(customGroup());
    updateUrlStatus();
  }

  function duplicateSeqError() {
    if (!Number.isInteger(draft.seq)) return '';
    const index = RECORDS.findIndex((record, itemIndex) =>
      itemIndex !== currentIndex && record && record.seq === draft.seq);
    return index >= 0 ? `seq: 与第 ${index} 条重复` : '';
  }

  function duplicateUrlError() {
    if (typeof draft.url !== 'string' || !draft.url.trim()) return '';
    const info = media.parseMedia(draft.url);
    if (info.kind === 'unknown') return '';
    const index = RECORDS.findIndex((record, itemIndex) =>
      itemIndex !== currentIndex && RECORD_URL_KEYS[itemIndex] === info.key);
    return index >= 0 ? `url: 与第 ${index} 条重复` : '';
  }

  function validateDraft() {
    const errors = [];
    const warnings = [];
    if (!draft) return { errors, warnings };

    const checked = schema.checkTypes(draft);
    errors.push(...checked.errors);
    warnings.push(...checked.warnings);

    const seqError = duplicateSeqError();
    if (seqError) errors.push(seqError);
    const urlError = duplicateUrlError();
    if (urlError) errors.push(urlError);

    const info = typeof draft.url === 'string' ? media.parseMedia(draft.url) : null;
    if (info && info.kind === 'unknown' && String(draft.url || '').trim()) {
      errors.push(`url: ${media.ERROR_TEXT[info.reason] || '链接无效'}`);
    }
    if (info && info.kind !== 'unknown') {
      const expected = info.provider === 'bilibili' ? 'B站' : info.provider === 'jianshu' ? '简书' : '';
      if (expected && draft.platform && draft.platform !== expected) {
        warnings.push(`platform: ${draft.platform} 与链接 ${expected} 不一致`);
      }
      if (info.kind === 'video' && !String(draft.videoPages || '').trim()) {
        warnings.push('videoPages: 未填分P数（可选，播放按 URL 识别）');
      }
      if (info.kind === 'article' && (String(draft.videoPages || '').trim() || String(draft.videoDuration || '').trim())) {
        warnings.push('videoPages/videoDuration: 文章条目不应有视频元数据');
      }
    }

    for (const key of Object.keys(customMeta)) {
      if (customMeta[key].error) errors.push(`自定义字段 ${key}: ${customMeta[key].error}`);
    }

    if (mode === 'edit' && draft.seq !== originalSeq) {
      warnings.push(`seq: 已从 ${originalSeq} 改为 ${draft.seq}；请在 mmd.json 按原 seq 查找并整体替换`);
    }
    if (mode === 'new' && draft.status !== 'approved') {
      warnings.push('status: 新条目不是 approved，合并后不会出现在公开页');
    }

    return { errors, warnings };
  }

  function renderMessages(target, messages) {
    target.replaceChildren();
    target.hidden = !messages.length;
    for (const message of messages) {
      const row = el('div', 'msg');
      row.textContent = message;
      target.append(row);
    }
  }

  function refreshValidation() {
    lastValidation = validateDraft();
    renderMessages(errorsEl, lastValidation.errors);
    renderMessages(warningsEl, lastValidation.warnings);
    const blocked = !draft || lastValidation.errors.length > 0;
    copyBtn.disabled = blocked;
    downloadBtn.disabled = blocked;
    previewCopy.disabled = blocked;
    previewDownload.disabled = blocked;
    previewBtn.disabled = !draft;
  }

  function syncJsonEditor() {
    jsonEditor.value = draft ? JSON.stringify(draft, null, 4) : '';
    jsonDirty = false;
  }

  function showTab(name) {
    const formActive = name === 'form';
    tabForm.classList.toggle('active', formActive);
    tabJson.classList.toggle('active', !formActive);
    tabForm.setAttribute('aria-selected', String(formActive));
    tabJson.setAttribute('aria-selected', String(!formActive));
    formPane.hidden = !formActive;
    jsonPane.hidden = formActive;
  }

  function previewText() {
    if (!draft) return '';
    return JSON.stringify(draft, null, 4)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n');
  }

  function previewHintText() {
    if (mode === 'new') {
      return '追加到 mmd.json 的 records 数组末尾，并给前一条补逗号；不会自动写入仓库。';
    }
    const changed = draft.seq !== originalSeq ? '（对象仍按原 seq 定位）' : '';
    return `在 mmd.json 中找到 "seq": ${originalSeq} 的对象并整体替换${changed}；不会自动写入仓库。`;
  }

  function jsonIsPending() {
    if (!jsonDirty) return false;
    showStatus('请先应用 JSON 修改。', true);
    return true;
  }

  function openPreview() {
    if (!draft) {
      showStatus('请先选择或新增条目。', true);
      return;
    }
    if (jsonIsPending()) return;
    refreshValidation();
    previewJson.textContent = previewText();
    previewHint.textContent = previewHintText()
      + (lastValidation.errors.length ? ' 当前有错误，修正后才能复制或下载。' : '');
    previewCopy.disabled = lastValidation.errors.length > 0;
    previewDownload.disabled = lastValidation.errors.length > 0;
    previewPane.hidden = false;
    closePreviewBtn.focus();
  }

  function closePreview() {
    previewPane.hidden = true;
  }

  function markExported() {
    if (!draft) return;
    baseSnapshot = JSON.stringify(draft);
    updateDirty();
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      let copied = false;
      try { copied = document.execCommand('copy'); } catch (err) { copied = false; }
      area.remove();
      return copied;
    }
  }

  async function copySnippet() {
    if (jsonIsPending()) return;
    refreshValidation();
    if (!draft || lastValidation.errors.length) {
      showStatus('当前有错误，不能复制。', true);
      return;
    }
    const copied = await copyText(previewText());
    if (copied) {
      markExported();
      showStatus('已复制片段。');
    } else {
      showStatus('复制失败，请手动选择。', true);
    }
  }

  function downloadSnippet() {
    if (jsonIsPending()) return;
    refreshValidation();
    if (!draft || lastValidation.errors.length) {
      showStatus('当前有错误，不能下载。', true);
      return;
    }
    const body = `${JSON.stringify(draft, null, 4)}\n`;
    const blob = new Blob([body], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const seq = String(draft.seq == null ? 'new' : draft.seq).replace(/[^\w.-]+/g, '_');
    link.download = `mmd-seq-${seq}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    markExported();
    showStatus('已下载 .json。');
  }

  listEl.addEventListener('click', (event) => {
    const item = event.target.closest('.record-item');
    if (!item) return;
    selectRecord(Number(item.dataset.index));
  });

  searchEl.addEventListener('input', () => renderList());
  newBtn.addEventListener('click', startNew);
  recordForm.addEventListener('submit', (event) => event.preventDefault());

  tabForm.addEventListener('click', () => {
    if (jsonDirty && !window.confirm('JSON 修改尚未应用，确定丢弃？')) return;
    syncJsonEditor();
    updateDirty();
    showTab('form');
  });

  tabJson.addEventListener('click', () => {
    syncJsonEditor();
    showTab('json');
  });

  jsonEditor.addEventListener('input', () => {
    jsonDirty = jsonEditor.value !== (draft ? JSON.stringify(draft, null, 4) : '');
    updateDirty();
  });

  applyJsonBtn.addEventListener('click', () => {
    if (!draft) {
      showStatus('请先选择或新增条目。', true);
      return;
    }
    let parsed;
    try {
      parsed = JSON.parse(jsonEditor.value);
    } catch (error) {
      showStatus(`JSON 解析失败：${error.message}`, true);
      return;
    }
    if (!schema.isPlainObject(parsed)) {
      showStatus('JSON 必须是单个对象。', true);
      return;
    }
    const dangerous = schema.DANGEROUS_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(parsed, key));
    if (dangerous.length) {
      showStatus(`不允许的字段名：${dangerous.join(', ')}`, true);
      return;
    }
    draft = parsed;
    initCustomMeta();
    jsonDirty = false;
    syncJsonEditor();
    renderForm();
    updateDirty();
    updateEditorHead();
    refreshValidation();
    showTab('form');
    showStatus('JSON 已应用；请检查错误和警告。');
  });

  previewBtn.addEventListener('click', openPreview);
  closePreviewBtn.addEventListener('click', closePreview);
  copyBtn.addEventListener('click', copySnippet);
  downloadBtn.addEventListener('click', downloadSnippet);
  previewCopy.addEventListener('click', copySnippet);
  previewDownload.addEventListener('click', downloadSnippet);

  const params = new URLSearchParams(window.location.search);
  if (params.get('new') === '1') {
    startNew();
  } else if (params.has('seq')) {
    const seq = params.get('seq');
    const index = findRecordIndex(seq);
    if (index >= 0) {
      selectRecord(index);
    } else {
      mode = 'none';
      draft = null;
      renderList();
      updateEditorHead();
      refreshValidation();
      syncJsonEditor();
      showStatus(`未找到 seq=${seq}，已显示全部条目。`, true, true);
    }
  } else {
    mode = 'none';
    draft = null;
    renderList();
    updateEditorHead();
    refreshValidation();
    syncJsonEditor();
  }
})();
