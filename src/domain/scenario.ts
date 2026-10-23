import assetManifest from "../../public/demo/chips-v1/manifest.json";
import type { ScenarioSnapshot } from "./scenario-types";

export type { ScenarioSnapshot, ScenarioPricing } from "./scenario-types";

export const CURRENT_SCENARIO_VERSION = "chips-v1";

/** Solo objetos JSON del catálogo propio: no fechas, clases, mapas ni referencias cíclicas. */
function deepFreeze<T extends object>(value: T): T {
  for (const child of Object.values(value)) {
    if (child !== null && typeof child === "object" && !Object.isFrozen(child)) {
      deepFreeze(child);
    }
  }
  return Object.freeze(value);
}

const CHIPS_V1: ScenarioSnapshot = deepFreeze<ScenarioSnapshot>({
  version: "chips-v1",
  isIllustrative: true,
  disclaimer: "Escenario ficticio para explicar Jopói. Empresas, ruta, horarios, distancia, precios y pesajes son ejemplos; las fotos son referencias ajenas a una operación real.",
  material: {
    id: "untreated-forest-chips",
    label: "Chips forestales sin tratar",
    description: "Subproducto forestal a granel representado mediante datos de demostración.",
  },
  generator: { id: "generator-demo", name: "Generador Demo Santa Rosa", isFictitious: true },
  buyer: {
    id: "buyer-demo",
    name: "Comprador Demo Santa Rosa",
    isFictitious: true,
    maximumHumidityPercent: "35.00",
    acceptedMaterialIds: ["untreated-forest-chips"],
  },
  route: {
    id: "santa-rosa-demo",
    label: "Corredor ilustrativo de Santa Rosa, Corrientes",
    origin: "Planta generadora ficticia en Santa Rosa",
    destination: "Planta compradora ficticia del corredor de Santa Rosa",
    distanceKm: "80.000",
  },
  initialLot: {
    quantityKg: "12000.000",
    humidityPercent: "28.00",
    requiredBodyTypes: ["BULK_TIPPER"],
    requiredPickupWindow: { dayOffset: 0, startMinute: 480, endMinute: 600, utcOffset: "-03:00" },
  },
  trips: [
    {
      id: "return-a",
      label: "Retorno A — ejemplo",
      carrier: { id: "carrier-demo-a", name: "Transportista Demo A", isFictitious: true },
      isReturnTrip: true,
      acceptedMaterialIds: ["untreated-forest-chips"],
      availableCapacityKg: "18000.000",
      bodyType: "BULK_TIPPER",
      routeId: "santa-rosa-demo",
      routeCompatible: true,
      pickupWindow: { dayOffset: 0, startMinute: 480, endMinute: 600, utcOffset: "-03:00" },
    },
    {
      id: "trip-b",
      label: "Viaje B — ejemplo",
      carrier: { id: "carrier-demo-b", name: "Transportista Demo B", isFictitious: true },
      isReturnTrip: false,
      acceptedMaterialIds: ["untreated-forest-chips"],
      availableCapacityKg: "8000.000",
      bodyType: "ENCLOSED_VAN",
      routeId: "santa-rosa-demo",
      routeCompatible: true,
      pickupWindow: { dayOffset: 0, startMinute: 840, endMinute: 960, utcOffset: "-03:00" },
    },
  ],
  pricing: {
    currency: "ARS",
    materialPerTonne: "18000.00",
    returnFreight: "90000.00",
    jopoiFee: "18000.00",
    dedicatedFreight: "165000.00",
  },
  rejectionReasons: [
    { code: "HUMIDITY_ABOVE_LIMIT", label: "Humedad superior al requisito de ejemplo" },
    { code: "MATERIAL_NOT_AS_DECLARED", label: "Material distinto de lo declarado en la demostración" },
  ],
  incidentReasons: [
    { code: "WEIGHT_MISMATCH", label: "Peso recibido diferente del declarado" },
    { code: "MATERIAL_ISSUE", label: "Incidencia de material en la recepción de ejemplo" },
  ],
  assets: assetManifest.assets,
});

/** Snapshot nuevo sin referencias compartidas. S03 lo persistirá por recorrido. */
export function createScenarioSnapshot(): ScenarioSnapshot {
  return deepFreeze(structuredClone(CHIPS_V1));
}
