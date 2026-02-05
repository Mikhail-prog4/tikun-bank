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

      // --- DELETE (soft) + delete rating rows ---
      if (body.delete) {
        const ids = Array.isArray(body.ids) && body.ids.length ? body.ids : body.id ? [body.id] : null;
        if (!ids) return json(res, 400, { error: "Не указан id/ids" });

        // 1) soft-delete + reset aggregates in teams
        const teamUpdates = {
          is_active: false,
          current_week_score: 0,
          cumulative_score: 0,
          previous_rank: null,
          // баланс тиккунов по задаче не трогаем:
          // tikuns_balance: 0,
        };

        const { error: teamsError } = await supabase
          .from("teams")
          .update(teamUpdates)
          .in("id", ids);

        if (teamsError) throw teamsError;

        // 2) delete rating rows for these teams
        // IMPORTANT: this is what makes "rating removed from DB"
        const { error: weeklyError } = await supabase
          .from("weekly_scores")
          .delete()
          .in("team_id", ids);

        if (weeklyError) throw weeklyError;

        // rating_history deliberately NOT deleted (audit log)
        return json(res, 200, { ok: true, deleted_weekly_scores_for: ids.length });
      }

      // --- UPDATE existing team ---
      if (body.id) {
        const updates = {};
        if (body.name) updates.name = String(body.name).trim();
        if (typeof body.is_active === "boolean") {
          updates.is_active = body.is_active;
        }
        if (Object.keys(updates).length === 0) {
          return json(res, 400, { error: "Некорректные данные" });
        }

        const { error } = await supabase.from("teams").update(updates).eq("id", body.id);
        if (error) throw error;

        return json(res, 200, { ok: true });
      }

      // --- INSERT new team ---
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
      // for debug you can temporarily return error.message,
      // but keeping generic message is ok for production.
      return json(res, 500, { error: "Не удалось сохранить команду" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
