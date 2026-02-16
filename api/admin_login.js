const { parseBody, json, signToken } = require("./_utils");
const { compareSync } = require("bcryptjs");

module.exports = async (req, res) => {
  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.setHeader("Access-Control-Allow-Origin", req.headers.origin || "*");
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.end();
    return;
  }
  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }
  try {
    const body = await parseBody(req);
    const password = String(body.password || "").trim();
    const expected = String(process.env.ADMIN_PASSWORD || "").trim();
    if (!expected) {
      return json(res, 500, { error: "Не задан ADMIN_PASSWORD" });
    }
    const isHash = /^\$2[aby]?\$\d{1,2}\$/.test(expected);
    const ok = isHash ? compareSync(password, expected) : password === expected;
    if (!ok) {
      return json(res, 401, { error: "Неверный пароль" });
    }
    const token = signToken({ role: "admin" });
    return json(res, 200, { token });
  } catch (error) {
    return json(res, 500, { error: "Ошибка входа" });
  }
};
