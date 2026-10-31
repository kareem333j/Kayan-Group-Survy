// api/submit.js — استقبال ردود الاستطلاع وحفظها في قاعدة البيانات
import { kv } from "./_db.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  // CORS preflight
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    // التحقق من أن الاستطلاع لا يزال مفتوحاً
    const settings = (await kv.get("survey:settings")) || {};
    if (settings.isOpen === false) {
      return res.status(403).json({ error: "survey_closed", message: "الاستطلاع مغلق حالياً من قِبل الإدارة" });
    }
    if (settings.endDate) {
      const now = new Date();
      const end = new Date(settings.endDate);
      if (now > end) {
        return res.status(403).json({ error: "survey_closed", message: "انتهت فترة الاستطلاع المحددة" });
      }
    }

    // قراءة البيانات
    let body = req.body;
    if (typeof body === "string") {
      try { body = JSON.parse(body); } catch { body = {}; }
    }

    // التحقق من البيانات الأساسية
    if (!body || typeof body !== "object") {
      return res.status(400).json({ error: "invalid_data" });
    }

    // تنظيف البيانات (إزالة أي بيانات تعريفية وحماية الخصوصية)
    const clean = {
      comfort: Array.isArray(body.comfort) ? body.comfort.filter(x => typeof x === "string").slice(0, 10) : [],
      comfort_text: String(body.comfort_text || "").trim().slice(0, 1000),
      comm: String(body.comm || "").trim().slice(0, 100),
      obstacles: Array.isArray(body.obstacles) ? body.obstacles.filter(x => typeof x === "string").slice(0, 10) : [],
      obstacles_text: String(body.obstacles_text || "").trim().slice(0, 1000),
      support: Math.min(5, Math.max(0, parseInt(body.support, 10) || 0)),
      idea: String(body.idea || "").trim().slice(0, 2000),
      criticism: String(body.criticism || "").trim().slice(0, 5000),
      ts: Date.now()
    };

    // حفظ الرد في KV
    const id = `resp:${clean.ts}:${Math.random().toString(36).slice(2, 8)}`;
    await kv.set(id, clean);
    await kv.zadd("survey:index", { score: clean.ts, member: id });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("submit error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
