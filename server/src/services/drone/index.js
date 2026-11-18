import { env } from '../../config/env.js';
import { SimulatedFlightController } from './SimulatedFlightController.js';

// Swap this for a hardware/cloud adapter implementing the same interface.
export const flightController = new SimulatedFlightController(env.drone);
