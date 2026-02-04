const { parseBody, json, signToken } = require("./_utils");

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }
  try {
    const body = await parseBody(req);
    const password = body.password || "";
    const expected = process.env.ADMIN_PASSWORD || "";
    if (!expected) {
      return json(res, 500, { error: "Не задан ADMIN_PASSWORD" });
    }
    if (password !== expected) {
      return json(res, 401, { error: "Неверный пароль" });
    }
    const token = signToken({ role: "admin" });
    return json(res, 200, { token });
  } catch (error) {
    return json(res, 500, { error: "Ошибка входа" });
  }
};
