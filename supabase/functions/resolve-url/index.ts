// Supabase Edge Function — resolve Google Maps short URLs
// POST { url: "https://maps.app.goo.gl/xxx" }
// Returns { resolved: "https://www.google.com/maps/place/..." }

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    const { url } = await req.json();

    if (!url || (!url.includes("goo.gl") && !url.includes("maps.app"))) {
      return new Response(
        JSON.stringify({ error: "Not a Google Maps short URL" }),
        { status: 400, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    // Follow redirects manually to get final URL
    const resp = await fetch(url, { redirect: "manual" });
    let resolved = resp.headers.get("location") || "";

    // Sometimes there's a second redirect
    if (resolved && (resolved.includes("goo.gl") || resolved.includes("consent"))) {
      const resp2 = await fetch(resolved, { redirect: "manual" });
      resolved = resp2.headers.get("location") || resolved;
    }

    if (!resolved) {
      return new Response(
        JSON.stringify({ error: "Could not resolve URL" }),
        { status: 422, headers: { ...CORS, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ resolved }),
      { headers: { ...CORS, "Content-Type": "application/json" } }
    );
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...CORS, "Content-Type": "application/json" } }
    );
  }
});
