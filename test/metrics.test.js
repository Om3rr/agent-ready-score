import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bucketRoute,
  isBot,
  referrerHost,
  visitorHash,
  recordVisit,
  readStats,
} from "../dist/metrics.js";
import { handleRequest } from "../dist/http.js";
import { fixture } from "./helpers.js";

function req(path, opts = {}) {
  const headers = new Headers(opts.headers || {});
  if (opts.ua) headers.set("user-agent", opts.ua);
  if (opts.ip) headers.set("cf-connecting-ip", opts.ip);
  if (opts.referer) headers.set("referer", opts.referer);
  return new Request("https://score.example" + path, { ...opts, headers });
}

/** Minimal in-memory stand-in for the D1 statements this module issues. */
function memoryD1() {
  const salts = new Map();
  const requests = new Map();
  const hashes = new Set();
  const uniques = new Map();
  const scans = new Map();
  const badges = new Map();
  const refs = new Map();
  const key = (...p) => p.join("\0");

  function run(sql, args) {
    if (sql.startsWith("INSERT OR IGNORE INTO daily_salts")) {
      if (!salts.has(args[0])) salts.set(args[0], args[1]);
      return 1;
    }
    if (sql.startsWith("INSERT INTO requests_daily")) {
      const k = key(args[0], args[1], args[2]);
      requests.set(k, (requests.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT OR IGNORE INTO visitor_hashes")) {
      const k = key(args[0], args[1], args[2]);
      if (hashes.has(k)) return 0;
      hashes.add(k);
      return 1;
    }
    if (sql.startsWith("INSERT INTO uniques_daily")) {
      const k = key(args[0], args[1]);
      uniques.set(k, (uniques.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO scans_daily")) {
      const k = key(args[0], args[1]);
      const cur = scans.get(k) || { success: 0, fail: 0 };
      if (sql.includes("SET success")) cur.success += 1;
      else if (sql.includes("SET fail")) cur.fail += 1;
      else {
        cur.success += args[2];
        cur.fail += args[3];
      }
      scans.set(k, cur);
      return 1;
    }
    if (sql.startsWith("INSERT INTO badges_daily")) {
      const k = key(args[0], args[1]);
      badges.set(k, (badges.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO referrers_daily")) {
      const k = key(args[0], args[1], args[2]);
      refs.set(k, (refs.get(k) || 0) + 1);
      return 1;
    }
    throw new Error("unhandled run: " + sql);
  }

  function first(sql, args) {
    if (sql.startsWith("SELECT salt FROM daily_salts")) {
      const salt = salts.get(args[0]);
      return salt ? { salt } : null;
    }
    throw new Error("unhandled first: " + sql);
  }

  function all(sql, args) {
    const worker = args[0];
    const since = args[1];
    if (sql.includes("FROM (SELECT day, SUM(count) AS requests")) {
      const days = {};
      for (const [k, count] of requests) {
        const [w, day] = k.split("\0");
        if (w !== worker || day < since) continue;
        days[day] ??= { day, requests: 0, unique_visitors: 0, scans_success: 0, scans_fail: 0, badge_hits: 0 };
        days[day].requests += count;
      }
      for (const [k, count] of uniques) {
        const [w, day] = k.split("\0");
        if (days[day] && w === worker) days[day].unique_visitors = count;
      }
      for (const [k, v] of scans) {
        const [w, day] = k.split("\0");
        if (days[day] && w === worker) {
          days[day].scans_success = v.success;
          days[day].scans_fail = v.fail;
        }
      }
      for (const [k, count] of badges) {
        const [w, day] = k.split("\0");
        if (days[day] && w === worker) days[day].badge_hits = count;
      }
      return { results: Object.values(days).sort((a, b) => a.day.localeCompare(b.day)) };
    }
    if (sql.includes("FROM requests_daily")) {
      const acc = {};
      for (const [k, count] of requests) {
        const [w, day, route] = k.split("\0");
        if (w !== worker || day < since) continue;
        acc[route] = (acc[route] || 0) + count;
      }
      return { results: Object.entries(acc).map(([route, count]) => ({ route, count })).sort((a, b) => b.count - a.count) };
    }
    if (sql.includes("FROM referrers_daily")) {
      const acc = {};
      for (const [k, count] of refs) {
        const [w, day, host] = k.split("\0");
        if (w !== worker || day < since) continue;
        acc[host] = (acc[host] || 0) + count;
      }
      return { results: Object.entries(acc).map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count) };
    }
    throw new Error("unhandled all: " + sql);
  }

  const db = {
    hashes,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            run: async () => ({ success: true, meta: { changes: run(sql, args) } }),
            first: async () => first(sql, args),
            all: async () => all(sql, args),
          };
        },
      };
    },
  };
  return db;
}

describe("metrics helpers", () => {
  it("buckets badge variants and server pages", () => {
    assert.equal(bucketRoute("/badge.svg"), "/badge");
    assert.equal(bucketRoute("/s/mcp.example/path/"), "/s/*");
    assert.equal(bucketRoute("/webhooks/stripe"), "/webhooks/stripe");
  });

  it("skips obvious bots and keeps normal browsers", () => {
    assert.equal(isBot(req("/", { ua: "Mozilla/5.0 Googlebot/2.1" })), true);
    assert.equal(isBot(req("/", { ua: "Mozilla/5.0 (Macintosh) Chrome/120" })), false);
  });

  it("keeps only the referrer host and drops same-host referrers", () => {
    assert.equal(referrerHost(req("/", { referer: "https://github.com/Om3rr/agent-ready-score" })), "github.com");
    assert.equal(referrerHost(req("/", { referer: "https://score.example/docs" })), null);
  });

  it("hashes IP+UA with the daily salt and never returns the raw IP", async () => {
    const h = await visitorHash("salt-a", "1.2.3.4", "Mozilla");
    assert.equal(h.length, 64);
    assert.doesNotMatch(h, /1\.2\.3\.4/);
    const h2 = await visitorHash("salt-b", "1.2.3.4", "Mozilla");
    assert.notEqual(h, h2);
  });
});

describe("metrics recording and /stats", () => {
  it("serves empty public stats when D1 is not bound", async () => {
    const res = await handleRequest(req("/stats"));
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.ok, true);
    assert.equal(data.worker, "agent-ready-score");
    assert.equal(data.totals.requests, 0);
    assert.equal(JSON.stringify(data).includes("1.2.3.4"), false);
    const html = await handleRequest(req("/stats.html"));
    assert.equal(html.status, 200);
    assert.match(html.headers.get("content-type"), /text\/html/);
    assert.match(await html.text(), /Agent-Ready Score/);
  });

  it("counts a scan, a unique visitor, a badge, and a referrer, and skips bots", async () => {
    const db = memoryD1();
    const env = { METRICS: db };
    await recordVisit(env, req("/api/score", { ua: "Mozilla/5.0", ip: "203.0.113.9", referer: "https://github.com/x" }), {
      worker: "agent-ready-score",
      route: "/api/score",
      scan: "success",
    });
    await recordVisit(env, req("/api/score", { ua: "Mozilla/5.0", ip: "203.0.113.9" }), {
      worker: "agent-ready-score",
      route: "/api/score",
      scan: "fail",
    });
    await recordVisit(env, req("/badge.svg?score=80", { ua: "Mozilla/5.0", ip: "203.0.113.10" }), {
      worker: "agent-ready-score",
      route: "/badge.svg",
      badge: true,
    });
    await recordVisit(env, req("/", { ua: "Googlebot/2.1", ip: "203.0.113.11" }), {
      worker: "agent-ready-score",
      route: "/",
    });
    const stats = await readStats(env, "agent-ready-score");
    assert.equal(stats.totals.requests, 3);
    assert.equal(stats.totals.unique_visitors, 2);
    assert.equal(stats.totals.scans.success, 1);
    assert.equal(stats.totals.scans.fail, 1);
    assert.equal(stats.totals.badge_hits, 1);
    assert.equal(stats.top_referrers[0].host, "github.com");
    assert.equal(db.hashes.size, 2);
    for (const k of db.hashes) assert.doesNotMatch(k, /203\.0\.113/);
  });

  it("records through handleRequest via waitUntil", async () => {
    const db = memoryD1();
    const pending = [];
    const ctx = { waitUntil: (p) => pending.push(p) };
    const res = await handleRequest(
      req("/api/score", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "cf-connecting-ip": "198.51.100.4" },
        body: JSON.stringify({ spec: fixture("good.yaml") }),
      }),
      { METRICS: db },
      ctx,
    );
    assert.equal(res.status, 200);
    await Promise.all(pending);
    const stats = await readStats({ METRICS: db }, "agent-ready-score");
    assert.equal(stats.totals.scans.success, 1);
    assert.ok(stats.routes.some((r) => r.route === "/api/score"));
  });
});
