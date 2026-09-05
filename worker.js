export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: cors });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405, cors);
    }
    if (!env.ONESIGNAL_APP_ID || !env.ONESIGNAL_REST_API_KEY) {
      return json({ error: 'Missing ONESIGNAL_APP_ID / ONESIGNAL_REST_API_KEY secrets' }, 500, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: 'Invalid JSON body' }, 400, cors);
    }

    if (url.pathname.endsWith('/schedule-notifications')) {
      return handleSchedule(body, env, cors);
    }
    if (url.pathname.endsWith('/cancel-notifications')) {
      return handleCancel(body, env, cors);
    }
    return json({ error: 'Not found: ' + url.pathname }, 404, cors);
  },
};

async function handleSchedule(body, env, cors) {
  const { playerId, checkpoints } = body || {};
  if (!playerId || !Array.isArray(checkpoints) || checkpoints.length === 0) {
    return json({ error: 'playerId and a non-empty checkpoints array are required' }, 400, cors);
  }

  const results = [];
  for (const cp of checkpoints) {
    if (!cp.title || !cp.sendAfter) continue;
    const payload = {
      app_id: env.ONESIGNAL_APP_ID,
      include_player_ids: [playerId],
      headings: { en: cp.title },
      contents: { en: cp.body || '' },
      send_after: cp.sendAfter,
    };
    try {
      const res = await fetch('https://onesignal.com/api/v1/notifications', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      results.push({ ok: res.ok, id: data.id || null, title: cp.title, raw: data });
    } catch (err) {
      results.push({ ok: false, title: cp.title, error: String(err) });
    }
  }
  return json({ ok: true, results }, 200, cors);
}

async function handleCancel(body, env, cors) {
  const ids = (body && body.ids) || [];
  const results = [];
  for (const id of ids) {
    try {
      const res = await fetch(
        `https://onesignal.com/api/v1/notifications/${id}?app_id=${env.ONESIGNAL_APP_ID}`,
        { method: 'DELETE', headers: { Authorization: `Basic ${env.ONESIGNAL_REST_API_KEY}` } }
      );
      results.push({ id, ok: res.ok });
    } catch (err) {
      results.push({ id, ok: false, error: String(err) });
    }
  }
  return json({ ok: true, results }, 200, cors);
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}
