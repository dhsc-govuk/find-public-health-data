-- No published view reads them yet, and internal_api writes them under its table-level grant
-- on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "copyright_non_default" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "copyright_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "data_reuse_non_default" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "data_reuse_detail" text;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_copyright_detail_check" CHECK ("indicator_version"."copyright_non_default" IS TRUE OR "indicator_version"."copyright_detail" IS NULL);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_data_reuse_detail_check" CHECK ("indicator_version"."data_reuse_non_default" IS TRUE OR "indicator_version"."data_reuse_detail" IS NULL);