import { NextResponse } from "next/server";
import { apiBoundary, readJsonBody } from "@/server/http";
import { checkRumRateLimit, recordRumMetric } from "@/server/monitoring/rum";
import { rumMetricInputSchema } from "@/shared/rum-contracts";
import { ApplicationError } from "@/server/application-error";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  return apiBoundary("rum.record", request, async () => {
    // 1. Límite de tasa por cliente e IP (60/minuto y 1000 global/minuto)
    checkRumRateLimit(request);

    // 2. Acotamiento estricto de cuerpo (máximo 2048 bytes)
    const rawBody = await readJsonBody(request, 2048);

    // 3. Validación de esquema cerrado (strictObject rechaza cualquier propiedad ajena)
    const parsed = rumMetricInputSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new ApplicationError("INVALID_INPUT");
    }

    // 4. Registro de muestra con minimización
    const result = recordRumMetric(parsed.data);

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    });
  });
}
