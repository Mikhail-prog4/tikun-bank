const showConfigError = (message) => {
  if (document.getElementById("supabase-config-error")) return;
  const box = document.createElement("div");
  box.id = "supabase-config-error";
  box.textContent = message;
  box.style.background = "#ffe5e5";
  box.style.border = "1px solid #ff9c9c";
  box.style.color = "#b93939";
  box.style.padding = "12px 16px";
  box.style.margin = "16px";
  box.style.borderRadius = "12px";
  document.body.prepend(box);
};

const fetchConfigWithTimeout = async (url, timeoutMs) => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    const payload = await response.json();
    const supabaseUrl = payload.SUPABASE_URL;
    const supabaseAnonKey = payload.SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseAnonKey) return null;
    return { supabaseUrl, supabaseAnonKey };
  } catch (error) {
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
};

const getSupabaseClient = async () => {
  if (window.__supabaseClient) return window.__supabaseClient;
  const fromStatic = await fetchConfigWithTimeout("/env.json", 5000);
  const fromApi = fromStatic
    ? null
    : await fetchConfigWithTimeout("/api/env", 7000);
  const config = fromStatic || fromApi;
  if (!config) {
    showConfigError(
      "Не могу получить конфиг Supabase ни из /env.json, ни из /api/env"
    );
    throw new Error("Не удалось загрузить конфигурацию");
  }
  window.__supabaseClient = supabase.createClient(
    config.supabaseUrl,
    config.supabaseAnonKey
  );
  return window.__supabaseClient;
};

window.getSupabaseClient = getSupabaseClient;
