const { getSupabase, json, requireAdmin } = require("./_utils");

const SEED_TEAMS = Array.from({ length: 22 }, (_, idx) => ({
  name: `Команда ${idx + 1}`,
  current_week_score: 0,
  cumulative_score: 0,
  tikuns_balance: 0,
  previous_rank: null,
  is_active: true,
}));

const SEED_PRODUCTS = [
  {
    name: "Покупка участника из выбывшей команды",
    description: "Переход участника к вашей команде.",
    price: 500,
    category: "people",
  },
  {
    name: "Приоритет выбора участника",
    description: "Ранний выбор участника из пула.",
    price: 200,
    category: "people",
  },
  {
    name: "Временный специалист (1 неделя)",
    description: "Подключение специалиста на неделю.",
    price: 300,
    category: "people",
  },
  {
    name: "30 мин с экспертом (базовый)",
    description: "Быстрая консультация по проекту.",
    price: 150,
    category: "expertise",
  },
  {
    name: "30 мин с экспертом (топовый)",
    description: "Глубокая экспертиза с топовым экспертом.",
    price: 300,
    category: "expertise",
  },
  {
    name: "60 мин с ментором программы",
    description: "Разбор стратегии на час.",
    price: 250,
    category: "expertise",
  },
  {
    name: "Письменный аудит проекта",
    description: "Аудит с письменными рекомендациями.",
    price: 200,
    category: "expertise",
  },
  {
    name: "Интро к потенциальному партнёру",
    description: "Тёплое интро к партнёру.",
    price: 400,
    category: "expertise",
  },
  {
    name: "Рекламный бюджет ₽5 000",
    description: "Размещение рекламного бюджета.",
    price: 400,
    category: "ads",
  },
  {
    name: "Рекламный бюджет ₽15 000",
    description: "Усиленный рекламный бюджет.",
    price: 1000,
    category: "ads",
  },
  {
    name: "Рекламный бюджет ₽30 000",
    description: "Максимальный рекламный бюджет.",
    price: 1800,
    category: "ads",
  },
  {
    name: "Пост в канале Тикун Лаб",
    description: "Размещение поста в канале.",
    price: 200,
    category: "ads",
  },
  {
    name: "Публикация в партнёрских СМИ",
    description: "Публикация у партнёров.",
    price: 500,
    category: "ads",
  },
  {
    name: "Дополнительные 2 минуты на защите",
    description: "Добавочное время на питче.",
    price: 100,
    category: "other",
  },
  {
    name: "Щит от отчисления (1 раз)",
    description: "Защита от отчисления.",
    price: 800,
    category: "other",
  },
  {
    name: "Повторная защита (пересдача)",
    description: "Вторая попытка защиты.",
    price: 400,
    category: "other",
  },
  {
    name: "Доступ к записям менторских сессий",
    description: "Полный доступ к записям.",
    price: 150,
    category: "other",
  },
].map((product) => ({ ...product, is_active: true }));

const deleteAll = async (supabase, table) => {
  const { error } = await supabase
    .from(table)
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000");
  if (error) throw error;
};

module.exports = async (req, res) => {
  try {
    requireAdmin(req);
  } catch (error) {
    return json(res, 401, { error: "Неавторизовано" });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }

  try {
    const supabase = getSupabase();

    await deleteAll(supabase, "orders");
    await deleteAll(supabase, "weekly_scores");
    await deleteAll(supabase, "balance_history");
    await deleteAll(supabase, "products");
    await deleteAll(supabase, "teams");

    const { error: teamError } = await supabase.from("teams").insert(SEED_TEAMS);
    if (teamError) throw teamError;

    const { error: productError } = await supabase
      .from("products")
      .insert(SEED_PRODUCTS);
    if (productError) throw productError;

    const { error: settingsError } = await supabase
      .from("settings")
      .update({ current_week: 1 })
      .eq("id", 1);
    if (settingsError) throw settingsError;

    return json(res, 200, {
      ok: true,
      message: "База сброшена и инициализирована",
    });
  } catch (error) {
    return json(res, 500, { error: "Не удалось выполнить сброс" });
  }
};
