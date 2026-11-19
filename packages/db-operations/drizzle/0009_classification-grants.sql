-- Explicit per-table grants, matching 0003: a table added by a migration gets no
-- access until that migration grants it deliberately.
GRANT SELECT ON classification TO public_api;--> statement-breakpoint
GRANT SELECT ON classification TO internal_api;--> statement-breakpoint
GRANT SELECT ON indicator_classification TO public_api;--> statement-breakpoint
GRANT SELECT ON indicator_classification TO internal_api;
