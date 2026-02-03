const { PRODUCT_CATEGORIES, formatMoney, formatDate, fetchTeams } =
  window.TikunBank;

const cache = window.__CACHE__ || (window.__CACHE__ = {});

const flashButton = (button, ok = true) => {
  if (!button) return;
  const className = ok ? "btn--success-flash" : "btn--error-flash";
  button.classList.add(className);
  setTimeout(() => button.classList.remove(className), 500);
};

const withButtonLoading = async (button, pendingText, action) => {
  if (!button) {
    return action();
  }
  const originalText = button.textContent;
  button.disabled = true;
  if (pendingText) button.textContent = pendingText;
  try {
    const result = await action();
    flashButton(button, true);
    return result;
  } catch (error) {
    flashButton(button, false);
    throw error;
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
};

const loginCard = document.getElementById("login-card");
const adminContent = document.getElementById("admin-content");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");

const settingsForm = document.getElementById("settings-form");
const settingsWeek = document.getElementById("settings-week");
const settingsPassword = document.getElementById("settings-password");
const resetInitBtn = document.getElementById("reset-init-btn");
const settingsSubmitBtn = settingsForm
  ? settingsForm.querySelector('button[type="submit"]')
  : null;

const uploadForm = document.getElementById("upload-form");
const uploadFile = document.getElementById("upload-file");
const uploadWeek = document.getElementById("upload-week");
const uploadPreview = document.getElementById("upload-preview");
const previewBody = document.getElementById("preview-body");
const applyUploadBtn = document.getElementById("apply-upload");
const downloadTemplateBtn = document.getElementById("download-template");

const tikunForm = document.getElementById("tikun-form");
const tikunTeam = document.getElementById("tikun-team");
const tikunAmount = document.getElementById("tikun-amount");
const tikunReason = document.getElementById("tikun-reason");
const tikunHistory = document.getElementById("tikun-history");
const tikunSubmitBtn = tikunForm
  ? tikunForm.querySelector('button[type="submit"]')
  : null;

const teamAddForm = document.getElementById("team-add-form");
const teamNameInput = document.getElementById("team-name");
const teamsList = document.getElementById("teams-list");
const teamDeleteForm = document.getElementById("team-delete-form");
const teamDeleteSelect = document.getElementById("team-delete-select");
const teamAddBtn = teamAddForm
  ? teamAddForm.querySelector('button[type="submit"]')
  : null;
const teamDeleteBtn = teamDeleteForm
  ? teamDeleteForm.querySelector('button[type="submit"]')
  : null;

const productAddForm = document.getElementById("product-add-form");
const productNameInput = document.getElementById("product-name");
const productPriceInput = document.getElementById("product-price");
const productCategoryInput = document.getElementById("product-category");
const productDescriptionInput = document.getElementById("product-description");
const productsList = document.getElementById("products-list");
const productAddBtn = productAddForm
  ? productAddForm.querySelector('button[type="submit"]')
  : null;

const ordersFilter = document.getElementById("orders-filter");
const ordersList = document.getElementById("orders-list");

let pendingUploadRows = [];
let cachedTeams = [];
let cachedProducts = [];
let cachedOrders = [];
let cachedBalanceHistory = [];
let cachedSettings = null;

const getToken = () => sessionStorage.getItem("adminToken");

const adminFetch = async (path, options = {}) => {
  const token = getToken();
  const response = await fetch(path, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: token ? `Bearer ${token}` : "",
      ...(options.headers || {}),
    },
  });
  if (response.status === 401) {
    sessionStorage.removeItem("adminToken");
    requireAuth();
    throw new Error("Неавторизовано");
  }
  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Ошибка запроса");
  }
  return payload;
};

const requireAuth = async () => {
  const token = getToken();
  if (token) {
    loginCard.classList.add("hidden");
    adminContent.classList.remove("hidden");
    await loadAdminData();
    return;
  }
  loginCard.classList.remove("hidden");
  adminContent.classList.add("hidden");
};

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const value = document.getElementById("login-password").value;
  try {
    const payload = await adminFetch("/api/admin_login", {
      method: "POST",
      body: JSON.stringify({ password: value }),
    });
    sessionStorage.setItem("adminToken", payload.token);
    loginError.classList.add("hidden");
    await requireAuth();
  } catch (error) {
    loginError.classList.remove("hidden");
  }
});

settingsForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await withButtonLoading(settingsSubmitBtn, "Сохранение...", async () => {
      const weekValue = Number(settingsWeek.value) || cachedSettings.current_week;
      await adminFetch("/api/admin_settings", {
        method: "POST",
        body: JSON.stringify({
          current_week: Math.min(Math.max(weekValue, 1), 12),
          password: settingsPassword.value.trim() || null,
        }),
      });
      settingsPassword.value = "";
      await refreshSettings();
    });
  } catch (error) {
    alert("Не удалось сохранить настройки.");
  }
});

resetInitBtn.addEventListener("click", async () => {
  const ok = confirm("Точно сбросить? Все данные будут удалены.");
  if (!ok) return;
  try {
    await withButtonLoading(resetInitBtn, "Сброс...", async () => {
      const result = await adminFetch("/api/admin_reset_init", {
        method: "POST",
      });
      alert(result.message || "База сброшена");
      await loadAdminData();
    });
  } catch (error) {
    alert("Не удалось выполнить сброс.");
  }
});

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!uploadFile.files[0]) return;
  const arrayBuffer = await uploadFile.files[0].arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetName = workbook.SheetNames.find(
    (name) => name.trim().toLowerCase() === "оценки"
  );
  const sheet = workbook.Sheets[sheetName || workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const parsed = parseExcelRows(rows);
  if (parsed.errorCode === "TOTAL_COLUMN_NOT_FOUND") {
    alert("Не найден столбец ИТОГО. Проверьте шаблон.");
    return;
  }
  if (parsed.errorCode === "VALIDATION_FAILED") {
    alert(
      `Ошибки в строках: ${parsed.rowErrors
        .slice(0, 5)
        .map((item) => item.row)
        .join(", ")}`
    );
    return;
  }
  pendingUploadRows = parsed.rows;
  renderUploadPreview(pendingUploadRows);
});

applyUploadBtn.addEventListener("click", async () => {
  const weekNumber = Number(uploadWeek.value) || 1;
  if (!pendingUploadRows.length) return;
  try {
    await withButtonLoading(applyUploadBtn, "Сохранение...", async () => {
      await adminFetch("/api/admin_upload_week", {
        method: "POST",
        body: JSON.stringify({ week_number: weekNumber, rows: pendingUploadRows }),
      });
      pendingUploadRows = [];
      uploadPreview.classList.add("hidden");
      uploadForm.reset();
      await loadAdminData();
    });
  } catch (error) {
    alert("Не удалось загрузить оценки.");
  }
});

downloadTemplateBtn.addEventListener("click", async () => {
  try {
    await withButtonLoading(downloadTemplateBtn, "Скачивание...", async () => {
      const response = await fetch("/api/excel_template");
      if (!response.ok) {
        throw new Error("Шаблон не сформирован");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "tikunlab_template.xlsx";
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    });
  } catch (error) {
    alert("Шаблон не сформирован. Проверь логи / зависимость exceljs.");
  }
});

tikunForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const amount = Number(tikunAmount.value) || 0;
  try {
    await withButtonLoading(tikunSubmitBtn, "Сохранение...", async () => {
      await adminFetch("/api/admin_tikuns_adjust", {
        method: "POST",
        body: JSON.stringify({
          team_id: tikunTeam.value,
          amount,
          reason: tikunReason.value.trim(),
        }),
      });
      tikunForm.reset();
      await refreshTeams();
      await refreshBalanceHistory();
    });
  } catch (error) {
    alert("Не удалось обновить баланс.");
  }
});

teamAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const name = teamNameInput.value.trim();
  if (!name) return;
  try {
    await withButtonLoading(teamAddBtn, "Сохранение...", async () => {
      await adminFetch("/api/admin_teams", {
        method: "POST",
        body: JSON.stringify({ name }),
      });
      teamAddForm.reset();
      await refreshTeams();
    });
  } catch (error) {
    alert("Не удалось добавить команду.");
  }
});

teamDeleteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const teamId = teamDeleteSelect.value;
  if (!teamId) return;
  const ok = confirm("Удалить команду? Действие необратимо.");
  if (!ok) return;
  try {
    await withButtonLoading(teamDeleteBtn, "Удаление...", async () => {
      await adminFetch("/api/admin_teams", {
        method: "POST",
        body: JSON.stringify({ id: teamId, delete: true }),
      });
      await refreshTeams();
    });
  } catch (error) {
    alert("Не удалось удалить команду.");
  }
});

productAddForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    await withButtonLoading(productAddBtn, "Сохранение...", async () => {
      await adminFetch("/api/admin_products", {
        method: "POST",
        body: JSON.stringify({
          name: productNameInput.value.trim(),
          description: productDescriptionInput.value.trim(),
          price: Number(productPriceInput.value) || 0,
          category: productCategoryInput.value,
        }),
      });
      productAddForm.reset();
      await refreshProducts();
    });
  } catch (error) {
    alert("Не удалось добавить товар.");
  }
});

ordersFilter.addEventListener("change", renderOrders);

const renderAll = async () => {
  await renderTikuns();
  await renderTeams();
  renderProducts();
  renderOrders();
};

const loadTeamsForSelects = async () => {
  try {
    if (Array.isArray(cache.teams)) return cache.teams;
    const teams = await fetchTeams();
    if (teams && teams.length) {
      cache.teams = teams;
      return teams;
    }
  } catch (error) {
    console.error(error);
  }
  return cachedTeams || [];
};

const refreshTeams = async () => {
  const payload = await adminFetch("/api/admin_teams");
  cachedTeams = payload.teams || [];
  cache.teams = cachedTeams;
  await renderTeams();
  await renderTikuns();
};

const refreshProducts = async () => {
  const payload = await adminFetch("/api/admin_products");
  cachedProducts = payload.products || [];
  cache.products = cachedProducts;
  renderProducts();
};

const refreshSettings = async () => {
  const payload = await adminFetch("/api/admin_settings");
  cachedSettings = payload.settings;
  settingsWeek.value = cachedSettings.current_week;
  uploadWeek.value = cachedSettings.current_week;
};

const refreshBalanceHistory = async () => {
  const payload = await adminFetch("/api/admin_tikuns_adjust");
  cachedBalanceHistory = payload.history || [];
  await renderTikuns();
};

const renderTikuns = async () => {
  tikunTeam.innerHTML = "";
  tikunTeam.appendChild(new Option("Выберите команду", ""));
  const teams = await loadTeamsForSelects();
  const activeTeams = teams.filter((team) => team.is_active !== false);
  if (!activeTeams.length) {
    tikunTeam.innerHTML = "";
    tikunTeam.appendChild(new Option("Нет команд", ""));
    tikunTeam.disabled = true;
    if (tikunSubmitBtn) tikunSubmitBtn.disabled = true;
  } else {
    tikunTeam.disabled = false;
    if (tikunSubmitBtn) tikunSubmitBtn.disabled = false;
    activeTeams.forEach((team) => {
      const option = document.createElement("option");
      option.value = team.id;
      option.textContent = team.name;
      tikunTeam.appendChild(option);
    });
  }

  tikunHistory.innerHTML = "";
  cachedBalanceHistory.slice(0, 8).forEach((entry) => {
    const team = cachedTeams.find((item) => item.id === entry.team_id);
    const row = document.createElement("div");
    row.className = "history-item";
    row.innerHTML = `
      <div>
        <strong>${team ? team.name : "Команда"}</strong>
        <div class="muted">${entry.reason}</div>
      </div>
      <div>${entry.amount > 0 ? "+" : ""}${entry.amount} ₮</div>
      <div class="muted">${formatDate(entry.created_at)}</div>
    `;
    tikunHistory.appendChild(row);
  });
};

