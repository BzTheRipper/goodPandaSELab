import * as delivery from '../services/delivery.service.js';

/** Hardware telemetry ingest (shared-key auth, not a user JWT). */
export async function telemetry(req, res) {
  const { ignored, drone } = await delivery.ingestTelemetry(req.params.id, req.body);
  res.status(ignored ? 200 : 202).json({
    ignored,
    drone: {
      id: drone._id,
      identifier: drone.identifier,
      status: drone.status,
      battery: drone.battery,
      location: drone.location,
      lastTelemetryAt: drone.lastTelemetryAt,
      telemetrySeq: drone.telemetrySeq,
    },
  });
}
