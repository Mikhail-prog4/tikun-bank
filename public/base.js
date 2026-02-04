const showCdnError = () => {
  if (document.getElementById("cdn-error-banner")) return;
  const box = document.createElement("div");
  box.id = "cdn-error-banner";
  box.textContent =
    "Не загрузились зависимости (CDN). Откройте с другой сети/VPN или перенесите библиотеку локально.";
  box.style.background = "#ffe5e5";
  box.style.border = "1px solid #ff9c9c";
  box.style.color = "#b93939";
  box.style.padding = "12px 16px";
  box.style.margin = "16px";
  box.style.borderRadius = "12px";
  document.body.prepend(box);
};

const attachLogoFallbacks = () => {
  const logos = Array.from(document.querySelectorAll(".logo-img"));
  logos.forEach((logo) => {
    const fallback = logo.getAttribute("data-fallback");
    if (!fallback) return;
    logo.addEventListener("error", () => {
      if (logo.src.endsWith(fallback)) return;
      logo.src = fallback;
    });
  });
};

const checkCdn = () => {
  const supabaseScript = document.querySelector(
    'script[src*="supabase-js"]'
  );
  if (!supabaseScript) return;
  if (!window.supabase) {
    showCdnError();
  }
};

window.addEventListener("DOMContentLoaded", () => {
  attachLogoFallbacks();
  checkCdn();
});
