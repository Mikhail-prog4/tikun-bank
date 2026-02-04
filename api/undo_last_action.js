const { getSupabase, json, requireAdmin } = require("./_utils");

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
    const { data: historyRows, error: historyError } = await supabase
      .from("rating_history")
      .select("*")
      .eq("undone", false)
      .order("created_at", { ascending: false })
      .limit(1);
    if (historyError) throw historyError;

    if (!historyRows || !historyRows.length) {
      return json(res, 404, { error: "Нет действий для отката" });
    }

    const history = historyRows[0];
    const payload = history.payload || {};
    const weekNumber = payload.week_number;
    const teams = Array.isArray(payload.teams) ? payload.teams : [];
    const weeklyScores = Array.isArray(payload.weekly_scores)
      ? payload.weekly_scores
      : [];
    const previousWeek =
      payload.settings && typeof payload.settings.current_week === "number"
        ? payload.settings.current_week
        : null;

    if (weekNumber) {
      const { error: deleteError } = await supabase
        .from("weekly_scores")
        .delete()
        .eq("week_number", weekNumber);
      if (deleteError) throw deleteError;
    }

    if (weeklyScores.length) {
      const { error: insertError } = await supabase
        .from("weekly_scores")
        .insert(weeklyScores);
      if (insertError) throw insertError;
    }

    if (teams.length) {
      await Promise.all(
        teams.map((team) =>
          supabase
            .from("teams")
            .update({
              current_week_score: team.current_week_score,
              cumulative_score: team.cumulative_score,
              tikuns_balance: team.tikuns_balance,
              previous_rank: team.previous_rank,
              is_active: team.is_active,
            })
            .eq("id", team.id)
        )
      );
    }

    if (previousWeek !== null) {
      const { error: settingsError } = await supabase
        .from("settings")
        .update({ current_week: previousWeek })
        .eq("id", 1);
      if (settingsError) throw settingsError;
    }

    const { error: markError } = await supabase
      .from("rating_history")
      .update({ undone: true })
      .eq("id", history.id);
    if (markError) throw markError;

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "Не удалось отменить действие" });
  }
};
