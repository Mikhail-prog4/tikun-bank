const { getSupabase, parseBody, json, requireAdmin } = require("./_utils");

module.exports = async (req, res) => {
  try {
    requireAdmin(req);
  } catch (error) {
    return json(res, 401, { error: "Неавторизовано" });
  }

  const supabase = getSupabase();

  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }

  try {
    const body = await parseBody(req);
    const teamId = body.team_id;
    const delta = Number(body.delta);
    const reason = String(body.reason || "").trim();
    if (!teamId || reason === "") {
      return json(res, 400, { error: "Некорректные данные" });
    }
    if (!Number.isFinite(delta)) {
      return json(res, 400, { error: "Баллы должны быть числом" });
    }

    const { data: team, error: teamError } = await supabase
      .from("teams")
      .select("cumulative_score, name")
      .eq("id", teamId)
      .single();
    if (teamError || !team) {
      return json(res, 400, { error: "Команда не найдена" });
    }

    const newScore = Math.max(0, (team.cumulative_score || 0) + delta);
    const { error: updateError } = await supabase
      .from("teams")
      .update({ cumulative_score: newScore })
      .eq("id", teamId);
    if (updateError) throw updateError;

    const { error: historyError } = await supabase.from("rating_history").insert([
      {
        action: "score_adjust",
        payload: {
          team_id: teamId,
          team_name: team.name,
          delta,
          reason,
          previous_score: team.cumulative_score,
          new_score: newScore,
        },
      },
    ]);
    if (historyError) throw historyError;

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "Не удалось обновить общий балл" });
  }
};
