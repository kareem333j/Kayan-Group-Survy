// api/_db.js — طبقة الاتصال بقاعدة البيانات (Vercel KV / Upstash Redis / Fallback)
import { Redis } from "@upstash/redis";

// البحث الذكي الشامل عن بيانات اتصال Redis أياً كانت التسمية أو البادئة
function findRedisCredentials() {
  const env = process.env;

  // 1. فحص شامل للبحث عن أي متغير يحتوي على نطاق upstash أو vercel-storage
  for (const [key, val] of Object.entries(env)) {
    if (typeof val === "string" && (val.includes(".upstash.io") || val.includes(".vercel-storage.com"))) {
      // إذا كان الرابط REST مباشر (https://)
      if (val.startsWith("https://")) {
        const prefix = key.replace(/(_REST_API_URL|_URL)$/, "");
        const token =
          env[`${prefix}_REST_API_TOKEN`] ||
          env[`${prefix}_TOKEN`] ||
          env[`${prefix}_REST_API_READ_ONLY_TOKEN`] ||
          env["STORAGE_REST_API_TOKEN"] ||
          env["STORAGE_TOKEN"] ||
          env["UPSTASH_REDIS_REST_TOKEN"] ||
          env["KV_REST_API_TOKEN"];

        if (token) {
          return { url: val, token, detectedKey: key };
        }
      }

      // إذا كان الرابط بصيغة TCP Redis (rediss://default:token@host:6379)
      if (val.startsWith("redis://") || val.startsWith("rediss://")) {
        try {
          const parsed = new URL(val);
          if (parsed.hostname && parsed.password) {
            return {
              url: `https://${parsed.hostname}`,
              token: parsed.password,
              detectedKey: `${key} (parsed from connection string)`
            };
          }
        } catch (e) {}
      }
    }
  }

  // 2. فحص البوادئ الشائعة (STORAGE_*, UPSTASH_*, KV_*, إلخ)
  const prefixes = [
    "STORAGE",
    "STORAGE_UPSTASH_REDIS",
    "STORAGE_KV",
    "UPSTASH_REDIS",
    "KV",
    "UPSTASH_KV",
    "REDIS"
  ];

  for (const p of prefixes) {
    const rawUrl = env[`${p}_REST_API_URL`] || env[`${p}_URL`];
    const rawToken = env[`${p}_REST_API_TOKEN`] || env[`${p}_TOKEN`];

    if (rawUrl && rawToken && typeof rawUrl === "string" && rawUrl.startsWith("https://")) {
      return { url: rawUrl, token: rawToken, detectedKey: p };
    }

    if (rawUrl && typeof rawUrl === "string" && (rawUrl.startsWith("redis://") || rawUrl.startsWith("rediss://"))) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.hostname && parsed.password) {
          return {
            url: `https://${parsed.hostname}`,
            token: parsed.password,
            detectedKey: `${p}_URL (parsed)`
          };
        }
      } catch (e) {}
    }
  }

  // 3. فحص أي مفتاح ينتهي بـ _REST_API_URL
  const urlKey = Object.keys(env).find(k => k.endsWith("_REST_API_URL"));
  if (urlKey) {
    const tokenKey = urlKey.replace(/_REST_API_URL$/, "_REST_API_TOKEN");
    if (env[tokenKey]) return { url: env[urlKey], token: env[tokenKey], detectedKey: urlKey };
  }

  return { url: null, token: null, detectedKey: null };
}

const { url, token, detectedKey } = findRedisCredentials();

export const isDbConfigured = Boolean(url && token);

let dbClient = null;

if (isDbConfigured) {
  try {
    dbClient = new Redis({ url, token });
  } catch (err) {
    console.error("Failed to initialize Redis client:", err);
  }
}

// مخزن ذاكرة احتياطي (In-Memory Fallback) للاختبار المحلي
class MemoryStore {
  constructor() {
    this.store = new Map();
    this.sortedSets = new Map();
  }
  async get(key) {
    return this.store.get(key) || null;
  }
  async set(key, val) {
    this.store.set(key, val);
    return "OK";
  }
  async zadd(key, { score, member }) {
    if (!this.sortedSets.has(key)) this.sortedSets.set(key, []);
    const arr = this.sortedSets.get(key);
    arr.push({ score, member });
    arr.sort((a, b) => a.score - b.score);
    return 1;
  }
  async zrange(key, start, stop) {
    const arr = this.sortedSets.get(key) || [];
    const members = arr.map((x) => x.member);
    if (stop === -1) return members.slice(start);
    return members.slice(start, stop + 1);
  }
  async mget(...keys) {
    return keys.map((k) => this.store.get(k) || null);
  }
}

const globalStore = globalThis;
if (!globalStore.__surveyMemoryStore) {
  globalStore.__surveyMemoryStore = new MemoryStore();
}

export const kv = dbClient || globalStore.__surveyMemoryStore;

export const dbInfo = {
  isConfigured: isDbConfigured,
  detectedKey: detectedKey || "none",
  matchedKeys: Object.keys(process.env).filter(k =>
    k.includes("STORAGE") || k.includes("REDIS") || k.includes("KV") || k.includes("URL") || k.includes("TOKEN")
  )
};
