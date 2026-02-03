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
      .from("products")
      .select("*")
      .order("created_at", { ascending: true });
    if (error) return json(res, 500, { error: "Не удалось загрузить товары" });
    return json(res, 200, { products: data });
  }

  if (req.method === "POST") {
    try {
      const body = await parseBody(req);
      if (body.delete) {
        if (!body.id) return json(res, 400, { error: "Не указан id" });
        const { error } = await supabase.from("products").delete().eq("id", body.id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }

      if (body.id) {
        const updates = {};
        ["name", "description", "category"].forEach((key) => {
          if (body[key]) updates[key] = String(body[key]).trim();
        });
        if (typeof body.price === "number") updates.price = body.price;
        if (typeof body.is_active === "boolean") updates.is_active = body.is_active;
        if (Object.keys(updates).length === 0) {
          return json(res, 400, { error: "Некорректные данные" });
        }
        const { error } = await supabase
          .from("products")
          .update(updates)
          .eq("id", body.id);
        if (error) throw error;
        return json(res, 200, { ok: true });
      }

      const { name, description, price, category } = body;
      if (!name || !description || !category) {
        return json(res, 400, { error: "Некорректные данные" });
      }
      const { error } = await supabase.from("products").insert([
        {
          name: String(name).trim(),
          description: String(description).trim(),
          price: Number(price) || 0,
          category,
          is_active: true,
        },
      ]);
      if (error) throw error;
      return json(res, 200, { ok: true });
    } catch (error) {
      return json(res, 500, { error: "Не удалось сохранить товар" });
    }
  }

  return json(res, 405, { error: "Метод не поддерживается" });
};
