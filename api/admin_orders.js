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
      .from("orders")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) return json(res, 500, { error: "Не удалось загрузить заявки" });
    return json(res, 200, { orders: data });
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      const { id, status } = body;
      if (!id || !status) return json(res, 400, { error: "Некорректные данные" });

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .select("*")
        .eq("id", id)
        .single();
      if (orderError || !order) {
        return json(res, 404, { error: "Заявка не найдена" });
      }

      if (status === "approved" && order.status !== "approved") {
        const { data: product, error: productError } = await supabase
          .from("products")
          .select("price,name")
          .eq("id", order.product_id)
          .single();
        if (productError || !product) {
          return json(res, 400, { error: "Товар не найден" });
        }

        const { data: team, error: teamError } = await supabase
          .from("teams")
          .select("tikuns_balance")
          .eq("id", order.team_id)
          .single();
        if (teamError || !team) {
          return json(res, 400, { error: "Команда не найдена" });
        }

        if (team.tikuns_balance < product.price) {
          return json(res, 400, { error: "Недостаточно тикунов" });
        }

        const newBalance = team.tikuns_balance - product.price;
        const { error: balanceError } = await supabase
          .from("teams")
          .update({ tikuns_balance: newBalance })
          .eq("id", order.team_id);
        if (balanceError) throw balanceError;

        const { error: historyError } = await supabase
          .from("balance_history")
          .insert([
            {
              team_id: order.team_id,
              amount: -product.price,
              reason: `Покупка: ${product.name}`,
            },
          ]);
        if (historyError) throw historyError;
      }

      const { error } = await supabase
        .from("orders")
        .update({ status })
        .eq("id", id);
      if (error) throw error;
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Не удалось обновить заявку" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
