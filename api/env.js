module.exports = async (req, res) => {
  if (req.method !== "GET") {
    res.statusCode = 405;
    return res.end();
  }
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "Missing SUPABASE env vars" }));
    return;
  }
  res.setHeader("Content-Type", "application/json");
  res.end(
    JSON.stringify({
      SUPABASE_URL: supabaseUrl,
      SUPABASE_ANON_KEY: supabaseAnonKey,
    })
  );
};
