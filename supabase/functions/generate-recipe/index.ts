// Supabase Edge Function — YouTube link → personalized recipe (schema v3)
// POST { url, servings?, budget? }  → generates recipe via OpenAI, caches it
// POST { access_key }               → returns a previously generated recipe
//
// Secrets required (either one — Mistral is preferred if both set):
//   supabase secrets set MISTRAL_API_KEY=...   (free tier: console.mistral.ai)
//   supabase secrets set OPENAI_API_KEY=sk-...
// (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are auto-injected)

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const RATE_LIMIT_PER_DAY = 10;
const MAX_TRANSCRIPT_CHARS = 14000;
// 프롬프트를 고치면 이 날짜를 올려서 이전 캐시를 무시 (재생성 유도)
const PROMPT_EPOCH = "2026-06-10T16:30:00Z";

// LLM provider — Mistral (free tier) preferred, OpenAI fallback
function getLLM() {
  const mistralKey = Deno.env.get("MISTRAL_API_KEY");
  if (mistralKey) {
    return {
      url: "https://api.mistral.ai/v1/chat/completions",
      key: mistralKey,
      model: "mistral-small-latest",
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    key: Deno.env.get("OPENAI_API_KEY"),
    model: "gpt-4o-mini",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

// ── YouTube helpers ──────────────────────────────────────────────────────────

function extractVideoId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

interface VideoInfo {
  title: string;
  author: string;
  description: string;
  transcript: string;
}

async function fetchVideoInfo(videoId: string): Promise<VideoInfo> {
  // Innertube player API (ANDROID client) — works reliably from servers,
  // returns videoDetails + caption tracks without signature ceremony.
  let player: any = null;
  try {
    const resp = await fetch(
      "https://www.youtube.com/youtubei/v1/player?prettyPrint=false",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "User-Agent": "com.google.android.youtube/20.10.38 (Linux; U; Android 14) gzip",
        },
        body: JSON.stringify({
          videoId,
          context: {
            client: {
              clientName: "ANDROID",
              clientVersion: "20.10.38",
              androidSdkVersion: 34,
              hl: "en",
            },
          },
        }),
      },
    );
    if (resp.ok) player = await resp.json();
  } catch (_) {}

  let details = player?.videoDetails || {};
  let title = details.title || "";
  let author = details.author || "";
  const description = (details.shortDescription || "").slice(0, 4000);

  // Fallback: oEmbed for title/author (no captions, but better than nothing)
  if (!title) {
    try {
      const oe = await fetch(
        `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
      );
      if (oe.ok) {
        const data = await oe.json();
        title = data.title || "";
        author = data.author_name || "";
      }
    } catch (_) {}
  }

  // Captions
  let transcript = "";
  const tracks =
    player?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
  if (tracks.length > 0) {
    const pick =
      tracks.find((t: any) => t.languageCode?.startsWith("en")) ||
      tracks.find((t: any) => t.languageCode?.startsWith("ko")) ||
      tracks[0];
    try {
      const capResp = await fetch(`${pick.baseUrl}&fmt=json3`);
      if (capResp.ok) {
        const cap = await capResp.json();
        transcript = (cap.events || [])
          .flatMap((e: any) => (e.segs || []).map((s: any) => s.utf8 || ""))
          .join("")
          .replace(/\n+/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, MAX_TRANSCRIPT_CHARS);
      }
    } catch (_) {}
  }

  return { title, author, description, transcript };
}

// ── OpenAI ───────────────────────────────────────────────────────────────────

function buildPrompt(info: VideoInfo, servings: number, budget: number | null) {
  const budgetLine = budget
    ? `The user's grocery budget for the items they need to buy is about $${budget}. Prefer cheap, widely available ingredients and suggest budget swaps in notes where it helps.`
    : `Keep it cheap — this is a budget-cooking site (the "$14 rule").`;

  return `You convert cooking videos into structured recipe JSON for a budget-cooking website.

VIDEO TITLE: ${info.title}
CREATOR: ${info.author}
DESCRIPTION: ${info.description || "(none)"}
TRANSCRIPT: ${info.transcript || "(no captions available — infer carefully from title and description)"}

Generate a recipe scaled to exactly ${servings} servings. ${budgetLine}

Respond with ONLY a JSON object in this exact shape (all text in English):
{
  "name": "short dish name",
  "tagline": "one punchy sentence: what it is + why it's cheaper at home",
  "emoji": "single food emoji",
  "tags": ["3-6 lowercase tags"],
  "prep_time_min": int, "cook_time_min": int, "total_time_min": int,
  "difficulty": "easy" | "medium" | "hard",
  "base_servings": ${servings},
  "calories_per_serving": int or null,
  "macros_per_serving": {"protein_g": int, "carbs_g": int, "fat_g": int} or null,
  "restaurant_price": {"amount": int, "where": "typical restaurant/chain that sells this", "context": "one sentence"},
  "home_price": {"amount_low": int, "amount_high": int, "unit": "per serving", "savings_pct_low": int, "savings_pct_high": int},
  "why_this_works": "1-2 sentences",
  "ingredients": [
    {"id": "ing_snake_case", "name": "Ingredient name", "qty": number, "unit": "cup/tbsp/oz/etc",
     "type": "pantry" | "fresh",
     "amazon_search": "search query returning this exact product in a SMALL budget-friendly size (e.g. 'vanilla whey protein powder 1 lb'). NEVER use the words 'bulk' or 'wholesale' or sizes over 2 lb. If the video names a specific brand, include it.",
     "asin": null, "note": "optional tip or budget swap, else null"}
  ],
  "tools": [],
  "instructions": [
    {"id": "step_1", "title": "short title", "content": "clear instruction with quantities",
     "timer_seconds": int or null, "uses_ingredients": ["ing_ids"]}
  ],
  "pro_tips": ["2-4 tips"],
  "variations": [{"name": "...", "change": "..."}],
  "background": "1-2 sentences about the dish/video"
}

Rules:
- qty values must be scaled for ${servings} servings.
- type "fresh" = produce/dairy/meat (Amazon Fresh), "pantry" = shelf-stable (regular Amazon).
- No duplicate ingredients — if the same ingredient is used in multiple steps (e.g. vanilla in dough AND glaze), list it ONCE with the total qty.
- If the video is clearly NOT a cooking/recipe video, respond with {"error": "not_a_recipe"}.`;
}

async function callLLM(prompt: string) {
  const llm = getLLM();
  const resp = await fetch(llm.url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${llm.key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: llm.model,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    throw new Error(`LLM ${resp.status}: ${t.slice(0, 300)}`);
  }
  const data = await resp.json();
  return JSON.parse(data.choices[0].message.content);
}

// amazon_search 청소 — 금지어 제거, 대형 사이즈 제거, 폴백
const BANNED_SEARCH_WORDS =
  /\b(bulk|wholesale|case of \d+|pack of \d{2,}|([3-9]|\d{2,})\s?(lbs?|pounds?)|gallon|restaurant size|food service|commercial)\b/gi;

function cleanAmazonSearch(search: unknown, fallbackName: string): string {
  let s = String(search || "").replace(BANNED_SEARCH_WORDS, " ");
  // 금지어(예: 'gallon')를 떼고 남은 끝의 외톨이 숫자 정리: "whole milk 1" → "whole milk"
  // 단위가 붙은 정상 사이즈("16 oz")는 끝이 숫자가 아니므로 보존됨.
  s = s.replace(/\s+\d+(\.\d+)?\s*$/i, "");
  s = s.replace(/\s+/g, " ").trim();
  // 너무 짧아졌거나 비었으면 재료 이름으로 폴백
  if (s.length < 3) s = fallbackName;
  return s.slice(0, 80);
}

// LLM 출력 보정 — 검색어 청소 + low/high 순서
function normalizeRecipe(recipe: any) {
  // 모든 재료/도구의 amazon_search 청소
  for (const list of [recipe?.ingredients, recipe?.tools]) {
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      if (item && typeof item === "object") {
        item.amazon_search = cleanAmazonSearch(item.amazon_search, item.name || "");
      }
    }
  }
  const hp = recipe?.home_price;
  if (hp) {
    if (hp.savings_pct_low != null && hp.savings_pct_high != null && hp.savings_pct_low > hp.savings_pct_high) {
      [hp.savings_pct_low, hp.savings_pct_high] = [hp.savings_pct_high, hp.savings_pct_low];
    }
    if (hp.amount_low != null && hp.amount_high != null && hp.amount_low > hp.amount_high) {
      [hp.amount_low, hp.amount_high] = [hp.amount_high, hp.amount_low];
    }
  }
  return recipe;
}

function buildRemixPrompt(baseRecipe: any, request: string) {
  return `You adapt recipes for a budget-cooking website. Here is an existing recipe as JSON:

${JSON.stringify(baseRecipe)}

The user wants this adaptation (their own words): "${request}"

Apply their request while KEEPING THE CORE of the recipe intact — same dish, same general method, only change what the request requires (ingredients, quantities, steps, name, times, prices, macros as needed). If they ask to add ingredients, work them in naturally. Update the recipe name to reflect the change (e.g., "Spicy ...", "... with Cheese", "No-Oven ...").

Respond with ONLY the full updated recipe JSON in exactly the same schema as the input (keep all fields; do not include "id", "series", or "videos").

If the request is unrelated to cooking or impossible, respond with {"error": "bad_request"}.`;
}

// ── Main ─────────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    const body = await req.json();

    // ── Mode 1a: publish a recipe (with nickname attribution) ──
    if (body.access_key && body.action === "publish") {
      const nickname = String(body.nickname || "")
        .replace(/<[^>]*>/g, "").replace(/[\n\r]/g, " ").trim().slice(0, 30)
        || "anonymous beggar";
      const { data: row } = await sb
        .from("generated_recipes")
        .select("id, slug, published, recipe")
        .eq("access_key", body.access_key)
        .single();
      if (!row) return json({ error: "not_found" }, 404);
      if (row.published) return json({ slug: row.slug, already: true });

      const base = String(row.recipe?.name || "recipe")
        .toLowerCase().replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "").slice(0, 60) || "recipe";
      const slug = `${base}-${Math.random().toString(36).slice(2, 6)}`;
      const { error: pubErr } = await sb
        .from("generated_recipes")
        .update({
          published: true,
          published_at: new Date().toISOString(),
          slug,
          author_nickname: nickname,
        })
        .eq("id", row.id);
      if (pubErr) throw pubErr;
      return json({ slug, nickname });
    }

    // ── Mode 1b: remix an existing recipe (free-text request, keeps the core) ──
    if (body.access_key && body.remix) {
      const request = String(body.remix).trim().slice(0, 300);
      if (request.length < 3) return json({ error: "bad_request" }, 400);

      const { data: parent } = await sb
        .from("generated_recipes")
        .select("id, video_id, video_url, video_title, servings, budget, recipe")
        .eq("access_key", body.access_key)
        .single();
      if (!parent) return json({ error: "not_found" }, 404);

      // Rate limit by IP (same pool as generation)
      const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
      const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      const { count } = await sb
        .from("generated_recipes")
        .select("id", { count: "exact", head: true })
        .eq("client_ip", ip)
        .gte("created_at", since);
      if ((count || 0) >= RATE_LIMIT_PER_DAY) {
        return json({ error: "rate_limited" }, 429);
      }

      // Strip app-side fields before sending to LLM
      const base = { ...parent.recipe };
      delete base.id; delete base.series; delete base.videos;

      const remixed = await callLLM(buildRemixPrompt(base, request));
      if (remixed.error) return json({ error: remixed.error }, 422);
      normalizeRecipe(remixed);

      remixed.series = "my_recipe";
      remixed.videos = parent.recipe.videos || [];

      const { data: row, error: insErr } = await sb
        .from("generated_recipes")
        .insert({
          video_id: parent.video_id,
          video_url: parent.video_url,
          video_title: parent.video_title,
          servings: remixed.base_servings || parent.servings,
          budget: parent.budget,
          recipe: remixed,
          client_ip: ip,
          remix_request: request,
          remix_of: parent.id,
        })
        .select("access_key, video_url, recipe, created_at")
        .single();
      if (insErr) throw insErr;
      return json(row);
    }

    // ── Mode 1c: fetch existing by access_key ──
    if (body.access_key) {
      const { data, error } = await sb
        .from("generated_recipes")
        .select("access_key, video_url, recipe, created_at, published, slug, author_nickname")
        .eq("access_key", body.access_key)
        .single();
      if (error || !data) return json({ error: "not_found" }, 404);
      return json(data);
    }

    // ── Mode 2: generate ──
    const url = String(body.url || "");
    const servings = Math.min(Math.max(parseInt(body.servings) || 2, 1), 12);
    const budget = body.budget ? Math.max(parseFloat(body.budget), 0) || null : null;

    const videoId = extractVideoId(url);
    if (!videoId) return json({ error: "invalid_url" }, 400);

    // Cache hit? (same video + servings + budget)
    let cacheQuery = sb
      .from("generated_recipes")
      .select("access_key, video_url, recipe, created_at")
      .eq("video_id", videoId)
      .eq("servings", servings)
      .gte("created_at", PROMPT_EPOCH);
    cacheQuery = budget === null
      ? cacheQuery.is("budget", null)
      : cacheQuery.eq("budget", budget);
    const { data: cached } = await cacheQuery.limit(1).maybeSingle();
    if (cached) return json({ ...cached, cached: true });

    // Rate limit by IP
    const ip = (req.headers.get("x-forwarded-for") || "unknown").split(",")[0].trim();
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await sb
      .from("generated_recipes")
      .select("id", { count: "exact", head: true })
      .eq("client_ip", ip)
      .gte("created_at", since);
    if ((count || 0) >= RATE_LIMIT_PER_DAY) {
      return json({ error: "rate_limited", message: "Daily limit reached. Try again tomorrow." }, 429);
    }

    // Fetch video info
    const info = await fetchVideoInfo(videoId);
    if (!info.title) return json({ error: "video_unavailable" }, 422);

    // Generate
    const recipe = await callLLM(buildPrompt(info, servings, budget));
    if (recipe.error) return json({ error: recipe.error }, 422);
    normalizeRecipe(recipe);

    // Attach video + series metadata
    recipe.series = "my_recipe";
    recipe.videos = [{
      platform: "youtube",
      url: `https://www.youtube.com/watch?v=${videoId}`,
      creator: info.author || null,
      title: info.title,
      is_featured: true,
    }];

    // Store
    const { data: row, error: insErr } = await sb
      .from("generated_recipes")
      .insert({
        video_id: videoId,
        video_url: url,
        video_title: info.title,
        servings,
        budget,
        recipe,
        client_ip: ip,
        had_transcript: !!info.transcript,
      })
      .select("access_key, video_url, recipe, created_at")
      .single();
    if (insErr) throw insErr;

    return json(row);
  } catch (err) {
    console.error("generate-recipe error:", err);
    return json({ error: "internal", message: String(err).slice(0, 200) }, 500);
  }
});
