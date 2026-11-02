/* Validate mmd.json without rewriting it.
 * Usage: node scripts/validate.mjs [--data mmd.json] [path]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const schema = require('../src/schema.js');
const media = require('../src/media.js');

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function tagsWarn(value, key, index, seq, warnings) {
  if (typeof value !== 'string' || !value.trim()) return;
  if (/[\r\n]/.test(value)) warnings.push(`[${index} seq=${seq}] ${key}: 含换行`);
  const parts = value.split(/[、,，|]+/).map((part) => part.trim());
  if (parts.some((part) => !part)) warnings.push(`[${index} seq=${seq}] ${key}: 有空标签`);
  const seen = new Set();
  for (const part of parts) {
    if (!part) continue;
    const normalized = part.toLowerCase();
    if (seen.has(normalized)) warnings.push(`[${index} seq=${seq}] ${key}: 重复标签「${part}」`);
    seen.add(normalized);
  }
}

function providerFor(platform) {
  if (platform === 'B站') return 'bilibili';
  if (platform === '简书') return 'jianshu';
  return null;
}

function prefixMessages(list, prefix) {
  return list.map((message) => `${prefix} ${message}`);
}

export function validateRecords(records) {
  const errors = [];
  const warnings = [];
  if (!Array.isArray(records)) {
    return { errors: ['records: 必须是数组'], warnings };
  }

  const seqSeen = new Map();
  const urlSeen = new Map();

  records.forEach((record, index) => {
    if (!schema.isPlainObject(record)) {
      errors.push(`[${index}] record: 必须是对象`);
      return;
    }

    const seq = record.seq;
    const prefix = `[${index} seq=${seq == null ? '?' : seq}]`;
    const checked = schema.checkTypes(record);
    errors.push(...prefixMessages(checked.errors, prefix));
    warnings.push(...prefixMessages(checked.warnings, prefix));

    if (Number.isInteger(seq)) {
      if (seqSeen.has(seq)) errors.push(`${prefix} seq: 与第 ${seqSeen.get(seq)} 条重复`);
      else seqSeen.set(seq, index);
    }

    const urlResult = media.validateUrl(record.url);
    if (urlResult.error) {
      errors.push(`${prefix} url: ${urlResult.error}`);
    } else {
      const info = urlResult.info;
      if (urlSeen.has(info.key)) errors.push(`${prefix} url: 与第 ${urlSeen.get(info.key)} 条重复`);
      else urlSeen.set(info.key, index);

      const expectedProvider = providerFor(record.platform);
      if (expectedProvider && info.provider !== expectedProvider) {
        warnings.push(`${prefix} platform: ${record.platform} 与链接 provider=${info.provider} 不一致`);
      }

      if (info.kind === 'video' && !String(record.videoPages || '').trim()) {
        warnings.push(`${prefix} videoPages: 视频未填分P数（播放仍会按 URL 识别）`);
      }
      if (info.kind === 'article' && (String(record.videoPages || '').trim() || String(record.videoDuration || '').trim())) {
        warnings.push(`${prefix} videoPages/videoDuration: 文章条目不应有视频元数据`);
      }
    }

    tagsWarn(record.otherTags, 'otherTags', index, seq, warnings);
    tagsWarn(record.rendererTags, 'rendererTags', index, seq, warnings);
  });

  return { errors, warnings };
}

function parseArgs(argv) {
  let dataArg = 'mmd.json';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--data') {
      dataArg = argv[i + 1] || dataArg;
      i += 1;
    } else if (!arg.startsWith('--')) {
      dataArg = arg;
    }
  }
  return { dataArg };
}

function printMessages(title, messages) {
  if (!messages.length) return;
  console.error(`\n${title} (${messages.length})`);
  for (const message of messages) console.error(`  ${message}`);
}

export function main() {
  const { dataArg } = parseArgs(process.argv.slice(2));
  const dataPath = path.isAbsolute(dataArg) ? dataArg : path.resolve(ROOT, dataArg);
  let source;
  try {
    source = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    console.error(`无法读取/解析 ${dataPath}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const records = source && source.records;
  const { errors, warnings } = validateRecords(records);
  const list = Array.isArray(records) ? records : [];
  const counts = {
    total: list.length,
    approved: list.filter((r) => r && r.status === 'approved').length,
    pending: list.filter((r) => r && r.status === 'pending').length,
    rejected: list.filter((r) => r && r.status === 'rejected').length,
    maxSeq: list.reduce((max, r) => Number.isInteger(r && r.seq) ? Math.max(max, r.seq) : max, 0)
  };

  printMessages('Warnings', warnings);
  printMessages('Errors', errors);
  console.log(`\n${path.relative(ROOT, dataPath) || dataPath}: ${counts.total} records, ` +
    `${counts.approved} approved, ${counts.pending} pending, ${counts.rejected} rejected, ` +
    `max seq ${counts.maxSeq}, next seq ${counts.maxSeq + 1}`);
  if (errors.length) process.exitCode = 1;
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) main();
