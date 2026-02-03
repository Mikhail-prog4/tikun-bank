const jwt = require("jsonwebtoken");
const { createClient } = require("@supabase/supabase-js");

const getSupabase = () => {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Отсутствуют переменные окружения Supabase");
  }
  return createClient(url, key);
};

const parseBody = async (req) => {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => {
      data += chunk;
    });
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (error) {
        reject(error);
      }
    });
  });
};

const json = (res, status, payload) => {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(payload));
};

const getSettings = async (supabase) => {
  const { data, error } = await supabase
    .from("settings")
    .select("*")
    .eq("id", 1)
    .single();
  if (error) throw error;
  return data;
};

const signToken = (payload) => {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("Отсутствует ADMIN_JWT_SECRET");
  return jwt.sign(payload, secret, { expiresIn: "12h" });
};

const verifyToken = (token) => {
  const secret = process.env.ADMIN_JWT_SECRET;
  if (!secret) throw new Error("Отсутствует ADMIN_JWT_SECRET");
  return jwt.verify(token, secret);
};

const requireAdmin = (req) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) throw new Error("Неавторизовано");
  return verifyToken(token);
};

module.exports = {
  getSupabase,
  parseBody,
  json,
  getSettings,
  signToken,
  verifyToken,
  requireAdmin,
};
