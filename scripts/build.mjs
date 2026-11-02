/* Build the static site from mmd.json + src templates.
 * Usage: node scripts/build.mjs [--data mmd.json] [--out dist]
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateRecords } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function parseArgs(argv) {
  let dataArg = 'mmd.json';
  let outArg = 'dist';
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--data') {
      dataArg = argv[i + 1] || dataArg;
      i += 1;
    } else if (arg === '--out') {
      outArg = argv[i + 1] || outArg;
      i += 1;
    }
  }
  return { dataArg, outArg };
}

function resolveFromRoot(value) {
  return path.isAbsolute(value) ? value : path.resolve(ROOT, value);
}

function escapeForScript(value) {
  return value
    .replace(/</g, "\\u003c")
    .split(String.fromCharCode(0x2028)).join("\\u2028")
    .split(String.fromCharCode(0x2029)).join("\\u2029")
}

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function main() {
  const { dataArg, outArg } = parseArgs(process.argv.slice(2));
  const dataPath = resolveFromRoot(dataArg);
  const outDir = resolveFromRoot(outArg);

  if (outDir === ROOT) {
    fail('--out 不能指向仓库根目录；请使用 dist 或 _site');
    return;
  }

  let source;
  try {
    source = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
  } catch (error) {
    fail(`无法读取/解析 ${dataPath}: ${error.message}`);
    return;
  }

  const records = source && source.records;
  const { errors, warnings } = validateRecords(records);
  if (warnings.length) {
    console.warn(`Warnings (${warnings.length})`);
    for (const warning of warnings) console.warn(`  ${warning}`);
  }
  if (errors.length) {
    console.error(`Errors (${errors.length})`);
    for (const error of errors) console.error(`  ${error}`);
    process.exitCode = 1;
    return;
  }

  const payload = { schemaVersion: 1, records };
  const mmdJs = `window.MMD_DATA = ${escapeForScript(JSON.stringify(payload))};\n`;

  const pageTemplatePath = path.join(ROOT, 'src', 'page.template.html');
  const editTemplatePath = path.join(ROOT, 'src', 'edit.template.html');
  const pageTemplate = fs.readFileSync(pageTemplatePath, 'utf8');
  const editTemplate = fs.readFileSync(editTemplatePath, 'utf8');
  if (pageTemplate.includes('__MMD_DATA__') || editTemplate.includes('__MMD_DATA__')) {
    fail('模板仍包含 __MMD_DATA__；数据必须外置到 mmd.js');
    return;
  }

  const assets = {
    'media.js': fs.readFileSync(path.join(ROOT, 'src', 'media.js'), 'utf8'),
    'schema.js': fs.readFileSync(path.join(ROOT, 'src', 'schema.js'), 'utf8'),
    'edit.js': fs.readFileSync(path.join(ROOT, 'src', 'edit.js'), 'utf8'),
    'edit.css': fs.readFileSync(path.join(ROOT, 'src', 'edit.css'), 'utf8')
  };

  const version = crypto.createHash('sha256')
    .update(mmdJs)
    .update(pageTemplate)
    .update(editTemplate)
    .update(assets['media.js'])
    .update(assets['schema.js'])
    .update(assets['edit.js'])
    .update(assets['edit.css'])
    .digest('hex')
    .slice(0, 10);

  function fillVersion(html, name) {
    if (!html.includes('__MMD_VERSION__')) throw new Error(`${name} 缺少 __MMD_VERSION__ 占位符`);
    const filled = html.split('__MMD_VERSION__').join(version);
    if (filled.includes('__MMD_VERSION__')) throw new Error(`${name} 占位符未完全替换`);
    return filled;
  }

  let indexHtml;
  let editHtml;
  try {
    indexHtml = fillVersion(pageTemplate, 'src/page.template.html');
    editHtml = fillVersion(editTemplate, 'src/edit.template.html');
  } catch (error) {
    fail(error.message);
    return;
  }

  try {
    const sandbox = { window: {} };
    vm.runInNewContext(mmdJs, sandbox, { filename: 'mmd.js' });
    if (!sandbox.window.MMD_DATA || sandbox.window.MMD_DATA.records.length !== records.length) {
      throw new Error('mmd.js smoke test: window.MMD_DATA.records 数量不一致');
    }
  } catch (error) {
    fail(`mmd.js 生成后无法执行: ${error.message}`);
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'mmd.js'), mmdJs);
  fs.writeFileSync(path.join(outDir, 'index.html'), indexHtml);
  fs.writeFileSync(path.join(outDir, 'edit.html'), editHtml);
  for (const [name, content] of Object.entries(assets)) {
    fs.writeFileSync(path.join(outDir, name), content);
  }
  fs.writeFileSync(path.join(outDir, '.nojekyll'), '');

  const cnamePath = path.join(ROOT, 'CNAME');
  if (fs.existsSync(cnamePath)) fs.copyFileSync(cnamePath, path.join(outDir, 'CNAME'));

  const approved = records.filter((record) => record.status === 'approved').length;
  const pending = records.filter((record) => record.status === 'pending').length;
  const rejected = records.filter((record) => record.status === 'rejected').length;
  console.log(`wrote ${path.relative(ROOT, outDir) || outDir}: ${records.length} records ` +
    `(${approved} approved, ${pending} pending, ${rejected} rejected), version ${version}`);
}

main();
