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

const uploadForm = document.getElementById("upload-form");
const uploadFile = document.getElementById("upload-file");
const uploadWeek = document.getElementById("upload-week");
const uploadPreview = document.getElementById("upload-preview");
const previewBody = document.getElementById("preview-body");
const uploadSubmitBtn = uploadForm
  ? uploadForm.querySelector('button[type="submit"]')
  : null;
const downloadTemplateBtn = document.getElementById("download-template");

const tikunForm = document.getElementById("tikun-form");
const tikunTeam = document.getElementById("tikun-team");
const tikunAmount = document.getElementById("tikun-amount");
const tikunReason = document.getElementById("tikun-reason");
const tikunHistory = document.getElementById("tikun-history");
const tikunSubmitBtn = tikunForm
  ? tikunForm.querySelector('button[type="submit"]')
  : null;

const teamDeleteSearch = document.getElementById("team-delete-search");
const teamDeleteList = document.getElementById("team-delete-list");
const teamDeleteCount = document.getElementById("team-delete-count");
const teamDeleteResult = document.getElementById("team-delete-result");
const teamSelectAllBtn = document.getElementById("team-select-all");
const teamClearAllBtn = document.getElementById("team-clear-all");
const teamDeleteSubmitBtn = document.getElementById("team-delete-submit");

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

const toggleDeleteTeamBtn = document.getElementById("toggle-delete-team");
const toggleProductsBtn = document.getElementById("toggle-products");
const toggleOrdersBtn = document.getElementById("toggle-orders");
const teamDeletePanel = document.getElementById("team-delete-panel");
const productsPanel = document.getElementById("products-panel");
const ordersPanel = document.getElementById("orders-panel");

let pendingUploadRows = [];
let selectedTeamIds = new Set();
let cachedTeams = [];
let cachedProducts = [];
let cachedOrders = [];
let cachedBalanceHistory = [];

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

const togglePanel = (panel) => {
  if (!panel) return;
  panel.classList.toggle("hidden");
};

if (toggleDeleteTeamBtn) {
  toggleDeleteTeamBtn.addEventListener("click", () => {
    togglePanel(teamDeletePanel);
  });
}

if (toggleProductsBtn) {
  toggleProductsBtn.addEventListener("click", () => {
    togglePanel(productsPanel);
  });
}

if (toggleOrdersBtn) {
  toggleOrdersBtn.addEventListener("click", () => {
    togglePanel(ordersPanel);
  });
}

const performUpload = async (rows) => {
  const weekNumber = Number(uploadWeek.value) || 1;
  await withButtonLoading(uploadSubmitBtn, "Сохранение...", async () => {
    await adminFetch("/api/admin_upload_week", {
      method: "POST",
      body: JSON.stringify({ week_number: weekNumber, rows }),
    });
    pendingUploadRows = [];
    uploadPreview.classList.add("hidden");
    uploadForm.reset();
    await loadAdminData();
  });
};

uploadForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!uploadFile.files[0]) return;
  const arrayBuffer = await uploadFile.files[0].arrayBuffer();
  const workbook = XLSX.read(arrayBuffer, { type: "array" });
  const sheetNames = workbook.SheetNames || [];
  const preferredSheet =
    sheetNames.find((name) => /^(оценки|рейтинг|data)$/i.test(name.trim())) ||
    sheetNames[0];
  const sheet = workbook.Sheets[preferredSheet];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: false,
    defval: "",
  });
  const parsed = parseExcelRows(rows, sheet, preferredSheet);
  if (parsed.errorCode === "TOTAL_COLUMN_NOT_FOUND") {
    alert("Не найден столбец ИТОГО. Проверьте шаблон.");
    return;
  }
  if (parsed.errorCode === "VALIDATION_FAILED") {
    const first = parsed.rowErrors[0];
    if (first && first.reason === "empty team") {
      alert(
        `Row ${first.row}: team extracted as empty, rawValueType=${first.rawValueType}, rawValue=${first.rawValue}, merged=${first.merged}, sheet=${first.sheet}`
      );
      return;
    }
    const details = parsed.rowErrors
      .slice(0, 5)
      .map((item) => `${item.row}${item.reason ? ` (${item.reason})` : ""}`)
      .join(", ");
    alert(`Ошибки в строках: ${details}`);
    return;
  }
  if (parsed.errorCode === "EXPECTED_COUNT_MISMATCH") {
    alert(
      `Ожидалось 22 команды (B4:B25), получено ${parsed.actual}. Проверь файл/диапазон.`
    );
    return;
  }
  if (parsed.errorCode === "EMPTY_TEAM_EXTRACTED") {
    alert(parsed.message || "Некорректные данные в строках.");
    return;
  }
  pendingUploadRows = parsed.rows;
  renderUploadPreview(pendingUploadRows);
  try {
    await performUpload(pendingUploadRows);
  } catch (error) {
    alert("Не удалось обновить рейтинг.");
  }
});

