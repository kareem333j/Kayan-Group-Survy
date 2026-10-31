// api/status.js — التحقق من حالة الاستطلاع (مفتوح/مغلق) — عام بدون مصادقة
import { kv } from "./_db.js";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    return res.status(200).end();
  }

  try {
    const settings = (await kv.get("survey:settings")) || {};
    const now = new Date();
    let isOpen = true;

    if (settings.isOpen === false) {
      isOpen = false;
    } else if (settings.endDate) {
      const end = new Date(settings.endDate);
      if (now > end) isOpen = false;
    }

    return res.status(200).json({
      ok: true,
      isOpen,
      endDate: settings.endDate || null
    });
  } catch (err) {
    // في حال الخطأ نترك الاستطلاع مفتوحاً لتجنب حجب المستخدمين
    return res.status(200).json({ ok: true, isOpen: true, endDate: null });
  }
}
