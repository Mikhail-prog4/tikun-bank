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
      .from("balance_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) return json(res, 500, { error: "Не удалось загрузить историю" });
    return json(res, 200, { history: data });
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const teamId = body.team_id;
      const amount = Number(body.amount) || 0;
      const reason = String(body.reason || "").trim();
      if (!teamId || !reason) {
        return json(res, 400, { error: "Некорректные данные" });
      }

      const { data: team, error: teamError } = await supabase
        .from("teams")
        .select("tikuns_balance")
        .eq("id", teamId)
        .single();
      if (teamError || !team) return json(res, 400, { error: "Команда не найдена" });

      const newBalance = team.tikuns_balance + amount;
      const { error: updateError } = await supabase
        .from("teams")
        .update({ tikuns_balance: newBalance })
        .eq("id", teamId);
      if (updateError) throw updateError;

      const { error } = await supabase.from("balance_history").insert([
        {
          team_id: teamId,
          amount,
          reason,
        },
      ]);
      if (error) throw error;

      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Не удалось обновить баланс" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
