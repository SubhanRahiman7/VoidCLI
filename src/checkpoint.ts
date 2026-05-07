import path from "node:path";
import axios from "axios";
import * as cheerio from "cheerio";

type AssetBuckets = {
  css: string[];
  js: string[];
  images: string[];
};

function normalizeAssetUrl(raw: string, baseUrl: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("javascript:") ||
    trimmed.startsWith("mailto:") ||
    trimmed.startsWith("#")
  ) {
    return null;
  }
  try {
    return new URL(trimmed, baseUrl).toString();
  } catch {
    return null;
  }
}

function sanitizeName(input: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]/g, "_");
  return cleaned.length > 0 ? cleaned : "asset";
}

export function extractAssetsFromHtml(html: string, baseUrl: string): AssetBuckets {
  const $ = cheerio.load(html);
  const css = new Set<string>();
  const js = new Set<string>();
  const images = new Set<string>();

  $("link[rel='stylesheet'][href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const absolute = normalizeAssetUrl(href, baseUrl);
    if (absolute) css.add(absolute);
  });

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const absolute = normalizeAssetUrl(src, baseUrl);
    if (absolute) js.add(absolute);
  });

  $("img, source, video, audio, track").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const absolute = normalizeAssetUrl(src, baseUrl);
      if (absolute) images.add(absolute);
    }
    const dataSrc = $(el).attr("data-src") || $(el).attr("data-lazy-src");
    if (dataSrc) {
      const absolute = normalizeAssetUrl(dataSrc, baseUrl);
      if (absolute) images.add(absolute);
    }
    const poster = $(el).attr("poster");
    if (poster) {
      const absolute = normalizeAssetUrl(poster, baseUrl);
      if (absolute) images.add(absolute);
    }
    const srcset = $(el).attr("srcset") || $(el).attr("data-srcset");
    if (srcset) {
      const parts = srcset.split(",");
      for (const part of parts) {
        const url = part.trim().split(/\s+/)[0];
        if (url) {
          const absolute = normalizeAssetUrl(url, baseUrl);
          if (absolute) images.add(absolute);
        }
      }
    }
  });

  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    if (!style) return;
    const urlMatches = style.match(/url\(['"]?([^)'"]+)['"]?\)/gi);
    if (urlMatches) {
      for (const match of urlMatches) {
        const url = match.replace(/url\(['"]?([^)'"]+)['"]?\)/i, "$1");
        const absolute = normalizeAssetUrl(url, baseUrl);
        if (absolute) images.add(absolute);
      }
    }
  });

  return {
    css: Array.from(css),
    js: Array.from(js),
    images: Array.from(images)
  };
}

export function localPathForAsset(assetUrl: string, cloneRoot: string): string {
  const assetRoot = `${cloneRoot}/assets`;
  const parsed = new URL(assetUrl);
  const ext = path.extname(parsed.pathname).toLowerCase();
  const basename = sanitizeName(path.basename(parsed.pathname || "asset"));
  const fallback = `asset_${Buffer.from(assetUrl).toString("base64url").slice(0, 10)}`;

  if (ext === ".css") return `${assetRoot}/css/${basename || `${fallback}.css`}`;
  if (ext === ".js" || ext === ".mjs") return `${assetRoot}/js/${basename || `${fallback}.js`}`;
  
  const isMedia = [".mp4", ".webm", ".ogg", ".mov", ".mp3", ".wav"].includes(ext);
  if (isMedia) return `${assetRoot}/media/${basename || `${fallback}${ext}`}`;

  return `${assetRoot}/images/${basename || `${fallback}.bin`}`;
}

export function rewriteHtmlToLocalAssets(
  html: string,
  assetMap: Record<string, string>,
  cloneRoot: string,
  baseUrl?: string
): string {
  const $ = cheerio.load(html);

  function toLocal(assetUrl: string): string | null {
    const absolute = (() => {
      if (!baseUrl) return assetUrl;
      try {
        return new URL(assetUrl, baseUrl).toString();
      } catch {
        return assetUrl;
      }
    })();
    const mapped = assetMap[absolute] ?? assetMap[assetUrl];
    if (!mapped) return null;
    const normalized = mapped.replace(/\\/g, "/");
    const prefix = `${cloneRoot.replace(/\\/g, "/")}/`;
    return normalized.startsWith(prefix) ? normalized.slice(prefix.length) : normalized;
  }

  $("link[rel='stylesheet'][href]").each((_, el) => {
    const href = $(el).attr("href");
    if (!href) return;
    const local = toLocal(href);
    if (local) $(el).attr("href", local);
  });

  $("script[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (!src) return;
    const local = toLocal(src);
    if (local) $(el).attr("src", local);
  });

  $("img, source, video, audio, track").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      const local = toLocal(src);
      if (local) $(el).attr("src", local);
    }
    const poster = $(el).attr("poster");
    if (poster) {
      const local = toLocal(poster);
      if (local) $(el).attr("poster", local);
    }
    const dataSrc = $(el).attr("data-src");
    if (dataSrc) {
      const local = toLocal(dataSrc);
      if (local) $(el).attr("data-src", local);
    }
    const dataLazySrc = $(el).attr("data-lazy-src");
    if (dataLazySrc) {
      const local = toLocal(dataLazySrc);
      if (local) $(el).attr("data-lazy-src", local);
    }
    const rewriteSrcset = (attrName: string) => {
      const val = $(el).attr(attrName);
      if (!val) return;
      const parts = val.split(",");
      const newParts = parts.map(part => {
        const tokens = part.trim().split(/\s+/);
        const url = tokens[0];
        const rest = tokens.slice(1).join(" ");
        const local = toLocal(url);
        if (local) {
          return rest ? `${local} ${rest}` : local;
        }
        return part;
      });
      $(el).attr(attrName, newParts.join(", "));
    };
    rewriteSrcset("srcset");
    rewriteSrcset("data-srcset");
  });

  $("[style]").each((_, el) => {
    const style = $(el).attr("style");
    if (!style) return;
    const newStyle = style.replace(/url\(['"]?([^)'"]+)['"]?\)/gi, (match, url) => {
      const local = toLocal(url);
      return local ? `url('${local}')` : match;
    });
    $(el).attr("style", newStyle);
  });

  $("script").each((_, el) => {
    const scriptContent = $(el).html() || "";
    if (
      scriptContent.includes("window.location") ||
      scriptContent.includes("top.location") ||
      scriptContent.includes("location.href") ||
      scriptContent.includes("location.replace")
    ) {
      $(el).remove();
    }
  });
  
  $("base").remove();

  return $.html();
}

export async function fetchHomepageHtml(url: string): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Only http/https URLs are allowed");
  }
  const response = await axios.get<string>(url, {
    responseType: "text",
    timeout: 30000,
    maxRedirects: 5
  });
  return response.data;
}

export async function downloadAssetBytes(assetUrl: string): Promise<Buffer> {
  const response = await axios.get<ArrayBuffer>(assetUrl, {
    responseType: "arraybuffer",
    timeout: 30000,
    maxRedirects: 5
  });
  return Buffer.from(response.data);
}
