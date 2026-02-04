(() => {
  const statusEl = document.getElementById("health-status");
  const logo = document.getElementById("health-logo");
  if (!statusEl || !logo) return;

  let done = false;
  const finish = (ok, message) => {
    if (done) return;
    done = true;
    statusEl.textContent = ok ? `OK: ${message}` : `FAIL: ${message}`;
    statusEl.style.color = ok ? "#1b7f3b" : "#b93939";
  };

  logo.addEventListener("load", () => finish(true, "Статика доступна"));
  logo.addEventListener("error", () => finish(false, "Логотип не загрузился"));

  setTimeout(() => {
    if (!done) {
      finish(false, "Таймаут загрузки");
    }
  }, 5000);
})();
