import test from "node:test";
import assert from "node:assert/strict";
import { extractAssetsFromHtml, rewriteHtmlToLocalAssets } from "../src/checkpoint.js";

test("extractAssetsFromHtml resolves homepage assets from root and relative URLs", () => {
  const html = `<!doctype html><html><head>
    <link rel="stylesheet" href="/styles/main.css">
    <script src="js/app.js"></script>
  </head><body>
    <img src="/images/logo.png" />
  </body></html>`;

  const assets = extractAssetsFromHtml(html, "https://example.com");
  assert.equal(assets.css[0], "https://example.com/styles/main.css");
  assert.equal(assets.js[0], "https://example.com/js/app.js");
  assert.equal(assets.images[0], "https://example.com/images/logo.png");
});

test("rewriteHtmlToLocalAssets rewrites links to generated assets directory", () => {
  const html = `<!doctype html><html><head>
    <link rel="stylesheet" href="https://example.com/styles/main.css">
    <script src="https://example.com/js/app.js"></script>
  </head><body>
    <img src="https://example.com/images/logo.png" />
  </body></html>`;

  const rewritten = rewriteHtmlToLocalAssets(
    html,
    {
      "https://example.com/styles/main.css": "generated/scaler-academy-clone/assets/css/main.css",
      "https://example.com/js/app.js": "generated/scaler-academy-clone/assets/js/app.js",
      "https://example.com/images/logo.png": "generated/scaler-academy-clone/assets/images/logo.png"
    },
    "generated/scaler-academy-clone"
  );

  assert.match(rewritten, /href="assets\/css\/main\.css"/);
  assert.match(rewritten, /src="assets\/js\/app\.js"/);
  assert.match(rewritten, /src="assets\/images\/logo\.png"/);
});
