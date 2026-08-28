import { clearAdminCookie } from "../../lib/adminAuth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  clearAdminCookie(res);
  res.setHeader("Cache-Control", "no-store");
  return res.status(200).json({ ok: true });
}
