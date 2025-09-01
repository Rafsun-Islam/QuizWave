// ===== Supabase Connection =====

const SUPABASE_URL = "https://gltboemycmvblogjqexb.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdsdGJvZW15Y212YmxvZ2pxZXhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTQ3NTE1ODYsImV4cCI6MjA3MDMyNzU4Nn0.odv2eBLd2zWW0LXP5l6NaQ6ZWVfJ_DX0BV7AOK0gf8w";
window.client = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

