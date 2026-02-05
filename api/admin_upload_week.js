const { getSupabase, parseBody, json, requireAdmin } = require("./_utils");

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getRanking = (teams) => {
  const activeTeams = teams.filter((team) => team.is_active);
  const sorted = [...activeTeams].sort((a, b) => {
    if (b.cumulative_score !== a.cumulative_score) {
      return b.cumulative_score - a.cumulative_score;
    }
    return a.name.localeCompare(b.name, "ru");
  });
  return sorted.map((team, idx) => ({
    team,
    rank: idx + 1,
  }));
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
    const body = await parseBody(req);
    const weekNumber = Number(body.week_number) || 1;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const supabase = getSupabase();

    const { data: teams, error: teamsError } = await supabase
      .from("teams")
      .select("*");
    if (teamsError) throw teamsError;

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("current_week")
      .eq("id", 1)
      .single();
    if (settingsError) throw settingsError;

    const { data: snapshotTeams, error: snapshotTeamsError } = await supabase
      .from("teams")
      .select(
        "id,current_week_score,cumulative_score,tikuns_balance,previous_rank,is_active"
      );
    if (snapshotTeamsError) throw snapshotTeamsError;

    const { data: snapshotScores, error: snapshotScoresError } = await supabase
      .from("weekly_scores")
      .select("team_id,week_number,score")
      .eq("week_number", weekNumber);
    if (snapshotScoresError) throw snapshotScoresError;

    const { error: historySnapshotError } = await supabase
      .from("rating_history")
      .insert({
        action: "upload_week",
        payload: {
          week_number: weekNumber,
          settings: { current_week: settings.current_week },
          teams: snapshotTeams,
          weekly_scores: snapshotScores,
        },
      });
    if (historySnapshotError) {
      const message = String(historySnapshotError.message || "");
      if (
        historySnapshotError.code === "42P01" ||
        message.includes("schema cache") ||
        message.includes("rating_history")
      ) {
        console.warn(
          "rating_history недоступна, пропускаем snapshot",
          historySnapshotError
        );
      } else {
        throw historySnapshotError;
      }
    }

    // Сохраняем позиции ДО любых изменений недели
    const ranking = getRanking(teams);
    await Promise.all(
      ranking.map((entry) =>
        supabase
          .from("teams")
          .update({ previous_rank: entry.rank })
          .eq("id", entry.team.id)
      )
    );

    const teamMap = new Map();
    teams.forEach((team) => teamMap.set(normalizeName(team.name), team));

    const newTeams = rows
      .map((row) => String(row.name || "").trim())
      .filter((name) => name && !teamMap.has(normalizeName(name)))
      .map((name) => ({
        name,
        current_week_score: 0,
        cumulative_score: 0,
        tikuns_balance: 0,
        previous_rank: null,
        is_active: true,
      }));

    if (newTeams.length) {
      const { error: insertError } = await supabase.from("teams").insert(newTeams);
      if (insertError) throw insertError;
    }

    const { data: refreshedTeams, error: refreshedError } = await supabase
      .from("teams")
      .select("*");
    if (refreshedError) throw refreshedError;

    const refreshedMap = new Map();
    refreshedTeams.forEach((team) =>
      refreshedMap.set(normalizeName(team.name), team)
    );

    await supabase.from("weekly_scores").delete().eq("week_number", weekNumber);

    const insertScores = rows.map((row) => {
      const team = refreshedMap.get(normalizeName(row.name));
      return {
        team_id: team.id,
        week_number: weekNumber,
        score: Number(row.score) || 0,
      };
    });

    if (insertScores.length) {
      const { error: scoresError } = await supabase
        .from("weekly_scores")
        .insert(insertScores);
      if (scoresError) throw scoresError;
    }

    const { data: allScores, error: allScoresError } = await supabase
      .from("weekly_scores")
      .select("team_id,week_number,score");
    if (allScoresError) throw allScoresError;

    const { data: history, error: historyError } = await supabase
      .from("balance_history")
      .select("team_id,amount");
    if (historyError) throw historyError;

    const scoreTotals = {};
    const weekTotals = {};
    allScores.forEach((row) => {
      scoreTotals[row.team_id] =
        (scoreTotals[row.team_id] || 0) + Number(row.score || 0);
      if (row.week_number === weekNumber) {
        weekTotals[row.team_id] =
          (weekTotals[row.team_id] || 0) + Number(row.score || 0);
      }
    });

    const balanceAdjust = {};
    history.forEach((row) => {
      balanceAdjust[row.team_id] =
        (balanceAdjust[row.team_id] || 0) + Number(row.amount || 0);
    });

    for (const team of refreshedTeams) {
      const cumulative = scoreTotals[team.id] || 0;
      const weekScore = weekTotals[team.id] || 0;
      const tikuns = Math.round(cumulative * 100) + (balanceAdjust[team.id] || 0);
      await supabase
        .from("teams")
        .update({
          cumulative_score: cumulative,
          current_week_score: weekScore,
          tikuns_balance: tikuns,
        })
        .eq("id", team.id);
    }

    await supabase
      .from("settings")
      .update({ current_week: weekNumber })
      .eq("id", 1);

    return json(res, 200, { ok: true });
  } catch (error) {
    const details =
      error && error.message ? error.message : "Не удалось загрузить неделю";
    return json(res, 500, { error: details });
  }
};
