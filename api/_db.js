// api/_db.js — طبقة الاتصال بقاعدة البيانات (Vercel KV / Upstash Redis / Fallback)
import { Redis } from "@upstash/redis";

// التحقق من متغيرات البيئة الخاصة بـ Vercel KV أو Upstash Redis
const url =
  process.env.KV_REST_API_URL ||
  process.env.UPSTASH_REDIS_REST_URL;

const token =
  process.env.KV_REST_API_TOKEN ||
  process.env.UPSTASH_REDIS_REST_TOKEN;

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
