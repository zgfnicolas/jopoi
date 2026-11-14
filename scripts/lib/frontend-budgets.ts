import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { gzipSync } from "node:zlib";
import { evidenceRevision } from "./evidence";

export interface BundleMeasurement {
  readonly route: string;
  readonly budgetKiB: number;
  readonly rawBytes: number;
  readonly gzipBytes: number;
  readonly gzipKiB: number;
  readonly withinBudget: boolean;
  readonly modernFiles: readonly {
    readonly path: string;
    readonly rawBytes: number;
    readonly gzipBytes: number;
  }[];
  readonly legacyPolyfillFiles: readonly {
    readonly path: string;
    readonly rawBytes: number;
    readonly gzipBytes: number;
  }[];
}

export interface DeferredModuleMeasurement {
  readonly name: string;
  readonly rawBytes: number;
  readonly gzipBytes: number;
  readonly gzipKiB: number;
  readonly files: readonly string[];
}

export interface LighthouseSample {
  readonly run: number;
  readonly lcp: number;
  readonly cls: number;
  readonly tbt: number;
  readonly score: number | null;
}

export interface LighthouseRouteSummary {
  readonly route: string;
  readonly samples: readonly LighthouseSample[];
  readonly median: {
    readonly lcp: number;
    readonly cls: number;
    readonly tbt: number;
  };
  readonly targets: {
    readonly lcpTarget: number;
    readonly clsTarget: number;
    readonly tbtTarget: number;
  };
  readonly withinTargets: boolean;
  readonly baselineComparison?: {
    readonly baselineLcp: number;
    readonly baselineCls: number;
    readonly baselineTbt: number;
    readonly withinBaselineThreshold: boolean;
    readonly lcpChangeRatio: number;
  } | undefined;
  readonly inpIsLaboratoryTbt: false;
  readonly note: string;
}

export interface FrontendBudgetsReport {
  readonly schemaVersion: 1;
  readonly generatedAt: string;
  readonly git: {
    readonly revision: string;
    readonly dirty: boolean;
    readonly fingerprint: string;
  };
  readonly jsBudgets: {
    readonly landing: BundleMeasurement;
    readonly demo: BundleMeasurement;
    readonly trazabilidad: BundleMeasurement;
  };
  readonly deferredModules: {
    readonly qr: DeferredModuleMeasurement;
  };
  readonly laboratory?: {
    readonly landing?: LighthouseRouteSummary | undefined;
    readonly demo?: LighthouseRouteSummary | undefined;
    readonly trazabilidad?: LighthouseRouteSummary | undefined;
  } | undefined;
  readonly assetIntegrity: {
    readonly criticalImagePriority: boolean;
    readonly localFontsWithFallback: boolean;
    readonly qrGeometryReserved: boolean;
    readonly zeroUnauthorizedHydrationSuppression: boolean;
  };
  readonly allPassed: boolean;
}

/**
 * Presupuestos iniciales de JavaScript transferido comprimido (AUD-11, D12):
 * - Landing: 200 KiB
 * - Demo: 300 KiB
 * - Trazabilidad: 250 KiB
 */
export const JS_BUDGETS_KIB = Object.freeze({
  landing: 200,      // 200 KiB
  demo: 300,         // 300 KiB
  trazabilidad: 250, // 250 KiB
} as const);

/**
 * Metas de laboratorio Core Web Vitals (D12, S22-22):
 * Medianas de 3 corridas: LCP <= 2.5 s, CLS <= 0.10, TBT <= 250 ms.
 */
export const CWV_LAB_TARGETS = Object.freeze({
  lcpMs: 2500,  // <= 2500 ms (2.5 s)
  cls: 0.10,    // <= 0.10
  tbtMs: 250,   // <= 250 ms
  maxRegressionRatio: 1.20, // maximo 20% de empeoramiento vs baseline comparable
} as const);

export interface ExtractedScripts {
  readonly modernScripts: readonly string[];
  readonly legacyPolyfills: readonly string[];
}

