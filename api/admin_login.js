const { getSupabase, parseBody, json, getSettings, signToken } =
  require("./_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }
  try {
    const body = await parseBody(req);
    const password = body.password || "";
    const supabase = getSupabase();
    const settings = await getSettings(supabase);
    if (password !== settings.admin_password) {
      return json(res, 401, { error: "Неверный пароль" });
    }
    const token = signToken({ role: "admin" });
    return json(res, 200, { token });
  } catch (error) {
    return json(res, 500, { error: "Ошибка входа" });
  }
};