downloadTemplateBtn.addEventListener("click", async () => {
  try {
    await withButtonLoading(downloadTemplateBtn, "Отмена...", async () => {
      await adminFetch("/api/undo_last_action", { method: "POST" });
      await loadAdminData();
    });
    alert("Последнее действие отменено.");
  } catch (error) {
    alert("Не удалось отменить последнее действие.");
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

if (teamDeleteSearch) {
  teamDeleteSearch.addEventListener("input", () => {
    renderTeams();
  });
}

if (teamSelectAllBtn) {
  teamSelectAllBtn.addEventListener("click", async () => {
    const teamsForSelects = await loadTeamsForSelects();
    teamsForSelects
      .filter((team) => team.is_active !== false)
      .forEach((team) => selectedTeamIds.add(team.id));
    renderTeams();
  });
}

if (teamClearAllBtn) {
  teamClearAllBtn.addEventListener("click", () => {
    selectedTeamIds.clear();
    renderTeams();
  });
}

if (teamDeleteSubmitBtn) {
  teamDeleteSubmitBtn.addEventListener("click", async () => {
    const ids = Array.from(selectedTeamIds);
    if (!ids.length) return;
    const ok = confirm(`Удалить команды (${ids.length})?`);
    if (!ok) return;
    const originalText = teamDeleteSubmitBtn.textContent;
    teamDeleteSubmitBtn.disabled = true;
    teamDeleteSubmitBtn.textContent = "Удаление...";
    try {
      const results = await Promise.allSettled(
        ids.map((id) =>
          adminFetch("/api/admin_teams", {
            method: "POST",
            body: JSON.stringify({ id, delete: true }),
          })
        )
      );
      const errors = [];
      results.forEach((result, idx) => {
        if (result.status === "rejected") {
          const id = ids[idx];
          const team = cachedTeams.find((item) => item.id === id);
          errors.push(`${team ? team.name : id}: ${result.reason?.message || "ошибка"}`);
        }
      });

      selectedTeamIds.clear();
      await refreshTeams();
      renderTeams();

      if (errors.length) {
        if (teamDeleteResult) {
          teamDeleteResult.textContent = `Ошибки удаления: ${errors.join("; ")}`;
        }
        flashButton(teamDeleteSubmitBtn, false);
      } else {
        if (teamDeleteResult) {
          teamDeleteResult.textContent = `Удалено команд: ${ids.length}`;
        }
        flashButton(teamDeleteSubmitBtn, true);
      }
    } catch (error) {
      if (teamDeleteResult) {
        teamDeleteResult.textContent = "Не удалось удалить команды.";
      }
      flashButton(teamDeleteSubmitBtn, false);
      alert("Не удалось удалить команды.");
    } finally {
      teamDeleteSubmitBtn.disabled = false;
      teamDeleteSubmitBtn.textContent = originalText;
    }
  });
}

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
  if (!teamDeleteList || !teamDeleteCount) return;
  const teamsForSelects = await loadTeamsForSelects();
  const activeTeams = teamsForSelects.filter((team) => team.is_active !== false);
  const query = (teamDeleteSearch && teamDeleteSearch.value || "")
    .trim()
    .toLowerCase();
  const filtered = query
    ? activeTeams.filter((team) => team.name.toLowerCase().includes(query))
    : activeTeams;

  selectedTeamIds = new Set(
    [...selectedTeamIds].filter((id) => activeTeams.some((t) => t.id === id))
  );

  teamDeleteList.innerHTML = "";
  if (!filtered.length) {
    teamDeleteList.innerHTML = `<div class="muted">Нет команд</div>`;
    teamDeleteCount.textContent = "Выбрано: 0";
    if (teamDeleteSubmitBtn) teamDeleteSubmitBtn.disabled = true;
    return;
  }

  filtered.forEach((team) => {
    const label = document.createElement("label");
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.value = team.id;
    checkbox.checked = selectedTeamIds.has(team.id);
    checkbox.addEventListener("change", () => {
      if (checkbox.checked) {
        selectedTeamIds.add(team.id);
      } else {
        selectedTeamIds.delete(team.id);
      }
      teamDeleteCount.textContent = `Выбрано: ${selectedTeamIds.size}`;
      if (teamDeleteSubmitBtn) {
        teamDeleteSubmitBtn.disabled = selectedTeamIds.size === 0;
      }
    });
    label.appendChild(checkbox);
    label.appendChild(document.createTextNode(team.name));
    teamDeleteList.appendChild(label);
  });

  teamDeleteCount.textContent = `Выбрано: ${selectedTeamIds.size}`;
  if (teamDeleteSubmitBtn) {
    teamDeleteSubmitBtn.disabled = selectedTeamIds.size === 0;
  }
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

const START_ROW = 4;
const END_ROW = 25;
const TEAM_COL = "B";
const TOTAL_COL = "W";

const colLetterToIndex = (letter) => letter.toUpperCase().charCodeAt(0) - 65;

const normalizeTeamName = (value) =>
  String(value ?? "").replace(/\u00A0/g, " ").trim();

const getCellValue = (sheet, address) => {
  if (!sheet) return undefined;
  const cell = sheet[address];
  if (!cell) return undefined;
  if (cell.f !== undefined && cell.v === undefined && cell.w !== undefined) {
    return cell.w;
  }
  return cell.v ?? cell.w;
};

const getCellText = (sheet, address) => {
  const value = getCellValue(sheet, address);
  if (value === undefined || value === null) return "";
  return String(value);
};

const getMergedValue = (sheet, address) => {
  if (!sheet || !sheet["!merges"]) return getCellValue(sheet, address);
  const { c, r } = XLSX.utils.decode_cell(address);
  const merge = sheet["!merges"].find(
    (m) => r >= m.s.r && r <= m.e.r && c >= m.s.c && c <= m.e.c
  );
  if (!merge) return getCellValue(sheet, address);
  const masterAddr = XLSX.utils.encode_cell(merge.s);
  return getCellValue(sheet, masterAddr);
};

const parseExcelRows = (rows, sheet, sheetName) => {
  if (!rows.length) {
    return { rows: [], rowErrors: [], errorCode: null };
  }
  let scoreColIndex = -1;
  let hasDirectData = false;
  const directRows = [];
  const directErrors = [];
  const teamColIndex = colLetterToIndex(TEAM_COL);
  const totalColIndex = colLetterToIndex(TOTAL_COL);
  for (let r = START_ROW; r <= END_ROW; r += 1) {
    const teamAddress = `${TEAM_COL}${r}`;
    const totalAddress = `${TOTAL_COL}${r}`;
    const teamValue = getMergedValue(sheet, teamAddress);
    const totalValue = getMergedValue(sheet, totalAddress);
    if (String(teamValue || "").trim() || String(totalValue || "").trim()) {
      hasDirectData = true;
    }
    const name = normalizeTeamName(teamValue);
    const totalScore = parseScore(totalValue);
    if (!name) {
      console.warn(`Skipped row ${r}: empty team`);
      directErrors.push({
        row: r,
        reason: "empty team",
        rawValueType: typeof teamValue,
        rawValue: teamValue,
        merged: Boolean(sheet && sheet["!merges"]),
        sheet: sheetName || "",
      });
      continue;
    }
    if (!Number.isFinite(totalScore)) {
      console.warn(`Skipped row ${r}: invalid total`);
      directErrors.push({
        row: r,
        value: totalValue,
        rawValueType: typeof totalValue,
        sheet: sheetName || "",
      });
      continue;
    }
    directRows.push({ name, score: totalScore });
  }
  if (hasDirectData) {
    if (directErrors.length) {
      return {
        rows: directRows,
        rowErrors: directErrors,
        errorCode: "VALIDATION_FAILED",
      };
    }
    if (directRows.length !== 22) {
      return {
        rows: directRows,
        rowErrors: [],
        errorCode: "EXPECTED_COUNT_MISMATCH",
        expected: 22,
        actual: directRows.length,
      };
    }
    return { rows: directRows, rowErrors: [], errorCode: null };
  }

  let fallbackTeamColIndex = -1;
  rows.slice(0, 10).forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const value = String(cell || "").trim().toLowerCase();
      if (value === "итого") {
        scoreColIndex = colIndex;
      }
      if (
        fallbackTeamColIndex === -1 &&
        (value.includes("команд") ||
          value.includes("проект") ||
          value.includes("назван"))
      ) {
        fallbackTeamColIndex = colIndex;
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
  if (fallbackTeamColIndex === -1) {
    fallbackTeamColIndex = 0;
  }

  rows.slice(2).forEach((row, idx) => {
    const rowNumber = idx + 3;
    const nameCell = row[fallbackTeamColIndex] || row[1] || row[0];
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
  const [teamsPayload, productsPayload, ordersPayload, historyPayload] =
    await Promise.all([
      adminFetch("/api/admin_teams"),
      adminFetch("/api/admin_products"),
      adminFetch("/api/admin_orders"),
      adminFetch("/api/admin_tikuns_adjust"),
    ]);

  cachedTeams = teamsPayload.teams || [];
  cachedProducts = productsPayload.products || [];
  cachedOrders = ordersPayload.orders || [];
  cachedBalanceHistory = historyPayload.history || [];
  cache.teams = cachedTeams;
  cache.products = cachedProducts;

  if (!uploadWeek.value) uploadWeek.value = 1;
  await renderAll();
};

requireAuth();
