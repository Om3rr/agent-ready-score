import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { badgeSvg, shieldsEndpoint, scoreColor, scoreHex } from "../dist/index.js";

describe("badge", () => {
  it("uses green at 90 and above", () => {
    assert.equal(scoreColor(90), "brightgreen");
    assert.equal(scoreColor(100), "brightgreen");
    assert.equal(scoreHex(90), "#3fb950");
  });

  it("uses yellow from 70 to 89", () => {
    assert.equal(scoreColor(70), "yellow");
    assert.equal(scoreColor(89), "yellow");
    assert.equal(scoreHex(70), "#d29922");
  });

  it("uses red below 70", () => {
    assert.equal(scoreColor(69), "red");
    assert.equal(scoreColor(0), "red");
  });

  it("uses grey for missing scores", () => {
    assert.equal(scoreColor(null), "lightgrey");
    assert.equal(scoreColor(undefined), "lightgrey");
    assert.equal(scoreHex(null), "#9f9f9f");
  });

  it("emits Shields endpoint JSON", () => {
    const j = shieldsEndpoint(82);
    assert.equal(j.schemaVersion, 1);
    assert.equal(j.label, "agent-ready");
    assert.equal(j.message, "82");
    assert.equal(j.color, "yellow");
  });

  it("renders an SVG with the score and label", () => {
    const svg = badgeSvg(95);
    assert.match(svg, /^<svg /);
    assert.match(svg, /agent-ready/);
    assert.match(svg, />95</);
    assert.match(svg, /#3fb950/);
    assert.match(svg, /aria-label="agent-ready: 95"/);
  });

  it("escapes XML in a custom label", () => {
    const svg = badgeSvg(10, 'foo&<>"');
    assert.match(svg, /foo&amp;&lt;&gt;&quot;/);
    assert.doesNotMatch(svg, /foo&<>"/);
  });
});

describe("badge contrast", () => {
  it("uses dark score text on green and yellow fills, white on red", async () => {
    const { badgeSvg: svg, scoreTextHex } = await import("../dist/index.js");
    assert.equal(scoreTextHex(95), "#0d1117");
    assert.equal(scoreTextHex(82), "#0d1117");
    assert.equal(scoreTextHex(40), "#ffffff");
    assert.match(svg(82), /fill="#0d1117" font-weight="bold">82</);
    assert.match(svg(40), /fill="#ffffff" font-weight="bold">40</);
  });
});
