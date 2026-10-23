export interface ScenarioPricing {
  readonly currency: "ARS";
  readonly materialPerTonne: string;
  readonly returnFreight: string;
  readonly jopoiFee: string;
  readonly dedicatedFreight: string;
}

export interface ExampleAsset {
  readonly id: string;
  readonly kind: string;
  readonly localPath: string;
  readonly mediaType: string;
  readonly width: number;
  readonly height: number;
  readonly author: string;
  readonly sourceUrl: string | null;
  readonly downloadUrl: string | null;
  readonly license: string;
  readonly licenseUrl: string | null;
  readonly obtainedOn: string;
  readonly changes: string;
  readonly attribution: string;
  readonly alt: string;
  readonly caption: string;
  readonly referenceQuantityKg: string | null;
}

export interface ExampleCompany {
  readonly id: string;
  readonly name: string;
  readonly isFictitious: true;
}

/** Minutos desde medianoche de un día ilustrativo, sin fecha ni reloj de servidor. */
export interface ExamplePickupWindow {
  readonly dayOffset: number;
  readonly startMinute: number;
  readonly endMinute: number;
  readonly utcOffset: "-03:00";
}

export interface ExampleTrip {
  readonly id: string;
  readonly label: string;
  readonly carrier: ExampleCompany;
  readonly isReturnTrip: boolean;
  readonly acceptedMaterialIds: readonly string[];
  readonly availableCapacityKg: string;
  readonly bodyType: "BULK_TIPPER" | "ENCLOSED_VAN";
  readonly routeId: string;
  readonly routeCompatible: boolean;
  readonly pickupWindow: ExamplePickupWindow;
}

export interface ExampleReason {
  readonly code: string;
  readonly label: string;
}

/** Datos de ejemplo, sin propiedad de sesión, estados, fechas dinámicas ni BigInt. */
export interface ScenarioSnapshot {
  readonly version: string;
  readonly isIllustrative: true;
  readonly disclaimer: string;
  readonly material: {
    readonly id: string;
    readonly label: string;
    readonly description: string;
  };
  readonly generator: ExampleCompany;
  readonly buyer: ExampleCompany & {
    readonly maximumHumidityPercent: string;
    readonly acceptedMaterialIds: readonly string[];
  };
  readonly route: {
    readonly id: string;
    readonly label: string;
    readonly origin: string;
    readonly destination: string;
    readonly distanceKm: string;
  };
  readonly initialLot: {
    readonly quantityKg: string;
    readonly humidityPercent: string;
    readonly requiredBodyTypes: readonly ExampleTrip["bodyType"][];
    readonly requiredPickupWindow: ExamplePickupWindow;
  };
  readonly trips: readonly ExampleTrip[];
  readonly pricing: ScenarioPricing;
  readonly rejectionReasons: readonly ExampleReason[];
  readonly incidentReasons: readonly ExampleReason[];
  readonly assets: readonly ExampleAsset[];
}
