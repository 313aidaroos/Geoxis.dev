import { test } from 'node:test';
import assert from 'node:assert/strict';
import { authContext } from '../lib/supabaseServer.js';
import provision from '../api/world/provision.js';
import assetsHandler from '../api/assets.js';
import { TOKEN_KEY } from '../src/authClient.js';
import { cixySystemPrompt } from '../lib/core.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status });
const request = { method: 'POST', headers: { authorization: 'Bearer test-session' } };
const makeResponse = () => ({
  statusCode: 200, headers: {}, setHeader(k, v) { this.headers[k] = v; },
  end(body) { this.body = JSON.parse(body); },
});
function backend(t, options = {}) {
  const env = { SUPABASE_URL: 'https://db.example.invalid', SUPABASE_ANON_KEY: 'test-anon',
    SUPABASE_SERVICE_ROLE_KEY: 'test-service', APIXIS_WORLD_KEY: 'test-world-key-at-least-24-chars', APIXIS_WORLD_API: 'https://world.example.invalid' };
  for (const [key, value] of Object.entries(env)) {
    const old = process.env[key]; process.env[key] = value;
    t.after(() => { if (old === undefined) delete process.env[key]; else process.env[key] = old; });
  }
  let user = { id: 'user-1', email: 'ops@example.test', email_confirmed_at: '2026-10-01T00:00:00Z',
    created_at: '2026-10-01T00:00:00Z', app_metadata: { apixis_sub: 'apixis-1' }, user_metadata: { full_name: 'Operator' }, ...options.user };
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, init = {}) => {
    calls.push({ url, init });
    if (url.endsWith('/auth/v1/user')) return json(user);
    if (url.includes('/rest/v1/profiles')) return json([{}]);
    if (url.includes('/rest/v1/tenants?')) return json([{ id: 'tenant-1', name: 'Example', slug: 'example-test' }]);
    if (url.includes('/rest/v1/tenant_memberships')) return json([{}]);
    if (url.includes('/rest/v1/current_asset_positions?')) return json([
      { tenant_id: 'tenant-1', external_id: 'own', latitude: 52, longitude: 4, heading: 0 },
      { tenant_id: 'tenant-2', external_id: 'other', latitude: 52, longitude: 4, heading: 0 },
    ]);
    if (url.endsWith('/api/agent/provision')) return json({ ok: true, agent: { id: 'agent-1', name: 'Operator' } });
    if (url.includes('/auth/v1/admin/users/')) {
      if (options.saveFails) return json({ error: 'unavailable' }, 503);
      user = { ...user, ...JSON.parse(init.body) };
      return json(user);
    }
    throw new Error(`Unexpected request: ${url}`);
  });
  return calls;
}

test('verified Auth metadata is available only when explicitly requested by the server', async t => {
  backend(t);
  const publicContext = await authContext(request);
  assert.equal(publicContext.user.id, 'user-1');
  assert.equal(publicContext.user.email, 'ops@example.test');
  assert.equal(publicContext.user.user_metadata, undefined);
  assert.equal(publicContext.authUser, undefined);
  const internal = await authContext(request, { includeAuthUser: true });
  assert.equal(internal.authUser.app_metadata.apixis_sub, 'apixis-1');
  assert.ok(internal.authUser.created_at);
});

test('new verified accounts provision once, persist metadata, and skip repeated hub calls', async t => {
  const calls = backend(t);
  const first = makeResponse(); await provision(request, first);
  assert.equal(first.statusCode, 200); assert.equal(first.body.status, 'ready');
  const payload = JSON.parse(calls.find(c => c.url.endsWith('/api/agent/provision')).init.body);
  assert.equal(payload.email_verified, true); assert.equal(payload.apixis_sub, 'apixis-1');
  const again = makeResponse(); await provision(request, again);
  assert.equal(again.body.status, 'ready');
  assert.equal(calls.filter(c => c.url.endsWith('/api/agent/provision')).length, 1);
});

test('failed metadata writes do not report successful onboarding', async t => {
  backend(t, { saveFails: true });
  const res = makeResponse(); await provision(request, res);
  assert.equal(res.statusCode, 503); assert.equal(res.body.ok, false);
});

test('unverified accounts cannot provision a world agent', async t => {
  const calls = backend(t, { user: { email_confirmed_at: null, app_metadata: {} } });
  const res = makeResponse(); await provision(request, res);
  assert.equal(res.body.status, 'invite');
  assert.equal(calls.some(c => c.url.endsWith('/api/agent/provision')), false);
});

test('signed-in assets use the tenant and exclude other customer rows', async t => {
  const calls = backend(t);
  const res = makeResponse(); await assetsHandler({ ...request, method: 'GET' }, res);
  assert.deepEqual(res.body.assets.map(a => a.id), ['own']);
  assert.equal(res.body.sources.tenant, 'supabase');
  assert.ok(calls.find(c => c.url.includes('tenant_id=eq.tenant-1')));
});

function browserStorage(t) {
  const original = globalThis.localStorage;
  globalThis.localStorage = { getItem: key => key === TOKEN_KEY ? 'test-session' : null };
  t.after(() => { if (original === undefined) delete globalThis.localStorage; else globalThis.localStorage = original; });
}

test('Cixy receives the source and observation age instead of treating demo assets as real', () => {
  const prompt = cixySystemPrompt({ assets: [{ id: 'demo', source: 'geoxis-fleet', simulated: true, timestamp: '2026-10-05T00:00:00Z' }] });
  assert.match(prompt, /simulated=true/); assert.match(prompt, /observed=2026-10-05/);
  assert.match(prompt, /not real company telemetry/);
});
