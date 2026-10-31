// api/_db.js — طبقة الاتصال بقاعدة البيانات (Vercel KV / Upstash Redis / Fallback)
import { Redis } from "@upstash/redis";

// البحث التلقائي عن متغيرات الاتصال (STORAGE_*, KV_*, UPSTASH_*, أو أي بادئة مخصصة)
function findRedisCredentials() {
  const prefixes = ["STORAGE", "UPSTASH_REDIS", "KV", "UPSTASH_KV", "REDIS"];
  for (const p of prefixes) {
    const url = process.env[`${p}_REST_API_URL`] || process.env[`${p}_URL`];
    const token = process.env[`${p}_REST_API_TOKEN`] || process.env[`${p}_TOKEN`];
    if (url && token) return { url, token };
  }
  // فحص ديناميكي شامل لجميع متغيرات البيئة
  const envKeys = Object.keys(process.env);
  const urlKey = envKeys.find(k => k.endsWith("_REST_API_URL") || (k.includes("REDIS") && k.endsWith("_URL")));
  if (urlKey) {
    const p = urlKey.replace(/_REST_API_URL$/, "").replace(/_URL$/, "");
    const tokenKey = envKeys.find(k => k === `${p}_REST_API_TOKEN` || k === `${p}_TOKEN`);
    if (tokenKey && process.env[urlKey] && process.env[tokenKey]) {
      return { url: process.env[urlKey], token: process.env[tokenKey] };
    }
  }
  return { url: null, token: null };
}

const { url, token } = findRedisCredentials();

export const isDbConfigured = Boolean(url && token);

let dbClient = null;

if (isDbConfigured) {
  try {
    dbClient = new Redis({ url, token });
  } catch (err) {
    console.error("Failed to initialize Redis client:", err);
  }
}

// مخزن ذاكرة احتياطي (In-Memory Fallback) للاختبار المحلي والتطوير في حال عدم ربط قاعدة البيانات
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
