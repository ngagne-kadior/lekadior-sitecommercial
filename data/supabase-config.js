/* =====================================================================
   LE KADIOR — CONFIGURATION SUPABASE (côté site public)
   ---------------------------------------------------------------------
   Renseigner depuis Supabase > Project Settings > API :
   - url     : « Project URL »          ex. https://xxxx.supabase.co
   - anonKey : clé PUBLIQUE uniquement  (« anon public » ou « sb_publishable_… »)

   JAMAIS la clé « service_role » / « sb_secret_… » : elle donne tous les droits
   sur la base. supabase-sync.js refuse de fonctionner si elle est détectée.

   Tant que url ou anonKey est vide, le site utilise data/catalog.js (fallback).
   ===================================================================== */

window.KADIOR_SUPABASE = {
  url: "https://yvfwhjixhqxejvhefvyx.supabase.co",
  anonKey: "sb_publishable_3nlWHvES2BgVpugLR5sOTQ_ap-F37hY"
};
