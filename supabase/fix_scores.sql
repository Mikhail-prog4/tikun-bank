-- ============================================================
-- ВОССТАНОВЛЕНИЕ БАЛЛОВ (cumulative_score + tikuns_balance)
--
-- Формула:
--   cumulative_score = SUM(weekly_scores) + SUM(score_history.amount)
--   tikuns_balance   = ROUND(cumulative_score * 100) + SUM(balance_history)
-- ============================================================


-- ШАГ 1: ПРОВЕРКА (только смотрим, ничего не меняем)

SELECT
  t.id,
  t.name,
  t.is_active,
  t.cumulative_score   AS "сейчас_баллы",
  t.tikuns_balance     AS "сейчас_тикуны",
  COALESCE(ws.total_weekly, 0)       AS "из_weekly_scores",
  COALESCE(sh.total_adjust, 0)       AS "из_score_history",
  GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
  )                                  AS "правильные_баллы",
  ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0)
                                     AS "правильные_тикуны",
  GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
  ) - t.cumulative_score             AS "разница_баллы",
  (ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0))
  - t.tikuns_balance                 AS "разница_тикуны"
FROM teams t
LEFT JOIN (
  SELECT team_id, SUM(score) AS total_weekly
  FROM weekly_scores
  GROUP BY team_id
) ws ON ws.team_id = t.id
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_adjust
  FROM score_history
  GROUP BY team_id
) sh ON sh.team_id = t.id
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_balance_adj
  FROM balance_history
  GROUP BY team_id
) bh ON bh.team_id = t.id
ORDER BY t.is_active DESC, t.name;


-- ШАГ 2: ИСПРАВЛЕНИЕ (запускай ТОЛЬКО после проверки шага 1)

UPDATE teams t
SET
  cumulative_score = GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
  ),
  tikuns_balance = ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sh.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0)
FROM (
  SELECT team_id, SUM(score) AS total_weekly
  FROM weekly_scores
  GROUP BY team_id
) ws
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_adjust
  FROM score_history
  GROUP BY team_id
) sh ON sh.team_id = ws.team_id
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_balance_adj
  FROM balance_history
  GROUP BY team_id
) bh ON bh.team_id = ws.team_id
WHERE t.id = ws.team_id;
