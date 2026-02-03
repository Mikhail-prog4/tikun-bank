const { getSupabase, parseBody, json, requireAdmin } = require("./_utils");

module.exports = async (req, res) => {
  try {
    requireAdmin(req);
  } catch (error) {
    return json(res, 401, { error: "Неавторизовано" });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    const { data, error } = await supabase
      .from("teams")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return json(res, 500, { error: "Не удалось загрузить команды" });
    return json(res, 200, { teams: data });
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      if (body.delete) {
        if (!body.id) return json(res, 400, { error: "Не указан id" });
        const { error } = await supabase
          .from("teams")
          .update({ is_active: false })
          .eq("id", body.id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }
      if (body.id) {
        const updates = {};
        if (body.name) updates.name = String(body.name).trim();
        if (typeof body.is_active === "boolean") {
          updates.is_active = body.is_active;
        }
        if (Object.keys(updates).length === 0) {
          return json(res, 400, { error: "Некорректные данные" });
        }
        const { error } = await supabase
          .from("teams")
          .update(updates)
          .eq("id", body.id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }

      const name = String(body.name || "").trim();
      if (!name) return json(res, 400, { error: "Название обязательно" });
      const { error } = await supabase.from("teams").insert([
        {
          name,
          current_week_score: 0,
          cumulative_score: 0,
          tikuns_balance: 0,
          previous_rank: null,
          is_active: true,
        },
      ]);
      if (error) throw error;
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Не удалось сохранить команду" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
