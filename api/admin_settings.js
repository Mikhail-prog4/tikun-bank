const {
  getSupabase,
  parseBody,
  json,
  getSettings,
  requireAdmin,
} = require("./_utils");

module.exports = async (req, res) => {
  try {
    requireAdmin(req);
  } catch (error) {
    return json(res, 401, { error: "Неавторизовано" });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    try {
      const settings = await getSettings(supabase);
      return json(res, 200, { settings: { current_week: settings.current_week } });
    } catch (error) {
      return json(res, 500, { error: "Не удалось загрузить настройки" });
    }
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const updates = {};
      if (typeof body.current_week === "number") {
        updates.current_week = Math.min(Math.max(body.current_week, 1), 12);
      }
      const { error } = await supabase
        .from("settings")
        .update(updates)
        .eq("id", 1);
      if (error) throw error;
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Не удалось обновить настройки" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
