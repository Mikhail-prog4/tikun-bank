-- RPC для атомарного списания тикунов с команды.
-- Выполнить в Supabase SQL Editor.

CREATE OR REPLACE FUNCTION deduct_tikuns(
  p_team_id uuid,
  p_amount integer
) RETURNS integer AS $$
DECLARE
  new_bal integer;
BEGIN
  UPDATE teams
  SET tikuns_balance = tikuns_balance - p_amount
  WHERE id = p_team_id AND tikuns_balance >= p_amount
  RETURNING tikuns_balance INTO new_bal;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;
  RETURN new_bal;
END;
$$ LANGUAGE plpgsql;
