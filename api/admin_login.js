const bcrypt = require("bcryptjs");
const { parseBody, json, signToken } = require("./_utils");

const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;
const loginAttempts = new Map();

const checkRateLimit = (ip) => {
  const now = Date.now();
  const entry = loginAttempts.get(ip);
  if (!entry || now - entry.windowStart > LOGIN_WINDOW_MS) {
    loginAttempts.set(ip, { windowStart: now, count: 1 });
    return true;
  }
  entry.count += 1;
  return entry.count <= MAX_ATTEMPTS;
};

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return json(res, 405, { error: "Метод не поддерживается" });
  }
  try {
    const ip =
      req.headers["x-forwarded-for"] ||
      req.headers["x-real-ip"] ||
      req.socket?.remoteAddress ||
      "unknown";

    if (!checkRateLimit(ip)) {
      return json(res, 429, { error: "Слишком много попыток. Подождите 15 минут." });
    }

    const body = await parseBody(req);
    const password = body.password || "";
    const expected = process.env.ADMIN_PASSWORD || "";
    if (!expected) {
      return json(res, 500, { error: "Не задан ADMIN_PASSWORD" });
    }

    let isValid = false;
    if (expected.startsWith("$2a$") || expected.startsWith("$2b$")) {
      isValid = await bcrypt.compare(password, expected);
    } else {
      isValid = password === expected;
    }

    if (!isValid) {
      return json(res, 401, { error: "Неверный пароль" });
    }
    const token = signToken({ role: "admin" });
    return json(res, 200, { token });
  } catch (error) {
    return json(res, 500, { error: "Ошибка входа" });
  }
};
