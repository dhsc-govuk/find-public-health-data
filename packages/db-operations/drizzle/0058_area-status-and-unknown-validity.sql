ALTER TABLE "area" ALTER COLUMN "valid_from" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "area_relationship" ALTER COLUMN "valid_from" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "area" ADD COLUMN "is_current" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "area" SET "is_current" = ("valid_to" IS NULL);--> statement-breakpoint
CREATE OR REPLACE VIEW published.area AS SELECT * FROM public.area;
