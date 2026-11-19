-- Notes for reviewers: no grant. Only the operations job, as owner, reads and writes the
-- ledger; neither API has any reason to see which packages were applied.
CREATE TABLE "data_migration" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"package_sha256" text NOT NULL,
	"predecessor_id" text,
	"source_snapshot_at" timestamp with time zone NOT NULL,
	"source_cutoff_at" timestamp with time zone NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL,
	"table_changes" jsonb NOT NULL,
	CONSTRAINT "data_migration_kind_check" CHECK ("data_migration"."kind" IN ('baseline', 'incremental')),
	CONSTRAINT "data_migration_sha256_check" CHECK ("data_migration"."package_sha256" ~ '^[a-f0-9]{64}$')
);
