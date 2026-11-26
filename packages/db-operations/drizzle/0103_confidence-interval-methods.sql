-- The published method view selects the description column, so it goes first and is recreated
-- without it. The method descriptions now come from @fphd/utils/standard-methods.
DROP VIEW published.ci_method;--> statement-breakpoint
ALTER TABLE "ci_method" DROP COLUMN "description";--> statement-breakpoint
CREATE VIEW published.ci_method AS SELECT id, name FROM ci_method;--> statement-breakpoint
GRANT SELECT ON published.ci_method TO public_api, internal_api;--> statement-breakpoint
-- The service has no Unknown or Byar's method (no small number correction). Every environment is
-- wiped in this release before it is reimported, so no version names either.
DELETE FROM "ci_method"
WHERE "id" IN ('019fa38f-0747-73bb-b8a4-bb6e8f3c244e', '019fa38f-0745-712e-aca8-62b7d9bee8ec');
