// api/delete.js — حذف رد محدد للمسؤول
import { kv } from "./_db.js";

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Kayan1234";

export const config = { runtime: "nodejs" };

export default async function handler(req, res) {
  if (req.method === "OPTIONS") {
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "DELETE") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const auth = req.headers["authorization"] || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (token !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "unauthorized" });
  }

  try {
    let id = req.query.id;
    if (!id && req.body) {
      let b = req.body;
      if (typeof b === "string") {
        try { b = JSON.parse(b); } catch {}
      }
      id = b && b.id;
    }

    if (!id || typeof id !== "string") {
      return res.status(400).json({ error: "missing_id" });
    }

    await kv.del(id);
    await kv.zrem("survey:index", id);

    return res.status(200).json({ ok: true, deletedId: id });
  } catch (err) {
    console.error("delete error:", err);
    return res.status(500).json({ error: "server_error" });
  }
}