const renderTeams = async () => {
  teamsList.innerHTML = "";
  teamDeleteSelect.innerHTML = "";
  teamDeleteSelect.appendChild(new Option("Выберите команду", ""));
  const teamsForSelects = await loadTeamsForSelects();
  if (!teamsForSelects.length) {
    teamDeleteSelect.innerHTML = "";
    teamDeleteSelect.appendChild(new Option("Нет команд", ""));
    teamDeleteSelect.disabled = true;
    if (teamDeleteBtn) teamDeleteBtn.disabled = true;
    return;
  }
  teamDeleteSelect.disabled = false;
  if (teamDeleteBtn) teamDeleteBtn.disabled = false;
  teamsForSelects.forEach((team) => {
    const option = document.createElement("option");
    option.value = team.id;
    option.textContent = team.name;
    teamDeleteSelect.appendChild(option);
  });

  if (!cachedTeams.length) return;
  cachedTeams.forEach((team) => {

    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <input type="text" value="${team.name}" class="team-name-input" />
        <div class="meta">Баланс: ${formatMoney(team.tikuns_balance)} ₮</div>
        <div class="meta">${team.is_active ? "Активна" : "Выбывшая"}</div>
      </div>
      <div class="actions">
        <button class="secondary-btn" data-action="save">Сохранить</button>
        <button class="danger-btn" data-action="toggle">
          ${team.is_active ? "Удалить из рейтинга" : "Вернуть"}
        </button>
      </div>
    `;
    const input = item.querySelector(".team-name-input");
    const saveBtn = item.querySelector('[data-action="save"]');
    const toggleBtn = item.querySelector('[data-action="toggle"]');
    saveBtn.onclick = async () => {
      const updated = input.value.trim();
      if (!updated) return;
      try {
        await withButtonLoading(saveBtn, "Сохранение...", async () => {
          await adminFetch("/api/admin_teams", {
            method: "POST",
            body: JSON.stringify({ id: team.id, name: updated }),
          });
          await refreshTeams();
        });
      } catch (error) {
        alert("Не удалось сохранить команду.");
      }
    };
    toggleBtn.onclick = async () => {
      try {
        await withButtonLoading(toggleBtn, "Сохранение...", async () => {
          await adminFetch("/api/admin_teams", {
            method: "POST",
            body: JSON.stringify({ id: team.id, is_active: !team.is_active }),
          });
          await refreshTeams();
        });
      } catch (error) {
        alert("Не удалось обновить команду.");
      }
    };
    teamsList.appendChild(item);
  });
};

const renderProducts = () => {
  productsList.innerHTML = "";
  cachedProducts.forEach((product) => {
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <input type="text" value="${product.name}" class="product-name-input" />
        <div class="meta">${PRODUCT_CATEGORIES[product.category]} · ${product.price} ₮</div>
        <div class="meta">${product.is_active ? "Активен" : "Неактивен"}</div>
      </div>
      <div class="actions">
        <button class="secondary-btn" data-action="toggle">${
          product.is_active ? "Скрыть" : "Показать"
        }</button>
        <button class="secondary-btn" data-action="save">Сохранить</button>
        <button class="danger-btn" data-action="delete">Удалить</button>
      </div>
    `;
    const nameInput = item.querySelector(".product-name-input");
    const toggleBtn = item.querySelector('[data-action="toggle"]');
    const saveBtn = item.querySelector('[data-action="save"]');
    const deleteBtn = item.querySelector('[data-action="delete"]');
    toggleBtn.onclick = async () => {
      try {
        await withButtonLoading(toggleBtn, "Сохранение...", async () => {
          await adminFetch("/api/admin_products", {
            method: "POST",
            body: JSON.stringify({
              id: product.id,
              is_active: !product.is_active,
            }),
          });
          await refreshProducts();
        });
      } catch (error) {
        alert("Не удалось обновить товар.");
      }
    };
    saveBtn.onclick = async () => {
      try {
        await withButtonLoading(saveBtn, "Сохранение...", async () => {
          await adminFetch("/api/admin_products", {
            method: "POST",
            body: JSON.stringify({
              id: product.id,
              name: nameInput.value.trim() || product.name,
            }),
          });
          await refreshProducts();
        });
      } catch (error) {
        alert("Не удалось сохранить товар.");
      }
    };
    deleteBtn.onclick = async () => {
      try {
        await withButtonLoading(deleteBtn, "Удаление...", async () => {
          await adminFetch("/api/admin_products", {
            method: "POST",
            body: JSON.stringify({ id: product.id, delete: true }),
          });
          await refreshProducts();
        });
      } catch (error) {
        alert("Не удалось удалить товар.");
      }
    };
    productsList.appendChild(item);
  });
};

function renderOrders() {
  const filter = ordersFilter.value;
  ordersList.innerHTML = "";
  const orders = cachedOrders.filter((order) =>
    filter === "all" ? true : order.status === filter
  );
  if (!orders.length) {
    ordersList.innerHTML = `<div class="muted">Нет заявок</div>`;
    return;
  }
  orders.forEach((order) => {
    const team = cachedTeams.find((t) => t.id === order.team_id);
    const product = cachedProducts.find((p) => p.id === order.product_id);
    const item = document.createElement("div");
    item.className = "list-item";
    item.innerHTML = `
      <div>
        <strong>${team ? team.name : "Команда"}</strong>
        <div class="meta">${product ? product.name : "Товар"}</div>
        <div class="meta">Контакт: ${order.telegram_contact}</div>
        <div class="meta">Дата: ${formatDate(order.created_at)}</div>
        <div class="meta">Статус: ${order.status}</div>
      </div>
      <div class="actions">
        <button class="secondary-btn" data-action="approve">Одобрить</button>
        <button class="secondary-btn" data-action="reject">Отклонить</button>
        <button class="secondary-btn" data-action="complete">Выполнена</button>
      </div>
    `;
    const approveBtn = item.querySelector('[data-action="approve"]');
    const rejectBtn = item.querySelector('[data-action="reject"]');
    const completeBtn = item.querySelector('[data-action="complete"]');
    approveBtn.onclick = () => updateOrderStatus(order, "approved", approveBtn);
    rejectBtn.onclick = () => updateOrderStatus(order, "rejected", rejectBtn);
    completeBtn.onclick = () => updateOrderStatus(order, "completed", completeBtn);
    ordersList.appendChild(item);
  });
}

