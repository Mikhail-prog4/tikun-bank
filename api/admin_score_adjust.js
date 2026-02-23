const { getSupabase, parseBody, json, requireAdmin } = require("./_utils");

module.exports = async (req, res) => {
  try {
    requireAdmin(req);
  } catch (error) {
    return json(res, 401, { error: "Неавторизовано" });
  }

  const supabase = getSupabase();

  if (req.method === "GET") {
    // Читаем историю из score_history (надёжная таблица)
    const { data, error } = await supabase
      .from("score_history")
      .select("id, team_id, amount, reason, created_at")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(res, 500, { error: "Не удалось загрузить историю" });
    return json(res, 200, { history: data || [] });
  }

  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }

  try {
    const body = await parseBody(req);
    const teamId = body.team_id;
    const reason = String(body.reason || "").trim();
    if (!teamId || reason === "") {
      return json(res, 400, { error: "Некорректные данные" });
    }
    const rawDelta = body.delta;
    const delta = typeof rawDelta === "number" && Number.isFinite(rawDelta)
      ? rawDelta
      : Number(String(rawDelta ?? "").replace(",", "."));
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

    // СНАЧАЛА записываем в score_history (надёжный первоисточник)
    const { error: scoreHistError } = await supabase.from("score_history").insert([
      {
        team_id: teamId,
        amount: delta,
        reason,
      },
    ]);
    if (scoreHistError) throw scoreHistError;

    // ПОТОМ обновляем cumulative_score в teams
    const currentScore = Number(String(team.cumulative_score ?? "").replace(",", ".")) || 0;
    const newScore = Math.max(0, currentScore + delta);
    const { error: updateError } = await supabase
      .from("teams")
      .update({ cumulative_score: newScore })
      .eq("id", teamId);
    if (updateError) throw updateError;

    // Audit-лог в rating_history (необязательный, для истории)
    try {
      await supabase.from("rating_history").insert([
        {
          action: "score_adjust",
          payload: {
            team_id: teamId,
            team_name: team.name,
            delta,
            reason,
            previous_score: currentScore,
            new_score: newScore,
          },
        },
      ]);
    } catch (_ignore) {
      // rating_history — необязательный audit-лог, не блокируем основную операцию
    }

    return json(res, 200, { ok: true });
  } catch (error) {
    return json(res, 500, { error: "Не удалось обновить общий балл" });
  }
};
