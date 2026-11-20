import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  bucketRoute,
  isBot,
  referrerHost,
  visitorHash,
  recordVisit,
  readStats,
  handleEvent,
  handleWaitlist,
  isOutsideScan,
  pepperedIpHash,
  classifyTraffic,
  isInternalRequest,
  normalizeRef,
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
  const events = new Map();
  const rates = new Map();
  const waitlist = new Map();
  const outside = new Map();
  const crawlers = new Map();
  const internal = new Map();
  const eventProps = new Map();
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
    if (sql.startsWith("INSERT INTO events_daily")) {
      const k = key(args[0], args[1], args[2]);
      events.set(k, (events.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO event_rate")) {
      const k = key(args[0], args[1], args[2]);
      rates.set(k, (rates.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT OR IGNORE INTO waitlist")) {
      const k = key(args[0], args[1]); // email, product
      if (waitlist.has(k)) return 0;
      waitlist.set(k, { email: args[0], product: args[1], created_at: args[2], ref_host: args[3] });
      return 1;
    }
    if (sql.startsWith("INSERT INTO outside_scans_daily")) {
      const k = key(args[0], args[1]);
      outside.set(k, (outside.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO crawlers_daily")) {
      const k = key(args[0], args[1], args[2]);
      crawlers.set(k, (crawlers.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO internal_daily")) {
      const k = key(args[0], args[1]);
      internal.set(k, (internal.get(k) || 0) + 1);
      return 1;
    }
    if (sql.startsWith("INSERT INTO event_props_daily")) {
      const k = key(args[0], args[1], args[2], "tier", args[3]);
      eventProps.set(k, (eventProps.get(k) || 0) + 1);
      return 1;
    }
    throw new Error("unhandled run: " + sql);

  }

  function first(sql, args) {
    if (sql.startsWith("SELECT salt FROM daily_salts")) {
      const salt = salts.get(args[0]);
      return salt ? { salt } : null;
    }
    if (sql.startsWith("SELECT count FROM event_rate")) {
      const n = rates.get(key(args[0], args[1], args[2])) || 0;
      return { count: n };
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM waitlist WHERE product = ? AND created_at")) {
      return { count: [...waitlist.values()].filter((w) => w.product === args[0]).length };
    }
    if (sql.startsWith("SELECT COUNT(*) AS count FROM waitlist WHERE product = ?")) {
      return { count: [...waitlist.values()].filter((w) => w.product === args[0]).length };
    }
    if (sql.includes("FROM internal_daily")) {
      const worker = args[0], since = args[1];
      let n = 0;
      for (const [k, count] of internal) {
        const [w, day] = k.split("\0");
        if (w === worker && day >= since) n += count;
      }
      return { count: n };
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
        days[day] ??= { day, requests: 0, unique_visitors: 0, scans_success: 0, scans_fail: 0, badge_hits: 0, outside_scans: 0 };
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
      for (const [k, count] of outside) {
        const [w, day] = k.split("\0");
        if (days[day] && w === worker) days[day].outside_scans = count;
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
    if (sql.includes("FROM crawlers_daily")) {
      const acc = {};
      for (const [k, count] of crawlers) {
        const [w, day, crawler] = k.split("\0");
        if (w !== worker || day < since) continue;
        acc[crawler] = (acc[crawler] || 0) + count;
      }
      return { results: Object.entries(acc).map(([crawler, count]) => ({ crawler, count })) };
    }
    if (sql.includes("FROM event_props_daily")) {
      const acc = {};
      for (const [k, count] of eventProps) {
        const [w, day, event, prop, value] = k.split("\0");
        if (w !== worker || day < since) continue;
        acc[value] = (acc[value] || 0) + count;
      }
      return { results: Object.entries(acc).map(([value, count]) => ({ value, count })) };
    }
    if (sql.includes("FROM events_daily")) {
      const acc = {};
      for (const [k, count] of events) {
        const [w, day, event] = k.split("\0");
        if (w !== worker || day < since) continue;
        acc[event] = (acc[event] || 0) + count;
      }
      return { results: Object.entries(acc).map(([event, count]) => ({ event, count })) };
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
    waitlist,
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

describe("events, waitlist and outside scans", () => {
  it("rejects unknown events and rate-limits /api/event", async () => {
    const db = memoryD1();
    const env = { METRICS: db };
    const unknown = await handleEvent(req("/api/event", { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "cf-connecting-ip": "198.51.100.10" }, body: JSON.stringify({ event: "not_a_real_event" }) }), env, "agent-ready-score");
    assert.equal(unknown.status, 400);
    const ok = await handleEvent(req("/api/event", { method: "POST", headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "cf-connecting-ip": "198.51.100.10" }, body: JSON.stringify({ event: "landing_view", path: "/", ref: "https://github.com/x" }) }), env, "agent-ready-score");
    assert.ok([200, 204].includes(ok.status));
    const stats = await readStats(env, "agent-ready-score");
    assert.equal(stats.totals.events.landing_view, 1);
    assert.equal(JSON.stringify(stats).includes("198.51.100"), false);
  });

  it("stores waitlist emails privately, dedupes, and only counts them in /stats", async () => {
    const db = memoryD1();
    const env = { METRICS: db };
    const headers = { "content-type": "application/json", "user-agent": "Mozilla/5.0", "cf-connecting-ip": "198.51.100.20", referer: "https://github.com/Om3rr/agent-ready-score" };
    const post = (body) => handleWaitlist(req("/api/waitlist", { method: "POST", headers, body: JSON.stringify(body) }), env, "agent-ready-score");
    const a = await post({ email: "Ada@Example.com", website: "" });
    assert.equal(a.status, 200);
    const first = await a.json();
    assert.equal(first.ok, true);
    assert.equal(first.already, false);
    const b = await post({ email: "ada@example.com" });
    const second = await b.json();
    assert.equal(second.already, true);
    const honey = await post({ email: "bot@example.com", website: "http://spam.test" });
    assert.equal((await honey.json()).ok, true);
    assert.equal(db.waitlist.size, 1);
    const stats = await readStats(env, "agent-ready-score");
    assert.equal(stats.totals.waitlist_signups, 1);
    assert.equal(stats.totals.events.pro_waitlist_signup, 1);
    const blob = JSON.stringify(stats);
    assert.doesNotMatch(blob, /ada@example.com/i);
    assert.doesNotMatch(blob, /bot@example.com/i);
  });

  it("counts an outside scan and skips our test targets and test refs", async () => {
    const outside = await isOutsideScan(
      req("/", { ua: "Mozilla/5.0", ip: "203.0.113.50", referer: "https://news.ycombinator.com/" }),
      "https://mcp.athena.example/mcp",
    );
    assert.equal(outside, true);
    const ours = await isOutsideScan(
      req("/", { ua: "Mozilla/5.0", ip: "203.0.113.50" }),
      "https://mcp.context7.com/mcp",
    );
    assert.equal(ours, false);
    const testRef = await isOutsideScan(
      req("/", { ua: "Mozilla/5.0", ip: "203.0.113.50", referer: "https://landing-probe.example/" }),
      "https://mcp.athena.example/mcp",
    );
    assert.equal(testRef, false);
    const h = await pepperedIpHash("203.0.113.50");
    assert.equal(h.length, 64);
    assert.doesNotMatch(h, /203\.0\.113\.50/);
  });
});

describe("excluded traffic, price_click and utm refs", () => {
  it("classifies AI crawlers, generic bots, internal and humans", () => {
    assert.equal(classifyTraffic(req("/", { ua: "Mozilla/5.0 GPTBot/1.0" })).class, "ai_crawler");
    assert.equal(classifyTraffic(req("/", { ua: "Mozilla/5.0 GPTBot/1.0" })).crawler, "GPTBot");
    assert.equal(classifyTraffic(req("/", { ua: "ClaudeBot/1.0" })).crawler, "ClaudeBot");
    assert.equal(classifyTraffic(req("/", { ua: "PerplexityBot/1.0" })).crawler, "PerplexityBot");
    assert.equal(classifyTraffic(req("/", { ua: "OAI-SearchBot/1.0" })).crawler, "OAI-SearchBot");
    assert.equal(classifyTraffic(req("/", { ua: "Google-Extended" })).crawler, "Google-Extended");
    assert.equal(classifyTraffic(req("/", { ua: "CCBot/2.0" })).crawler, "CCBot");
    assert.equal(classifyTraffic(req("/", { ua: "Mozilla/5.0 Googlebot/2.1" })).class, "bot");
    assert.equal(classifyTraffic(req("/", { ua: "curl/8.5.0" })).class, "internal");
    assert.equal(classifyTraffic(req("/", { ua: "node-fetch/3.0" })).class, "internal");
    assert.equal(isInternalRequest(req("/", { ua: "Mozilla/5.0", headers: { "x-studio-internal": "1" } })), true);
    assert.equal(classifyTraffic(req("/", { ua: "studio-agent/1.0" })).class, "internal");
    assert.equal(classifyTraffic(req("/", { ua: "GitHub-Actions agent" })).class, "internal");
    assert.equal(classifyTraffic(req("/", { ua: "Mozilla/5.0 (Macintosh) Chrome/120" })).class, "human");
  });

  it("keeps AI crawlers and internal hits out of visitor and scan totals", async () => {
    const db = memoryD1();
    const env = { METRICS: db };
    await recordVisit(env, req("/api/score", { ua: "GPTBot/1.0", ip: "203.0.113.80" }), {
      worker: "agent-ready-score",
      route: "/api/score",
      scan: "success",
      targetUrl: "https://api.partner.example/openapi.json",
    });
    await recordVisit(env, req("/api/score", { ua: "curl/8.5.0", ip: "203.0.113.81" }), {
      worker: "agent-ready-score",
      route: "/api/score",
      scan: "success",
      targetUrl: "https://api.partner.example/openapi.json",
    });
    await recordVisit(env, req("/", { headers: { "user-agent": "Mozilla/5.0", "cf-connecting-ip": "203.0.113.82", "x-studio-internal": "1" } }), {
      worker: "agent-ready-score",
      route: "/",
    });
    const stats = await readStats(env, "agent-ready-score");
    assert.equal(stats.totals.requests, 0);
    assert.equal(stats.totals.unique_visitors, 0);
    assert.equal(stats.totals.scans.success, 0);
    assert.equal(stats.totals.outside_scans, 0);
    assert.equal(stats.totals.ai_crawlers.GPTBot, 1);
    assert.equal(stats.totals.internal_hits, 2);
  });

  it("accepts price_click with props.tier and stores utm refs as-is", async () => {
    const db = memoryD1();
    const env = { METRICS: db };
    const res = await handleEvent(
      req("/api/event", {
        method: "POST",
        headers: { "content-type": "application/json", "user-agent": "Mozilla/5.0", "cf-connecting-ip": "198.51.100.30" },
        body: JSON.stringify({ event: "price_click", props: { tier: "pro" }, ref: "utm:twitter/social/launch" }),
      }),
      env,
      "agent-ready-score",
    );
    assert.ok([200, 204].includes(res.status));
    const stats = await readStats(env, "agent-ready-score");
    assert.equal(stats.totals.events.price_click, 1);
    assert.equal(stats.totals.price_click_tiers.pro, 1);
    assert.ok(stats.top_referrers.some((r) => r.host === "utm:twitter/social/launch"));
    assert.equal(normalizeRef("utm:twitter/social/launch"), "utm:twitter/social/launch");
  });
});
