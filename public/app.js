const {
  PRODUCT_CATEGORIES,
  escapeHtml,
  flashButton,
  getRanking,
  formatMoney,
  fetchPublicSettings,
  fetchTeams,
  fetchProducts,
  createOrder,
} = window.TikunBank;

const cache = window.__CACHE__ || (window.__CACHE__ = {});

const getCachedTeams = async () => {
  if (Array.isArray(cache.teams)) return cache.teams;
  const teams = await fetchTeams();
  cache.teams = teams;
  return teams;
};

const getCachedProducts = async () => {
  if (Array.isArray(cache.products)) return cache.products;
  const products = await fetchProducts();
  cache.products = products;
  return products;
};

const renderRating = async () => {
  const weekInfo = document.getElementById("week-info");
  const sprintHeader = document.getElementById("current-sprint-header");
  const tbody = document.getElementById("rating-body");
  if (!tbody || !weekInfo) return;
  tbody.innerHTML = `<tr><td colspan="6">Загрузка...</td></tr>`;
  try {
    const [settings, teams] = await Promise.all([
      fetchPublicSettings(),
      fetchTeams(),
    ]);
    const ranking = getRanking(teams);

    const sprintNumber = Number(settings.current_week) || 1;
    weekInfo.textContent = `Спринт ${sprintNumber} из 12`;
    if (sprintHeader) {
      sprintHeader.textContent = `Спринт ${sprintNumber}`;
    }

    const riskThreshold = ranking.length >= 3 ? ranking.length - 3 : Infinity;
    tbody.innerHTML = "";
    ranking.forEach(({ team, rank }, index) => {
      const row = document.createElement("tr");
      if (rank === 1) row.classList.add("rank-top-1");
      if (rank === 2) row.classList.add("rank-top-2");
      if (rank === 3) row.classList.add("rank-top-3");
      if (index >= riskThreshold) row.classList.add("risk-zone");

      const trend = getTrend(team.previous_rank, rank);
      const medal = getMedal(rank);
      row.innerHTML = `
        <td>${medal ? `${medal} ` : ""}${rank}</td>
        <td>${escapeHtml(team.name)}</td>
        <td>${escapeHtml(Number(team.current_week_score || 0).toFixed(2))}</td>
        <td>${escapeHtml(Number(team.cumulative_score || 0).toFixed(2))}</td>
        <td>${escapeHtml(formatMoney(team.tikuns_balance))} ₮</td>
        <td>${trend}</td>
      `;
      tbody.appendChild(row);
    });
  } catch (error) {
    console.error(error);
    tbody.innerHTML = `<tr><td colspan="6">Не удалось загрузить рейтинг</td></tr>`;
  }
};

const getTrend = (previousRank, currentRank) => {
  if (!previousRank) return `<span class="muted">=</span>`;
  if (currentRank < previousRank) return `<span class="success">↑</span>`;
  if (currentRank > previousRank) return `<span class="error-text">↓</span>`;
  return `<span class="muted">=</span>`;
};

const getMedal = (rank) => {
  if (rank === 1) return "🥇";
  if (rank === 2) return "🥈";
  if (rank === 3) return "🥉";
  return "";
};

const renderShop = async () => {
  const list = document.getElementById("shop-list");
  if (!list) return;
  list.innerHTML = `<div class="muted">Загрузка...</div>`;
  try {
    const products = await getCachedProducts();
    const activeProducts = products.filter((product) => product.is_active);
    list.innerHTML = "";
    if (!activeProducts.length) {
      list.innerHTML = `<div class="muted">Нет товаров. Проверь seed.sql / Supabase</div>`;
      return;
    }

    activeProducts.forEach((product) => {
      const card = document.createElement("div");
      card.className = "shop-card";
      card.innerHTML = `
        <span class="pill">${escapeHtml(
          PRODUCT_CATEGORIES[product.category] || "Другое"
        )}</span>
        <h3>${escapeHtml(product.name)}</h3>
        <div class="muted">${escapeHtml(product.description)}</div>
        <strong>${escapeHtml(formatMoney(product.price))} ₮</strong>
        <button class="primary-btn">Подать заявку</button>
      `;
      const button = card.querySelector("button");
      button.addEventListener("click", () => openOrderModal(product));
      list.appendChild(card);
    });
  } catch (error) {
    console.error(error);
    list.innerHTML = `<div class="muted">Не удалось загрузить товары</div>`;
  }
};

