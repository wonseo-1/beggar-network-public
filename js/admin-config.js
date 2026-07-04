// ═══════════════════════════════════
// ADMIN IDENTITY — single source of truth
// ═══════════════════════════════════
// Loaded by both index.html (auth.js) and admin.html (admin.js).
// Changing the admin account? Update ONLY this line, then also update the
// matching value in Supabase (see sql/admin_config.sql for the DB-side
// equivalent — RLS policies read from a DB setting, not from this file).
//
// TODO (pre-public-launch decision): consider swapping this from a personal
// email to a dedicated project email before the repo goes public, since this
// file ships to the browser and is readable by anyone.
const ADMIN_EMAIL = 'seowon1221@gmail.com';
