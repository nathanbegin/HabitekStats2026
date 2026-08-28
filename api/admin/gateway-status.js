import { isAdminRequest } from "../../lib/adminAuth.js";
import {
  getSg50Capabilities,
  getSg50Status,
  isMilesightOpenApiConfigured,
} from "../../lib/milesightOpenApi.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isMilesightOpenApiConfigured()) {
    return res.status(200).json({
      configured: false,
      error:
        "Milesight Open API non configurée. Ajoute MILESIGHT_CLIENT_ID et MILESIGHT_CLIENT_SECRET dans Vercel.",
    });
  }

  try {
    const status = await getSg50Status();

    let capabilities = null;
    let capabilitiesError = null;
    try {
      capabilities = await getSg50Capabilities(status?.gateway?.deviceId || null);
    } catch (error) {
      capabilitiesError =
        error?.message || "Impossible de récupérer les services TSL du SG50.";
    }

    return res.status(200).json({
      configured: true,
      ...status,
      capabilities,
      capabilitiesError,
    });
  } catch (error) {
    console.error("[api/admin/gateway-status]", error);
    return res.status(502).json({
      configured: true,
      error: error?.message || "Impossible de récupérer l'état du SG50.",
    });
  }
}
