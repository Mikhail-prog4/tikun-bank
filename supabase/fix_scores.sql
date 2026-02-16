-- ============================================================
-- ВОССТАНОВЛЕНИЕ БАЛЛОВ (cumulative_score + tikuns_balance)
--
-- Проблема: при загрузке новой недели cumulative_score
-- пересчитывался ТОЛЬКО из weekly_scores, а ручные
-- корректировки (score_adjust) терялись.
--
-- Этот запрос пересчитывает ВСЕ из первоисточников:
--   cumulative_score = SUM(weekly_scores) + SUM(score_adjust.delta)
--   tikuns_balance    = ROUND(cumulative_score * 100) + SUM(balance_history)
--
-- ИНСТРУКЦИЯ:
--   1. Сначала запусти SELECT (шаг 1) — посмотри что изменится
--   2. Если всё верно — запусти UPDATE (шаг 2)
-- ============================================================


-- ═══════════════════════════════════════════════════════════
-- ШАГ 1: ПРОВЕРКА (только смотрим, ничего не меняем)
-- ═══════════════════════════════════════════════════════════

SELECT
  t.id,
  t.name,
  t.is_active,

  -- Текущие (возможно неверные) значения
  t.cumulative_score   AS "сейчас_баллы",
  t.tikuns_balance     AS "сейчас_тикуны",

  -- Правильные значения из первоисточников
  COALESCE(ws.total_weekly, 0)  AS "из_weekly_scores",
  COALESCE(sa.total_adjust, 0)  AS "из_score_adjust",
  GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
  )                             AS "правильные_баллы",

  ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0)
                                AS "правильные_тикуны",

  -- Разница (если не 0 — значит данные испорчены)
  GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
  ) - t.cumulative_score        AS "разница_баллы",

  (ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0))
  - t.tikuns_balance            AS "разница_тикуны"

FROM teams t

-- Сумма баллов из weekly_scores
LEFT JOIN (
  SELECT team_id, SUM(score) AS total_weekly
  FROM weekly_scores
  GROUP BY team_id
) ws ON ws.team_id = t.id

-- Сумма ручных корректировок баллов из rating_history
LEFT JOIN (
  SELECT
    payload->>'team_id' AS team_id,
    SUM((payload->>'delta')::numeric) AS total_adjust
  FROM rating_history
  WHERE action = 'score_adjust'
    AND undone = false
  GROUP BY payload->>'team_id'
) sa ON sa.team_id = t.id::text

-- Сумма ручных корректировок тикунов из balance_history
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_balance_adj
  FROM balance_history
  GROUP BY team_id
) bh ON bh.team_id = t.id

ORDER BY t.is_active DESC, t.name;


-- ═══════════════════════════════════════════════════════════
-- ШАГ 2: ИСПРАВЛЕНИЕ (запускай ТОЛЬКО после проверки шага 1)
-- ═══════════════════════════════════════════════════════════

UPDATE teams t
SET
  cumulative_score = GREATEST(0,
    COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
  ),
  tikuns_balance = ROUND(
    GREATEST(0,
      COALESCE(ws.total_weekly, 0) + COALESCE(sa.total_adjust, 0)
    ) * 100
  ) + COALESCE(bh.total_balance_adj, 0)

FROM (
  -- weekly_scores
  SELECT team_id, SUM(score) AS total_weekly
  FROM weekly_scores
  GROUP BY team_id
) ws

-- score_adjust
LEFT JOIN (
  SELECT
    payload->>'team_id' AS team_id,
    SUM((payload->>'delta')::numeric) AS total_adjust
  FROM rating_history
  WHERE action = 'score_adjust'
    AND undone = false
  GROUP BY payload->>'team_id'
) sa ON sa.team_id = ws.team_id::text

-- balance_history
LEFT JOIN (
  SELECT team_id, SUM(amount) AS total_balance_adj
  FROM balance_history
  GROUP BY team_id
) bh ON bh.team_id = ws.team_id

WHERE t.id = ws.team_id;
