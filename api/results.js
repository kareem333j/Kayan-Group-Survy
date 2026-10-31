import { kv, isDbConfigured, dbInfo } from "./_db.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kayan1234";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(200).end();
  }

  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // التحقق من كلمة المرور
  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    // جلب جميع معرفات الردود (مرتبة زمنياً)
    const ids = await kv.zrange("survey:index", 0, -1);

    // جلب البيانات لكل رد
    let rows = [];
    if (ids && ids.length > 0) {
      const items = await kv.mget(...ids);
      rows = items.filter(Boolean);
    }

    // خلط الردود عشوائياً للحفاظ على السرية
    for (let i = rows.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [rows[i], rows[j]] = [rows[j], rows[i]];
    }

    // إزالة الطوابع الزمنية من النتائج لحماية هوية المشاركين
    const clean = rows.map(r => {
      const { ts, ...rest } = r;
      return rest;
    });

    return res.status(200).json({
      ok: true,
      rows: clean,
      total: clean.length,
      isDbConfigured,
      dbInfo
    });
  } catch (err) {
    console.error("results error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
