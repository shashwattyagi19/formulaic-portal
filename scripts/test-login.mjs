/**
 * Tests for POST /api/auth/login (api/auth/login.js).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import { POST, GET, authenticate } from '../api/auth/login.js';
import handler from '../api/auth/login.js';

function post(body, { raw } = {}) {
  return POST(new Request('http://localhost/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: raw ?? JSON.stringify(body),
  }));
}

async function read(res) {
  return { status: res.status, body: await res.json() };
}

test('GET is rejected', async () => {
  const res = GET();
  assert.equal(res.status, 405);
  assert.deepEqual(await res.json(), { error: 'Method not allowed' });
});

test('demo Managing Director can sign in', async () => {
  const { status, body } = await read(await post({
    email: 'md@formulaic.in',
    password: 'demo1234',
  }));
  assert.equal(status, 200);
  assert.equal(body.profile.email, 'md@formulaic.in');
  assert.equal(body.profile.role, 'managing_director');
  assert.equal(body.profile.full_name, 'Aarav Mehta');
  assert.equal(body.session, null);
});

test('email is trimmed and matched case-insensitively', async () => {
  const { status, body } = await read(await post({
    email: '  MD@Formulaic.IN  ',
    password: 'demo1234',
  }));
  assert.equal(status, 200);
  assert.equal(body.profile.id, 'u-md');
});

test('unknown email returns 401', async () => {
  const { status, body } = await read(await post({
    email: 'nobody@formulaic.in',
    password: 'demo1234',
  }));
  assert.equal(status, 401);
  assert.match(body.error, /no account/i);
});

test('wrong password returns 401', async () => {
  const { status, body } = await read(await post({
    email: 'md@formulaic.in',
    password: 'wrong',
  }));
  assert.equal(status, 401);
  assert.match(body.error, /incorrect password/i);
});

test('missing fields return 400', async () => {
  assert.equal((await read(await post({ email: 'md@formulaic.in' }))).status, 400);
  assert.equal((await read(await post({ password: 'demo1234' }))).status, 400);
  assert.equal((await read(await post({ email: '  ', password: 'demo1234' }))).status, 400);
});

test('invalid JSON hits the catch and returns 500', async () => {
  const logged = [];
  const orig = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const { status, body } = await read(await post(null, { raw: '{not-json' }));
    assert.equal(status, 500);
    assert.deepEqual(body, { error: 'Internal server error' });
    assert.equal(logged[0][0], 'LOGIN ERROR:');
    assert.ok(logged[0][1] instanceof Error);
  } finally {
    console.error = orig;
  }
});

test('unexpected authenticate failures return 500 without leaking the cause', async () => {
  const logged = [];
  const orig = console.error;
  const origFetch = globalThis.fetch;
  console.error = (...args) => logged.push(args);
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  process.env.SUPABASE_ANON_KEY = 'test-anon-key';
  globalThis.fetch = async () => { throw new Error('network down'); };
  try {
    const { status, body } = await read(await post({
      email: 'md@formulaic.in',
      password: 'demo1234',
    }));
    assert.equal(status, 500);
    assert.deepEqual(body, { error: 'Internal server error' });
    assert.equal(JSON.stringify(body).includes('network down'), false);
    assert.equal(logged[0][0], 'LOGIN ERROR:');
  } finally {
    console.error = orig;
    globalThis.fetch = origFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  }
});

test('Supabase credentials are forwarded when configured', async () => {
  const origFetch = globalThis.fetch;
  process.env.SUPABASE_URL = 'https://proj.supabase.co/';
  process.env.SUPABASE_ANON_KEY = 'anon-key';
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url).includes('/auth/v1/token')) {
      return new Response(JSON.stringify({
        access_token: 'access-1',
        refresh_token: 'refresh-1',
        expires_in: 3600,
        token_type: 'bearer',
        user: { id: 'uuid-1', email: 'live@formulaic.in', user_metadata: { full_name: 'Live User' } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (String(url).includes('/rest/v1/profiles')) {
      return new Response(JSON.stringify([{
        id: 'uuid-1', full_name: 'Live User', email: 'live@formulaic.in',
        role: 'branch_head', branch_id: 'b-mum', phone: null, is_active: true,
      }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    throw new Error(`unexpected fetch ${url}`);
  };
  try {
    const { status, body } = await read(await post({
      email: 'live@formulaic.in',
      password: 'secret',
    }));
    assert.equal(status, 200);
    assert.equal(body.profile.role, 'branch_head');
    assert.equal(body.session.access_token, 'access-1');
    assert.match(calls[0].url, /grant_type=password/);
    assert.equal(JSON.parse(calls[0].init.body).email, 'live@formulaic.in');
  } finally {
    globalThis.fetch = origFetch;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_ANON_KEY;
  }
});

test('authenticate helper matches the demo MD without going through HTTP', async () => {
  const result = await authenticate('imran@formulaic.in', 'demo1234');
  assert.equal(result.ok, true);
  assert.equal(result.profile.role, 'site_engineer');
});

import { Readable } from 'node:stream';

function nodeReq(method, body) {
  const req = Readable.from([Buffer.from(body ?? '')]);
  req.method = method;
  req.headers = { 'content-type': 'application/json' };
  return req;
}

function nodeRes() {
  return {
    statusCode: 0,
    headers: {},
    body: '',
    setHeader(k, v) { this.headers[k] = v; },
    end(s) { this.body = String(s ?? ''); },
  };
}

test('default Node handler signs in a demo user', async () => {
  const req = await nodeReq('POST', JSON.stringify({ email: 'md@formulaic.in', password: 'demo1234' }));
  const res = nodeRes();
  await handler(req, res);
  assert.equal(res.statusCode, 200);
  assert.equal(JSON.parse(res.body).profile.role, 'managing_director');
});

test('default Node handler uses the same 500 catch', async () => {
  const logged = [];
  const orig = console.error;
  console.error = (...args) => logged.push(args);
  try {
    const req = await nodeReq('POST', '{not-json');
    const res = nodeRes();
    await handler(req, res);
    assert.equal(res.statusCode, 500);
    assert.deepEqual(JSON.parse(res.body), { error: 'Internal server error' });
    assert.equal(logged[0][0], 'LOGIN ERROR:');
  } finally {
    console.error = orig;
  }
});

test('handler serves over HTTP as POST /api/auth/login', async () => {
  const { createServer } = await import('node:http');
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (req.method === 'POST' && url.pathname === '/api/auth/login') {
      const chunks = [];
      for await (const c of req) chunks.push(c);
      const request = new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': req.headers['content-type'] || 'application/json' },
        body: Buffer.concat(chunks),
      });
      const out = await POST(request);
      res.writeHead(out.status, { 'Content-Type': 'application/json' });
      res.end(await out.text());
      return;
    }
    res.writeHead(404);
    res.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'imran@formulaic.in', password: 'demo1234' }),
    });
    const body = await res.json();
    assert.equal(res.status, 200);
    assert.equal(body.profile.role, 'site_engineer');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