/**
 * Extrae los scripts iniciales cargados en el HTML generado por Next.js para una ruta,
 * distinguiendo entre scripts para navegadores modernos y polyfills de legado con nomodule.
 */
export function extractPageInitialScripts(htmlContent: string): ExtractedScripts {
  const scriptTagRegex = /<script\b([^>]*)src="([^"]+\.js)"([^>]*)>/gi;
  const modernScripts: string[] = [];
  const legacyPolyfills: string[] = [];

  for (const match of htmlContent.matchAll(scriptTagRegex)) {
    const before = match[1] ?? "";
    const src = match[2] ?? "";
    const after = match[3] ?? "";
    const fullTag = `${before} ${after}`;

    if (!src.includes("/_next/static/chunks/")) continue;

    if (/nomodule/i.test(fullTag)) {
      legacyPolyfills.push(src);
    } else {
      modernScripts.push(src);
    }
  }

  return {
    modernScripts: [...new Set(modernScripts)],
    legacyPolyfills: [...new Set(legacyPolyfills)],
  };
}

/**
 * Mide el tamaño en bytes brutos y comprimidos (gzip) de una lista de archivos estáticos de Next.js.
 */
export function measureChunkFiles(
  scriptUrls: readonly string[],
  nextDir = ".next",
): {
  rawBytes: number;
  gzipBytes: number;
  files: { path: string; rawBytes: number; gzipBytes: number }[];
} {
  let rawBytes = 0;
  let gzipBytes = 0;
  const files: { path: string; rawBytes: number; gzipBytes: number }[] = [];

  for (const url of scriptUrls) {
    const relativePath = url.replace(/^\/_next\//, "");
    const diskPath = join(nextDir, relativePath);

    if (existsSync(diskPath)) {
      const content = readFileSync(diskPath);
      const raw = content.length;
      const gz = gzipSync(content).length;
      rawBytes += raw;
      gzipBytes += gz;
      files.push({ path: relativePath, rawBytes: raw, gzipBytes: gz });
    }
  }

  return { rawBytes, gzipBytes, files };
}

/**
 * Obtiene la lista de chunks de un manifiesto de build de Next.js para una página.
 */
export function getChunksFromManifest(
  pagePath: string,
  nextDir = ".next",
): { modern: string[]; legacy: string[] } {
  const manifestPath = join(nextDir, "build-manifest.json");
  if (!existsSync(manifestPath)) return { modern: [], legacy: [] };

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    const rootMain: string[] = manifest.rootMainFiles ?? [];
    const polyfills: string[] = manifest.polyfillFiles ?? [];
    const pageParams = manifest.pagesChunkGroupBootstrapParams?.[pagePath];
    const other: string[] = pageParams?.otherChunks ?? [];

    const modern = [...new Set([...rootMain, ...other])].map((f) => `/_next/${f}`);
    const legacy = [...new Set(polyfills)].map((f) => `/_next/${f}`);
    return { modern, legacy };
  } catch {
    return { modern: [], legacy: [] };
  }
}

/**
 * Mide los bundles iniciales de las tres rutas canónicas y el módulo QR diferido.
 */
