// The wutu CLI without a browser: format, build, and the dev server's file
// serving, live-reload events, error reporting, and cleanup.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import http from 'node:http';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

const cli = path.resolve('cli/wutu.mjs');
const dir = await fs.mkdtemp(path.resolve('.tmp-wutu-cli-'));
const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
const app = (heading) => `using Browser from std:Browser;
export main() void {
    let view = @wutu/\\
    @reactive;
    main {
        h1 {
            "${heading}";
        }
    }
    \\/;
    Browser.document.body.append(view);
}
`;

function request(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let body = '';
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, type: res.headers['content-type'], body }));
    }).on('error', reject);
  });
}

async function waitFor(check, what, timeout = 60000) {
  const deadline = Date.now() + timeout;
  for (;;) {
    const value = check();
    if (value) return value;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${what}`);
    await new Promise(resolve => setTimeout(resolve, 50));
  }
}

let child;
try {
  // format
  const messy = path.join(dir, 'messy.utu');
  await fs.writeFile(messy, 'export main() I32 { let a = 1; a; }\n');
  assert.equal(run('format', messy, '--check').status, 1, 'unformatted file fails --check');
  assert.equal(run('format', messy).status, 0);
  assert.equal(await fs.readFile(messy, 'utf8'), 'export main() I32 {\n    let a = 1;\n    a;\n}\n');
  assert.equal(run('format', messy, '--check').status, 0, 'formatted file passes --check');
  assert.equal(run('format').status, 2, 'format without files is a usage error');
  // A file that does not parse is left as it is, and says so.
  const misparsed = path.join(dir, 'misparsed.utu');
  await fs.writeFile(misparsed, 'fn f() I32 { let a = 1 a; }\n');
  assert.match(run('format', misparsed).stderr, /left as is: it does not parse/);
  assert.equal(await fs.readFile(misparsed, 'utf8'), 'fn f() I32 { let a = 1 a; }\n');
  // How wutu was run: exit 2, said with the usage, before anything is built or served.
  for (const [args, said] of [
    [['bogus'], /unknown command bogus/],
    [['constructor'], /unknown command constructor/],
    [['build', messy, '-O', 'constructor'], /unknown build mode -O constructor/],
    [['build', messy, messy], /extra argument/],
    [['build', messy, '--bogus'], /unknown option --bogus/],
    [['build', messy, '--out', 'a', '--out', 'b'], /two outputs: a, b/],
    [['build', path.join(dir, 'none.utu')], /no file .*none\.utu/],
    [['dev', messy, '--port', 'abc'], /--port needs a port/],
    [['dev', messy, '--port', '99999'], /--port needs a port/],
    [['dev', path.join(dir, 'none.utu')], /no file/],
  ]) {
    const r = spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', timeout: 30000 });
    assert.equal(r.status, 2, `${args.join(' ')}: ${r.stderr}`);
    assert.match(r.stderr, said, args.join(' '));
  }

  // build
  const entry = path.join(dir, 'main.utu');
  await fs.writeFile(entry, app('First'));
  const out = path.join(dir, 'out');
  const built = run('build', entry, '--out', out, '--title', 'A <b> & "c"', '--no-prerender');
  assert.equal(built.status, 0, built.stderr);
  for (const file of ['index.html', 'app.js', 'app.wasm']) await fs.access(path.join(out, file));
  assert.ok((await fs.readFile(path.join(out, 'index.html'), 'utf8')).includes('<title>A &lt;b> &amp; &quot;c&quot;</title>'));
  const broken = path.join(dir, 'broken.utu');
  await fs.writeFile(broken, app('Broken').replace('"Broken";', '"Broken"'));
  const failed = run('build', broken, '--out', path.join(dir, 'broken-out'), '--no-prerender');
  assert.equal(failed.status, 1);
  assert.match(failed.stderr, /broken\.utu:\d+:\d+/, 'build errors are positioned diagnostics');
  // A failed build leaves the last good one as it was.
  const before = await fs.readFile(path.join(out, 'app.wasm'));
  assert.equal(run('build', broken, '--out', out, '--no-prerender').status, 1);
  assert.deepEqual(await fs.readFile(path.join(out, 'app.wasm')), before);
  assert.deepEqual((await fs.readdir(dir)).filter(name => name.includes('.building-')), [], 'no build directory is left');

  // dev
  const previewOut = path.join(dir, 'preview');
  child = spawn(process.execPath, [cli, 'dev', entry, '--out', previewOut, '--port', '0'], { cwd: dir, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', chunk => { log += chunk; });
  child.stderr.on('data', chunk => { log += chunk; });
  const origin = (await waitFor(() => /Wutu preview: (http:\/\/\S+)/.exec(log), 'the preview server'))[1];

  const page = await request(origin + '/');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('/__wutu_events') && page.body.includes('./app.js'), 'pages get the live-reload client');
  assert.equal((await request(origin + '/app.wasm')).type, 'application/wasm');
  assert.equal((await request(origin + '/%2e%2e/%2e%2e/main.utu')).status, 404, 'paths cannot escape the preview');

  const events = [];
  let connected = false;
  const stream = http.get(origin + '/__wutu_events', res => res.on('data', chunk => {
    connected ||= String(chunk).includes(': connected');
    for (const line of String(chunk).split('\n')) if (line.startsWith('data: ')) events.push(JSON.parse(line.slice(6)));
  }));
  await waitFor(() => connected, 'the event stream');
  await fs.writeFile(entry, app('Second').replace('"Second";', '"Second"'));
  const error = await waitFor(() => events.find(event => event.error), 'a build error event');
  assert.match(error.error, /main\.utu:\d+:\d+/);
  assert.equal((await request(origin + '/')).status, 200, 'the last good build keeps serving');
  await fs.writeFile(entry, app('Third'));
  await waitFor(() => events.find(event => event.reload), 'a reload event');
  stream.destroy();

  // A port in use ends a second server, with the reason.
  const port = new URL(origin).port;
  const second = spawnSync(process.execPath, [cli, 'dev', entry, '--out', path.join(dir, 'preview2'), '--port', port], { cwd: dir, encoding: 'utf8', timeout: 60000 });
  assert.equal(second.status, 1, second.stderr);
  assert.match(second.stderr, /cannot serve on 127\.0\.0\.1:\d+: the port is in use/);

  child.kill('SIGINT');
  await new Promise(resolve => (child.exitCode !== null ? resolve() : child.once('exit', resolve)));
  const leftovers = await fs.readdir(previewOut).catch(() => []);
  assert.deepEqual(leftovers.filter(name => name.startsWith('.preview-')), [], 'preview builds are removed on exit');
  console.log('wutu CLI: format, build diagnostics, dev serving, live-reload events, traversal guard, and cleanup passed');
} finally {
  if (child && child.exitCode === null) child.kill('SIGKILL');
  await fs.rm(dir, { recursive: true, force: true });
}
