import {
  setAdminCookie,
  verifyAdminPassword,
} from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  res.setHeader("Cache-Control", "no-store");

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const password = body?.password || "";

    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ error: "Mot de passe invalide" });
    }

    setAdminCookie(res);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[api/admin/login]", error);
    return res.status(500).json({ error: "Configuration admin invalide" });
  }
}
