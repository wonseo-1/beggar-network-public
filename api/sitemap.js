// Vercel serverless function — sitemap.xml including all published recipes

const SUPABASE_URL = 'https://vzjbgdhsihjfhdwxxqwk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZ6amJnZGhzaWhqZmhkd3h4cXdrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg0Nzc3MTIsImV4cCI6MjA5NDA1MzcxMn0.XchnQHREPiOppr4dpvzvxq06oFv2JXpBTeRTpyM7LzM';
const SITE = 'https://beggarnetwork.vercel.app';

module.exports = async (req, res) => {
  let rows = [];
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/generated_recipes?published=eq.true&select=slug,published_at&order=published_at.desc&limit=2000`,
      { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } },
    );
    rows = await r.json();
    if (!Array.isArray(rows)) rows = [];
  } catch (_) {}

  const urls = [
    `<url><loc>${SITE}/</loc><changefreq>daily</changefreq></url>`,
    ...rows.filter(r => r.slug).map(r =>
      `<url><loc>${SITE}/recipe/${encodeURIComponent(r.slug)}</loc><lastmod>${(r.published_at || '').slice(0, 10)}</lastmod></url>`
    ),
  ].join('\n');

  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Cache-Control', 'public, s-maxage=3600');
  res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`);
};
