# FinanceControl Workers AI reader

The free-reader button uses this separate Worker and its `AI` binding with
`@cf/google/gemma-4-26b-a4b-it`. No Google API key or provider fallback is used.
GET `/` checks binding availability after Supabase authentication; POST `/`
returns the existing `ParsedReceipt` contract. CORS, image/body caps and the
per-user limit are reused from the shared handler. Other paths return 404.

The temporary test route and its configuration have been removed from the
deployment entry point. The recorded synthetic inference remains an artifact;
local tests are regressions, not additional real inference evidence.

Publication requires explicit approval: deploy this Worker's `wrangler.toml`
first, then publish the frontend. Confirm that the build environment does not
override `VITE_FREE_AI_WORKER_URL` with the old Gemini URL. The deployment entry
point excludes the temporary test route and all its test bindings. Publishing
this configuration removes that route from the deployed Worker.

Use the confirmed Workers Free account; never upgrade or enable paid fallback.
Workers AI's free daily allocation is shared across the account. GET availability
does not test model capacity or remaining quota; quota errors stop the request.
