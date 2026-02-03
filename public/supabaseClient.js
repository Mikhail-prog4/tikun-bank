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

const getSupabaseClient = async () => {
  if (window.__supabaseClient) return window.__supabaseClient;
  const response = await fetch("/api/env");
  if (!response.ok) {
    showConfigError("Не настроен Supabase / не заполнен .env");
    throw new Error("Не удалось загрузить конфигурацию");
  }
  const payload = await response.json();
  const supabaseUrl = payload.SUPABASE_URL;
  const supabaseAnonKey = payload.SUPABASE_ANON_KEY;
  if (!supabaseUrl || !supabaseAnonKey) {
    showConfigError("Не настроен Supabase / не заполнен .env");
    throw new Error("Некорректная конфигурация Supabase");
  }
  window.__supabaseClient = supabase.createClient(supabaseUrl, supabaseAnonKey);
  return window.__supabaseClient;
};

window.getSupabaseClient = getSupabaseClient;
