-- Publisher topic admin (internal only). DELETE on indicator_topic lets a topic go together
-- with the links that reference it; the id and timestamps stay the database's to set.
GRANT INSERT, UPDATE, DELETE ON topic TO internal_api;--> statement-breakpoint
GRANT DELETE ON indicator_topic TO internal_api;
