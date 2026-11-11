import { productionEndpoint } from "../_shared/asaas-production/runtime.ts";
Deno.serve(productionEndpoint("worker"));
