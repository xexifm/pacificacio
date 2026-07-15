export const VEHICLE_TYPES = ['Cotxe', 'Moto', 'Furgoneta', 'Autobús', 'Camió', 'Desconegut'] as const;

export type VehicleType = typeof VEHICLE_TYPES[number];
