import { verifyAdminPassword } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
    const password = String(body?.password || "");

    if (!verifyAdminPassword(password)) {
      return res.status(401).json({ error: "Mot de passe invalide" });
    }

    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error("[api/demo/authorize]", error);
    return res.status(500).json({ error: "Impossible de vérifier le mot de passe" });
  }
}