const updateOrderStatus = async (order, status, button) => {
  try {
    await withButtonLoading(button, "Сохранение...", async () => {
      await adminFetch("/api/admin_orders", {
        method: "POST",
        body: JSON.stringify({ id: order.id, status }),
      });
      const target = cachedOrders.find((item) => item.id === order.id);
      if (target) target.status = status;
      renderOrders();
    });
  } catch (error) {
    alert("Не удалось обновить заявку.");
  }
};

const parseScore = (value) => {
  if (typeof value === "number") return value;
  if (value === "" || value === null || value === undefined) {
    return Number.NaN;
  }
  const normalized = String(value).replace(",", ".").replace(/\s/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const parseExcelRows = (rows) => {
  if (!rows.length) {
    return { rows: [], rowErrors: [], errorCode: null };
  }
  let scoreColIndex = -1;
  rows.slice(0, 10).forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const value = String(cell || "").trim().toLowerCase();
      if (value === "итого") {
        headerRowIndex = rowIndex;
        scoreColIndex = colIndex;
      }
    });
  });

  if (scoreColIndex === -1) {
    for (let r = rows.length - 1; r >= 0; r -= 1) {
      const row = rows[r];
      for (let c = row.length - 1; c >= 0; c -= 1) {
        if (String(row[c] || "").trim()) {
          scoreColIndex = c;
          break;
        }
      }
      if (scoreColIndex !== -1) break;
    }
  }

  if (scoreColIndex === -1) {
    return { rows: [], rowErrors: [], errorCode: "TOTAL_COLUMN_NOT_FOUND" };
  }

  const result = [];
  const rowErrors = [];
  rows.slice(2).forEach((row, idx) => {
    const rowNumber = idx + 3;
    const nameCell = row[0] || row[1];
    const name = String(nameCell || "").trim();
    const scoreRaw = row[scoreColIndex];
    const scoreValue = parseScore(scoreRaw);
    if (!name && !scoreRaw) return;
    if (!name && scoreRaw) {
      rowErrors.push({ row: rowNumber, value: scoreRaw });
      return;
    }
    if (!Number.isFinite(scoreValue)) {
      rowErrors.push({ row: rowNumber, value: scoreRaw });
      return;
    }
    result.push({ name, score: scoreValue });
  });
  if (rowErrors.length) {
    return { rows: result, rowErrors, errorCode: "VALIDATION_FAILED" };
  }
  return { rows: result, rowErrors: [], errorCode: null };
};

const renderUploadPreview = (rows) => {
  previewBody.innerHTML = "";
  rows.forEach((row) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${row.name}</td><td>${row.score}</td>`;
    previewBody.appendChild(tr);
  });
  uploadPreview.classList.remove("hidden");
};

const loadAdminData = async () => {
  const [settingsPayload, teamsPayload, productsPayload, ordersPayload, historyPayload] =
    await Promise.all([
      adminFetch("/api/admin_settings"),
      adminFetch("/api/admin_teams"),
      adminFetch("/api/admin_products"),
      adminFetch("/api/admin_orders"),
      adminFetch("/api/admin_tikuns_adjust"),
    ]);

  cachedSettings = settingsPayload.settings;
  cachedTeams = teamsPayload.teams || [];
  cachedProducts = productsPayload.products || [];
  cachedOrders = ordersPayload.orders || [];
  cachedBalanceHistory = historyPayload.history || [];
  cache.teams = cachedTeams;
  cache.products = cachedProducts;

  settingsWeek.value = cachedSettings.current_week;
  uploadWeek.value = cachedSettings.current_week;
  await renderAll();
};

requireAuth();
