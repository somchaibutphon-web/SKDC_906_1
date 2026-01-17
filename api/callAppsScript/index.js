// Azure Function: POST /api/callAppsScript
module.exports = async function (context, req) {
  try {
    const body = req.body || {};
    const action = String(body.action || "");
    const data = body.data || {};

    if (!action) {
      context.res = { status: 400, body: { ok: false, message: "Missing action" } };
      return;
    }

    const APPS_SCRIPT_URL = process.env.APPS_SCRIPT_URL;
    const APPS_SCRIPT_SECRET = process.env.APPS_SCRIPT_SECRET;

    if (!APPS_SCRIPT_URL || !APPS_SCRIPT_SECRET) {
      context.res = { status: 500, body: { ok: false, message: "Server not configured" } };
      return;
    }

    const payload = {
      secret: APPS_SCRIPT_SECRET,
      action,
      data
    };

    const r = await fetch(APPS_SCRIPT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const text = await r.text();
    let json;
    try { json = JSON.parse(text); }
    catch { json = { ok: false, message: "Invalid JSON from Apps Script", raw: text }; }

    context.res = {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: json
    };
  } catch (err) {
    context.res = { status: 500, body: { ok: false, message: String(err) } };
  }
};
