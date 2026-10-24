import { z } from "zod";
import { eventHumidity, eventQuantity, eventText } from "./event-schemas";
import type { ScenarioSnapshot } from "./scenario-types";

const company = z.strictObject({ id: eventText, name: eventText, isFictitious: z.literal(true) });
const body = z.enum(["BULK_TIPPER", "ENCLOSED_VAN"]);
const window = z.strictObject({ dayOffset: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  startMinute: z.number().int().min(0).max(1439), endMinute: z.number().int().min(1).max(1440), utcOffset: z.literal("-03:00") })
  .refine((value) => value.startMinute < value.endMinute);
const reason = z.strictObject({ code: eventText, label: eventText });
const money = z.string().regex(/^(0|[1-9]\d*)\.\d{2}$/);
const capacity = z.string().regex(/^(0|[1-9]\d*)\.\d{3}$/);
const asset = z.strictObject({
  id: eventText, kind: eventText, localPath: eventText, mediaType: eventText,
  width: z.number().int().positive(), height: z.number().int().positive(), author: eventText,
  sourceUrl: eventText.nullable(), downloadUrl: eventText.nullable(), license: eventText, licenseUrl: eventText.nullable(),
  obtainedOn: eventText, changes: eventText, attribution: eventText, alt: eventText, caption: eventText,
  referenceQuantityKg: eventQuantity.nullable(),
});
export const snapshotSchema: z.ZodType<ScenarioSnapshot> = z.strictObject({
  version: eventText, isIllustrative: z.literal(true), disclaimer: eventText,
  material: z.strictObject({ id: eventText, label: eventText, description: eventText }), generator: company,
  buyer: company.extend({ maximumHumidityPercent: eventHumidity, acceptedMaterialIds: z.array(eventText).min(1) }),
  route: z.strictObject({ id: eventText, label: eventText, origin: eventText, destination: eventText, distanceKm: capacity }),
  initialLot: z.strictObject({ quantityKg: eventQuantity, humidityPercent: eventHumidity,
    requiredBodyTypes: z.array(body).min(1), requiredPickupWindow: window }),
  trips: z.array(z.strictObject({ id: eventText, label: eventText, carrier: company, isReturnTrip: z.boolean(),
    acceptedMaterialIds: z.array(eventText), availableCapacityKg: capacity, bodyType: body,
    routeId: eventText, routeCompatible: z.boolean(), pickupWindow: window })),
  pricing: z.strictObject({ currency: z.literal("ARS"), materialPerTonne: money, returnFreight: money, jopoiFee: money, dedicatedFreight: money }),
  rejectionReasons: z.array(reason), incidentReasons: z.array(reason), assets: z.array(asset),
});

