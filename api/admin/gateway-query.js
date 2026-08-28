import { isAdminRequest } from "../../lib/adminAuth.js";
import {
  invokeSg50StatusQuery,
  isMilesightOpenApiConfigured,
} from "../../lib/milesightOpenApi.js";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  if (!isAdminRequest(req)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  if (!isMilesightOpenApiConfigured()) {
    return res.status(400).json({
      error: "Milesight Open API non configurée.",
    });
  }

  try {
    const result = await invokeSg50StatusQuery();

    if (!result.supported) {
      return res.status(409).json({
        supported: false,
        error:
          "Le TSL du SG50 ne publie aucun service sûr permettant de demander un nouvel état.",
      });
    }

    return res.status(202).json({
      supported: true,
      ...result,
      message: "Commande d'interrogation envoyée au SG50.",
    });
  } catch (error) {
    console.error("[api/admin/gateway-query]", error);
    return res.status(502).json({
      error: error?.message || "Impossible d'interroger le SG50.",
    });
  }
}