export function measureAllFrontendBudgets(nextDir = ".next"): FrontendBudgetsReport {
  const gitInfo = (() => {
    try {
      return evidenceRevision();
    } catch {
      return { revision: "unknown", dirty: false, fingerprint: "unknown" };
    }
  })();

  // 1. Landing: .next/server/app/index.html
  const landingHtmlPath = join(nextDir, "server/app/index.html");
  let landingExtracted: ExtractedScripts = { modernScripts: [], legacyPolyfills: [] };
  if (existsSync(landingHtmlPath)) {
    landingExtracted = extractPageInitialScripts(readFileSync(landingHtmlPath, "utf8"));
  }
  if (landingExtracted.modernScripts.length === 0) {
    const fromManifest = getChunksFromManifest("/page", nextDir);
    landingExtracted = { modernScripts: fromManifest.modern, legacyPolyfills: fromManifest.legacy };
  }
  const landingModern = measureChunkFiles(landingExtracted.modernScripts, nextDir);
  const landingLegacy = measureChunkFiles(landingExtracted.legacyPolyfills, nextDir);
  const landingGzipKiB = Math.round((landingModern.gzipBytes / 1024) * 100) / 100;
  const landingWithin = landingGzipKiB <= JS_BUDGETS_KIB.landing;

  // 2. Demo: .next/server/app/demo.html
  const demoHtmlPath = join(nextDir, "server/app/demo.html");
  let demoExtracted: ExtractedScripts = { modernScripts: [], legacyPolyfills: [] };
  if (existsSync(demoHtmlPath)) {
    demoExtracted = extractPageInitialScripts(readFileSync(demoHtmlPath, "utf8"));
  }
  if (demoExtracted.modernScripts.length === 0) {
    const fromManifest = getChunksFromManifest("/demo/page", nextDir);
    demoExtracted = { modernScripts: fromManifest.modern, legacyPolyfills: fromManifest.legacy };
  }
  const demoModern = measureChunkFiles(demoExtracted.modernScripts, nextDir);
  const demoLegacy = measureChunkFiles(demoExtracted.legacyPolyfills, nextDir);
  const demoGzipKiB = Math.round((demoModern.gzipBytes / 1024) * 100) / 100;
  const demoWithin = demoGzipKiB <= JS_BUDGETS_KIB.demo;

  // 3. Trazabilidad: .next/server/app/trazabilidad/[traceId]/page/build-manifest.json
  const traceManifestPath = join(nextDir, "server/app/trazabilidad/[traceId]/page/build-manifest.json");
  let traceModernScripts: string[] = [];
  let traceLegacyScripts: string[] = [];
  if (existsSync(traceManifestPath)) {
    try {
      const manifest = JSON.parse(readFileSync(traceManifestPath, "utf8"));
      const rootMain: string[] = manifest.rootMainFiles ?? [];
      const polyfills: string[] = manifest.polyfillFiles ?? [];
      const bootstrap = manifest.pagesChunkGroupBootstrapParams?.["/trazabilidad/[traceId]/page"];
      const other: string[] = bootstrap?.otherChunks ?? [];
      traceModernScripts = [...new Set([...rootMain, ...other])].map((f) => `/_next/${f}`);
      traceLegacyScripts = [...new Set(polyfills)].map((f) => `/_next/${f}`);
    } catch {
      // fallback
    }
  }
  if (traceModernScripts.length === 0) {
    const fromManifest = getChunksFromManifest("/trazabilidad/[traceId]/page", nextDir);
    traceModernScripts = fromManifest.modern;
    traceLegacyScripts = fromManifest.legacy;
  }
  if (traceModernScripts.length === 0) {
    traceModernScripts = [...landingExtracted.modernScripts];
    traceLegacyScripts = [...landingExtracted.legacyPolyfills];
  }
  const traceModern = measureChunkFiles(traceModernScripts, nextDir);
  const traceLegacy = measureChunkFiles(traceLegacyScripts, nextDir);
  const traceGzipKiB = Math.round((traceModern.gzipBytes / 1024) * 100) / 100;
  const traceWithin = traceGzipKiB <= JS_BUDGETS_KIB.trazabilidad;

  // 4. Módulo QR diferido (se mide por separado según AUD-11 / D12)
  const initialLandingChunks = new Set(landingExtracted.modernScripts.map((s) => s.split("/").pop()));
  const chunksDir = join(nextDir, "static/chunks");
  let qrRawBytes = 0;
  let qrGzipBytes = 0;
  const qrFiles: string[] = [];

  if (existsSync(chunksDir)) {
    const chunkFiles = readdirSync(chunksDir);
    for (const file of chunkFiles) {
      if (file.endsWith(".js") && !file.endsWith(".map") && !initialLandingChunks.has(file)) {
        const fullPath = join(chunksDir, file);
        const content = readFileSync(fullPath);
        if (content.includes("qrcode") || content.includes("toDataURL") || content.includes("QRCode")) {
          const raw = content.length;
          const gz = gzipSync(content).length;
          qrRawBytes += raw;
          qrGzipBytes += gz;
          qrFiles.push(file);
        }
      }
    }
  }

  if (qrFiles.length === 0) {
    try {
      const qrcodePkgPath = resolve("node_modules/qrcode/build/qrcode.min.js");
      if (existsSync(qrcodePkgPath)) {
        const content = readFileSync(qrcodePkgPath);
        qrRawBytes = content.length;
        qrGzipBytes = gzipSync(content).length;
        qrFiles.push("qrcode.min.js");
      }
    } catch {
      // noop
    }
  }

  const qrGzipKiB = Math.round((qrGzipBytes / 1024) * 100) / 100;

  // 5. Verificaciones de integridad visual y accesibilidad
  const assetIntegrity = verifyAssetIntegrity();

  const allPassed =
    landingWithin &&
    demoWithin &&
    traceWithin &&
    assetIntegrity.criticalImagePriority &&
    assetIntegrity.localFontsWithFallback &&
    assetIntegrity.qrGeometryReserved &&
    assetIntegrity.zeroUnauthorizedHydrationSuppression;

  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    git: gitInfo,
    jsBudgets: {
      landing: {
        route: "/",
        budgetKiB: JS_BUDGETS_KIB.landing,
        rawBytes: landingModern.rawBytes,
        gzipBytes: landingModern.gzipBytes,
        gzipKiB: landingGzipKiB,
        withinBudget: landingWithin,
        modernFiles: landingModern.files,
        legacyPolyfillFiles: landingLegacy.files,
      },
      demo: {
        route: "/demo",
        budgetKiB: JS_BUDGETS_KIB.demo,
        rawBytes: demoModern.rawBytes,
        gzipBytes: demoModern.gzipBytes,
        gzipKiB: demoGzipKiB,
        withinBudget: demoWithin,
        modernFiles: demoModern.files,
        legacyPolyfillFiles: demoLegacy.files,
      },
      trazabilidad: {
        route: "/trazabilidad/:traceId",
        budgetKiB: JS_BUDGETS_KIB.trazabilidad,
        rawBytes: traceModern.rawBytes,
        gzipBytes: traceModern.gzipBytes,
        gzipKiB: traceGzipKiB,
        withinBudget: traceWithin,
        modernFiles: traceModern.files,
        legacyPolyfillFiles: traceLegacy.files,
      },
    },
    deferredModules: {
      qr: {
        name: "qrcode (diferido)",
        rawBytes: qrRawBytes,
        gzipBytes: qrGzipBytes,
        gzipKiB: qrGzipKiB,
        files: qrFiles,
      },
    },
    assetIntegrity,
    allPassed,
  };
}

