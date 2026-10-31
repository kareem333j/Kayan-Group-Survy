// api/settings.js — إدارة إعدادات الاستطلاع (تاريخ الانتهاء وحالة الفتح/الإغلاق)
import { kv, isDbConfigured } from "./_db.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kayan1234";

export const config = { runtime: "nodejs" };

function checkAuth(req) {
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token === ADMIN_PASSWORD;
}

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(200).end();
  }

  // GET — جلب الإعدادات الحالية
  if (req.method === "GET") {
    if (!checkAuth(req)) return res.status(401).json({ error: "unauthorized" });
    try {
      const settings = (await kv.get("survey:settings")) || {};
      return res.status(200).json({
        ok: true,
        settings: {
          isOpen: settings.isOpen !== false,
          endDate: settings.endDate || null
        },
        isDbConfigured
      });
    } catch (err) {
      console.error("settings GET error:", err);
      return res.status(500).json({ error: "server_error" });
    }
  }

  // POST — تحديث الإعدادات
  if (req.method === "POST") {
    if (!checkAuth(req)) return res.status(401).json({ error: "unauthorized" });
    try {
      let body = req.body;
      if (typeof body === "string") {
        try { body = JSON.parse(body); } catch { body = {}; }
      }

      const current = (await kv.get("survey:settings")) || {};
      const updated = {
        ...current,
        ...(body.endDate !== undefined ? { endDate: body.endDate || null } : {}),
        ...(body.isOpen !== undefined ? { isOpen: !!body.isOpen } : {})
      };

      await kv.set("survey:settings", updated);
      return res.status(200).json({
        ok: true,
        settings: {
          isOpen: updated.isOpen !== false,
          endDate: updated.endDate || null
        },
        isDbConfigured
      });
    } catch (err) {
      console.error("settings POST error:", err);
      return res.status(500).json({ error: "server_error" });
    }
  }

  return res.status(405).json({ error: "Method not allowed" });
}
