import { sandboxEndpoint } from "../_shared/asaas-sandbox/runtime.ts";
Deno.serve(sandboxEndpoint("worker"));