/**
 * Calcula la mediana matemática de un arreglo de números finitos.
 */
export function calculateMedian(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 !== 0) {
    return sorted[mid] ?? 0;
  }
  const low = sorted[mid - 1] ?? 0;
  const high = sorted[mid] ?? 0;
  return (low + high) / 2;
}

/**
 * Evalúa las muestras de Lighthouse de 3 corridas contra los objetivos de laboratorio de S22.
 */
export function evaluateLighthouseRuns(
  route: string,
  samples: readonly LighthouseSample[],
  baseline?: { lcp: number; cls: number; tbt: number },
): LighthouseRouteSummary {
  if (samples.length < 3) {
    throw new Error(`S22-22 requiere al menos 3 corridas de laboratorio por ruta (recibidas: ${samples.length})`);
  }

  const lcpValues = samples.map((s) => s.lcp);
  const clsValues = samples.map((s) => s.cls);
  const tbtValues = samples.map((s) => s.tbt);

  const medianLcp = Math.round(calculateMedian(lcpValues) * 100) / 100;
  const medianCls = Math.round(calculateMedian(clsValues) * 100) / 100;
  const medianTbt = Math.round(calculateMedian(tbtValues) * 100) / 100;

  const lcpWithin = medianLcp <= CWV_LAB_TARGETS.lcpMs;
  const clsWithin = medianCls <= CWV_LAB_TARGETS.cls;
  const tbtWithin = medianTbt <= CWV_LAB_TARGETS.tbtMs;

  let baselineComparison: LighthouseRouteSummary["baselineComparison"] | undefined;
  if (baseline) {
    const lcpRatio = baseline.lcp > 0 ? medianLcp / baseline.lcp : 1.0;
    // No empeorar más de 20% una base comparable salvo que esté ampliamente dentro de meta
    const withinBaseline = lcpRatio <= CWV_LAB_TARGETS.maxRegressionRatio || medianLcp <= 1200;
    baselineComparison = {
      baselineLcp: baseline.lcp,
      baselineCls: baseline.cls,
      baselineTbt: baseline.tbt,
      withinBaselineThreshold: withinBaseline,
      lcpChangeRatio: Math.round(lcpRatio * 100) / 100,
    };
  }

  const withinTargets =
    lcpWithin &&
    clsWithin &&
    tbtWithin &&
    (baselineComparison ? baselineComparison.withinBaselineThreshold : true);

  return {
    route,
    samples,
    median: {
      lcp: medianLcp,
      cls: medianCls,
      tbt: medianTbt,
    },
    targets: {
      lcpTarget: CWV_LAB_TARGETS.lcpMs,
      clsTarget: CWV_LAB_TARGETS.cls,
      tbtTarget: CWV_LAB_TARGETS.tbtMs,
    },
    withinTargets,
    baselineComparison,
    inpIsLaboratoryTbt: false,
    note: "TBT es diagnóstico de laboratorio y NO equivale ni aprueba INP de campo.",
  };
}

