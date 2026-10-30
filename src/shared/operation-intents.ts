import type { OperationAction } from "./operation-contracts";

type CapturedRequest = { readonly body: string };

/** El body capturado conserva la misma intención al reintentar; no reconstruyas su clave desde una respuesta incierta. */
export type OperationIntent =
  | (CapturedRequest & { readonly kind: "bootstrap"; readonly path: "/api/demo/session" })
  | (CapturedRequest & { readonly kind: "start"; readonly path: "/api/demo/runs" })
  | (CapturedRequest & { readonly kind: "reset"; readonly path: "/api/demo/runs/reset" })
  | (CapturedRequest & {
      readonly kind: "command";
      readonly path: string;
      readonly traceId: string;
      readonly action: OperationAction;
      readonly expectedVersion: number;
    })
  | (CapturedRequest & {
      readonly kind: "retry";
      readonly path: string;
      readonly traceId: string;
      readonly eventId: string;
    });
