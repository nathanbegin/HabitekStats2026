import crypto from "node:crypto";

const COOKIE_NAME = "habitek_admin";

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));
  if (left.length !== right.length) return false;
  return crypto.timingSafeEqual(left, right);
}

function configuredPassword() {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) {
    throw new Error("ADMIN_PASSWORD is not configured");
  }
  return password;
}

function sessionToken() {
  return crypto
    .createHash("sha256")
    .update(`habitek-admin-session:\${configuredPassword()}`)
    .digest("hex");
}

function parseCookies(req) {
  const raw = req.headers.cookie || "";
  return Object.fromEntries(
    raw
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return index === -1
          ? [part, ""]
          : [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );
}

export function verifyAdminPassword(password) {
  return safeEqual(password, configuredPassword());
}

export function isAdminRequest(req) {
  try {
    const cookies = parseCookies(req);
    return safeEqual(cookies[COOKIE_NAME], sessionToken());
  } catch {
    return false;
  }
}

export function setAdminCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${sessionToken()}; HttpOnly; Path=/; SameSite=Strict; Max-Age=28800${secure}`
  );
}

export function clearAdminCookie(res) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Strict; Max-Age=0${secure}`
  );
}
