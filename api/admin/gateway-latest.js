import { isAdminRequest } from "../../lib/adminAuth.js";
import {
  getMilesightDeviceLatest,
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
    return res.status(400).json({
      error: "Milesight Open API non configurée.",
    });
  }

  const deviceId =
    typeof req.query?.deviceId === "string" ? req.query.deviceId.trim() : "";

  if (!deviceId) {
    return res.status(400).json({ error: "deviceId requis" });
  }

  try {
    const device = await getMilesightDeviceLatest(deviceId);

    return res.status(200).json({
      ok: true,
      route: "/device/openapi/v1/devices/{deviceId}",
      fetchedAt: Date.now(),
      device,
    });
  } catch (error) {
    console.error("[api/admin/gateway-latest]", error);
    return res.status(502).json({
      error:
        error?.message ||
        "Impossible de récupérer la dernière information du SG50.",
    });
  }
}