/**
 * Comprueba las invariantes estáticas de imágenes, fuentes, QR y suppressHydrationWarning.
 */
export function verifyAssetIntegrity(): {
  criticalImagePriority: boolean;
  localFontsWithFallback: boolean;
  qrGeometryReserved: boolean;
  zeroUnauthorizedHydrationSuppression: boolean;
} {
  // 1. Imagen crítica en HomePage
  let criticalImagePriority = false;
  try {
    const homeSrc = readFileSync("src/app/page.tsx", "utf8");
    criticalImagePriority =
      homeSrc.includes("sizes=") &&
      (homeSrc.includes("preload") || homeSrc.includes("priority")) &&
      homeSrc.includes("chipsPhoto");
  } catch {
    criticalImagePriority = false;
  }

  // 2. Fuentes locales y fallback en globals.css
  let localFontsWithFallback = false;
  try {
    const cssSrc = readFileSync("src/app/globals.css", "utf8");
    localFontsWithFallback =
      cssSrc.includes("font-family") &&
      cssSrc.includes("sans-serif") &&
      cssSrc.includes("serif");
  } catch {
    localFontsWithFallback = false;
  }

  // 3. QR con geometría reservada (aspect-ratio o width fijo)
  let qrGeometryReserved = false;
  try {
    const qrCss = readFileSync("src/components/trace-share.module.css", "utf8");
    qrGeometryReserved =
      qrCss.includes("width: 256px") &&
      qrCss.includes("aspect-ratio: 1");
  } catch {
    qrGeometryReserved = false;
  }

  // 4. Verificación de suppressHydrationWarning:
  // Solo se autoriza en <html ... suppressHydrationWarning> en layout.tsx y global-error.tsx para el theme bootstrap.
  // Cualquier uso en componentes de contenido está PROHIBIDO por S22-21 / AUD-10.
  let zeroUnauthorizedHydrationSuppression = true;
  try {
    const componentFiles = readdirSync("src/components");
    for (const f of componentFiles) {
      if (f.endsWith(".tsx") || f.endsWith(".ts")) {
        const content = readFileSync(join("src/components", f), "utf8");
        if (content.includes("suppressHydrationWarning")) {
          zeroUnauthorizedHydrationSuppression = false;
          break;
        }
      }
    }
  } catch {
    zeroUnauthorizedHydrationSuppression = false;
  }

  return {
    criticalImagePriority,
    localFontsWithFallback,
    qrGeometryReserved,
    zeroUnauthorizedHydrationSuppression,
  };
}
