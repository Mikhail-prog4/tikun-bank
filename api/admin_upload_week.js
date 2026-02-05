const { getSupabase, parseBody, json, requireAdmin } = require("./_utils");

const normalizeName = (value) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getRanking = (teams) => {
  const activeTeams = teams.filter((team) => team.is_active);
  const sorted = [...activeTeams].sort((a, b) => {
    if (Number(b.cumulative_score || 0) !== Number(a.cumulative_score || 0)) {
      return Number(b.cumulative_score || 0) - Number(a.cumulative_score || 0);
    }
    return String(a.name || "").localeCompare(String(b.name || ""), "ru");
  });
  return sorted.map((team, idx) => ({ team, rank: idx + 1 }));
};

const extractMissingColumnFromSchemaCacheError = (message) => {
  // Examples:
  // "Could not find the 'uploaded_at' column of 'rating_history' in the schema cache"
  // "Could not find the 'payload' column of 'rating_history' in the schema cache"
  if (!message) return null;
  const m = String(message).match(/Could not find the '([^']+)' column/i);
  return m ? m[1] : null;
};

const insertRatingHistoryResilient = async (supabase, record) => {
  // Try insert; if schema cache says some column doesn't exist, retry without that column.
  let payload = { ...record };
  const removed = [];
  for (let attempt = 1; attempt <= 6; attempt += 1) {
    const { data, error } = await supabase
      .from("rating_history")
      .insert(payload)
      .select("id");

    if (!error) return { data, removedColumns: removed };

    const missingCol = extractMissingColumnFromSchemaCacheError(error.message);
    if (missingCol && Object.prototype.hasOwnProperty.call(payload, missingCol)) {
      delete payload[missingCol];
      removed.push(missingCol);
      continue;
    }

    // Not a schema-cache-missing-column error, or column not in payload => stop.
    return { data: null, error, removedColumns: removed };
  }

  return {
    data: null,
    error: new Error("rating_history insert failed after retries"),
    removedColumns: removed,
  };
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
    const weekNumber = Number(body.week_number);
    const rows = Array.isArray(body.rows) ? body.rows : [];
    const supabase = getSupabase();

    const respondError = (step, error) =>
      json(res, 500, {
        ok: false,
        step,
        error: error && error.message ? error.message : String(error),
        details: error && error.details ? error.details : null,
      });

    // --- Validate input ---
    if (!Number.isFinite(weekNumber)) {
      return json(res, 400, { ok: false, error: "week_number обязателен и должен быть числом" });
    }
    if (!rows.length) {
      return json(res, 400, { ok: false, error: "rows пустой" });
    }
    for (const row of rows) {
      const name = String(row.name || row.team_name || "").trim();
      const score = Number(row.score);
      if (!name) {
        return json(res, 400, { ok: false, error: "Некорректная строка: нет team_name" });
      }
      if (!Number.isFinite(score)) {
        return json(res, 400, { ok: false, error: "Некорректная строка: score обязателен" });
      }
    }

    // --- Load current state ---
    const { data: teams, error: teamsError } = await supabase.from("teams").select("*");
    if (teamsError) return respondError("load_teams", teamsError);

    const { data: settings, error: settingsError } = await supabase
      .from("settings")
      .select("current_week")
      .eq("id", 1)
      .single();
    if (settingsError) return respondError("load_settings", settingsError);

    const { data: snapshotTeams, error: snapshotTeamsError } = await supabase
      .from("teams")
      .select("id,current_week_score,cumulative_score,tikuns_balance,previous_rank,is_active,name");
    if (snapshotTeamsError) return respondError("snapshot_teams", snapshotTeamsError);

    const { data: snapshotScores, error: snapshotScoresError } = await supabase
      .from("weekly_scores")
      .select("team_id,week_number,score")
      .eq("week_number", weekNumber);
    if (snapshotScoresError) return respondError("snapshot_scores", snapshotScoresError);

    // --- Snapshot into rating_history (resilient) ---
    const nowIso = new Date().toISOString();
    const historyRecord = {
      week: weekNumber,
      uploaded_at: nowIso,
      created_at: nowIso,
      action: "upload_week",
      details: null,
      payload: {
        ts: nowIso,
        week_number: weekNumber,
        settings: { current_week: settings.current_week },
        teams: snapshotTeams,
        weekly_scores: snapshotScores,
      },
    };

    const historyResult = await insertRatingHistoryResilient(supabase, historyRecord);
    if (historyResult.error) return respondError("snapshot_insert", historyResult.error);

    // --- Save ranks BEFORE changes (only active) ---
    const ranking = getRanking(teams);
    for (const entry of ranking) {
      const { error: rankError } = await supabase
        .from("teams")
        .update({ previous_rank: entry.rank })
        .eq("id", entry.team.id);
      if (rankError) return respondError("update_previous_rank", rankError);
    }

    // --- Build map of existing teams by normalized name (including inactive) ---
    const teamMap = new Map();
    teams.forEach((team) => teamMap.set(normalizeName(team.name), team));

    const uniqueNames = Array.from(
      new Set(rows.map((r) => String(r.name || r.team_name || "").trim()).filter(Boolean))
    );

    // --- Insert teams that truly do not exist ---
    const newTeams = uniqueNames
      .filter((name) => !teamMap.has(normalizeName(name)))
      .map((name) => ({
        name,
        current_week_score: 0,
        cumulative_score: 0,
        tikuns_balance: 0,
        previous_rank: null,
        is_active: true,
      }));

    let insertedTeams = 0;
    if (newTeams.length) {
      const { data: inserted, error: insertError } = await supabase
        .from("teams")
        .insert(newTeams)
        .select("id");
      if (insertError) return respondError("insert_new_teams", insertError);
      insertedTeams = (inserted || []).length;
    }

    // --- Reload teams after possible inserts ---
    const { data: refreshedTeams, error: refreshedError } = await supabase
      .from("teams")
      .select("*");
    if (refreshedError) return respondError("reload_teams", refreshedError);

    const refreshedMap = new Map();
    refreshedTeams.forEach((team) => refreshedMap.set(normalizeName(team.name), team));

    // --- Reactivate teams that are in uploaded Excel (key fix) ---
    const uploadedTeamIds = [];
    for (const name of uniqueNames) {
      const team = refreshedMap.get(normalizeName(name));
      if (!team) return respondError("resolve_team_ids", new Error(`Team not found: "${name}"`));
      uploadedTeamIds.push(team.id);
    }

    const { error: reactivateError } = await supabase
      .from("teams")
      .update({ is_active: true })
      .in("id", uploadedTeamIds);
    if (reactivateError) return respondError("reactivate_uploaded_teams", reactivateError);

    // --- Replace weekly scores for this week ---
    const { data: deletedScores, error: deleteScoresError } = await supabase
      .from("weekly_scores")
      .delete()
      .eq("week_number", weekNumber)
      .select("id");
    if (deleteScoresError) return respondError("delete_weekly_scores", deleteScoresError);

    const insertScores = rows.map((row) => {
      const teamName = String(row.name || row.team_name || "").trim();
      const team = refreshedMap.get(normalizeName(teamName));
      if (!team) throw new Error(`Не найдена команда по имени: "${teamName}"`);
      return { team_id: team.id, week_number: weekNumber, score: Number(row.score) || 0 };
    });

    let insertedScores = 0;
    if (insertScores.length) {
      const { data: inserted, error: scoresError } = await supabase
        .from("weekly_scores")
        .insert(insertScores)
        .select("id");
      if (scoresError) return respondError("insert_weekly_scores", scoresError);
      insertedScores = (inserted || []).length;
    }

    // --- Recalculate totals ---
    const { data: allScores, error: allScoresError } = await supabase
      .from("weekly_scores")
      .select("team_id,week_number,score");
    if (allScoresError) return respondError("load_all_scores", allScoresError);

    const { data: history, error: historyError } = await supabase
      .from("balance_history")
      .select("team_id,amount");
    if (historyError) return respondError("load_balance_history", historyError);

    const scoreTotals = {};
    const weekTotals = {};
    allScores.forEach((row) => {
      const tid = row.team_id;
      scoreTotals[tid] = (scoreTotals[tid] || 0) + Number(row.score || 0);
      if (row.week_number === weekNumber) {
        weekTotals[tid] = (weekTotals[tid] || 0) + Number(row.score || 0);
      }
    });

    const balanceAdjust = {};
    history.forEach((row) => {
      balanceAdjust[row.team_id] = (balanceAdjust[row.team_id] || 0) + Number(row.amount || 0);
    });

    let updatedTeams = 0;
    for (const team of refreshedTeams) {
      const cumulative = scoreTotals[team.id] || 0;
      const weekScore = weekTotals[team.id] || 0;
      const tikuns = Math.round(cumulative * 100) + (balanceAdjust[team.id] || 0);

      const { error: updateError } = await supabase
        .from("teams")
        .update({
          cumulative_score: cumulative,
          current_week_score: weekScore,
          tikuns_balance: tikuns,
        })
        .eq("id", team.id);
      if (updateError) return respondError("update_team_scores", updateError);
      updatedTeams += 1;
    }

    // --- Update current week ---
    const { error: settingsUpdateError } = await supabase
      .from("settings")
      .update({ current_week: weekNumber })
      .eq("id", 1);
    if (settingsUpdateError) return respondError("update_settings", settingsUpdateError);

    return json(res, 200, {
      ok: true,
      week: weekNumber,
      upserts: insertedScores,
      history_inserts: (historyResult.data || []).length,
      history_removed_columns: historyResult.removedColumns || [],
      updated_public_settings: true,
      inserted_teams: insertedTeams,
      updated_teams: updatedTeams,
      deleted_scores: (deletedScores || []).length,
      reactivated_teams: uploadedTeamIds.length,
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      step: "unexpected",
      error: error && error.message ? error.message : String(error),
      details: error && error.details ? error.details : null,
    });
  }
};
