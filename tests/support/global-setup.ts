import type { TestProject } from "vitest/node";
import { provisionRuntime, type TestResources } from "./runtime-provision";
export type { TestResources } from "./runtime-provision";
declare module "vitest" { export interface ProvidedContext { resources: TestResources } }
export default async function setup(project: TestProject) {
  const runtime = await provisionRuntime();
  project.provide("resources", runtime.resources);
  return () => runtime.close();
}