const openOrderModal = (product) => {
  const modal = document.getElementById("order-modal");
  const form = document.getElementById("order-form");
  const teamSelect = document.getElementById("order-team");
  const productSelect = document.getElementById("order-product");
  if (!modal || !form || !teamSelect || !productSelect) return;

  const submitBtn = form.querySelector('button[type="submit"]');
  const setSubmitState = (enabled) => {
    if (submitBtn) submitBtn.disabled = !enabled;
  };
  const setFallbackOption = (select, text) => {
    select.innerHTML = "";
    const option = new Option(text, "");
    option.disabled = true;
    option.selected = true;
    select.appendChild(option);
  };

  const open = async () => {
    teamSelect.disabled = false;
    productSelect.disabled = false;
    teamSelect.innerHTML = "";
    teamSelect.appendChild(new Option("Выберите команду...", ""));
    productSelect.innerHTML = "";
    productSelect.appendChild(new Option("Выберите товар...", ""));
    setSubmitState(true);

    try {
      const [teams, products] = await Promise.all([
        getCachedTeams(),
        getCachedProducts(),
      ]);

      const activeTeams = teams.filter((team) => team.is_active !== false);
      if (!activeTeams.length) {
        setFallbackOption(teamSelect, "Нет команд (проверь Supabase)");
        teamSelect.disabled = true;
        setSubmitState(false);
      } else {
        activeTeams.forEach((team) => {
          const option = new Option(team.name, team.id);
          teamSelect.appendChild(option);
        });
      }

      const activeProducts = products.filter((item) => item.is_active !== false);
      if (!activeProducts.length) {
        setFallbackOption(productSelect, "Нет товаров (проверь Supabase)");
        productSelect.disabled = true;
        setSubmitState(false);
      } else {
        activeProducts.forEach((item) => {
          const option = new Option(item.name, item.id);
          productSelect.appendChild(option);
        });
        if (product && activeProducts.some((item) => item.id === product.id)) {
          productSelect.value = product.id;
        }
      }
    } catch (error) {
      console.error(error);
      setFallbackOption(teamSelect, "Нет команд (проверь Supabase)");
      setFallbackOption(productSelect, "Нет товаров (проверь Supabase)");
      teamSelect.disabled = true;
      productSelect.disabled = true;
      setSubmitState(false);
    }

    if (teamSelect.disabled || productSelect.disabled) {
      setSubmitState(false);
    }

    modal.classList.remove("hidden");
  };

  open();

  form.onsubmit = async (event) => {
    event.preventDefault();
    const teamId = teamSelect.value;
    if (!teamId) {
      alert("Нет команд для выбора.");
      return;
    }
    const productId = productSelect.value;
    if (!productId) {
      alert("Нет товаров для выбора.");
      return;
    }
    const telegram = document.getElementById("order-telegram").value.trim();
    const comment = document.getElementById("order-comment").value.trim();
    const originalText = submitBtn ? submitBtn.textContent : "";
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Отправка...";
    }
    try {
      await createOrder({
        team_id: teamId,
        product_id: productId,
        telegram_contact: telegram,
        comment,
      });
      form.reset();
      modal.classList.add("hidden");
      flashButton(submitBtn, true);
      alert("Заявка отправлена!");
    } catch (error) {
      console.error(error);
      flashButton(submitBtn, false);
      alert("Не удалось отправить заявку. Попробуйте позже.");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = originalText || "Отправить заявку";
      }
    }
  };
};

const setupModalHandlersOnce = () => {
  const modal = document.getElementById("order-modal");
  const closeBtn = document.getElementById("order-modal-close");
  if (!modal || !closeBtn) return;
  if (modal.dataset.handlersBound === "true") return;

  const closeModal = () => modal.classList.add("hidden");
  closeBtn.addEventListener("click", (event) => {
    event.preventDefault();
    closeModal();
  });
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeModal();
  });
  modal.dataset.handlersBound = "true";
};

const initShopPage = () => {
  setupModalHandlersOnce();
  renderShop();
};

document.addEventListener("DOMContentLoaded", () => {
  if (document.getElementById("rating-body")) {
    renderRating();
  }
  if (document.getElementById("shop-list")) {
    initShopPage();
  }
});
