-- The preview schema shows one indicator's draft as if it were published, to the internal apps
-- only. Its views are not created here: `db migrate` drops them before it migrates and recreates
-- them afterwards from the published views, along with internal_api's SELECT on each. public_api
-- has no grant on the schema, so it can never read a draft through it.
CREATE SCHEMA preview;--> statement-breakpoint
GRANT USAGE ON SCHEMA preview TO internal_api;
