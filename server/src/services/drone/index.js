import { env } from '../../config/env.js';
import { SimulatedChargingController } from './ChargingController.js';
import { SimulatedFlightController } from './SimulatedFlightController.js';

// Swap these for hardware/cloud adapters implementing the same interfaces.
export const flightController = new SimulatedFlightController(env.drone);
export const chargingController = new SimulatedChargingController(env.drone);
