-- The indicator's public number becomes short_id, minted here rather than carried in from
-- Fingertips. The sequence starts above every number the seed carries over.
CREATE SEQUENCE "public"."indicator_short_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 100000 CACHE 1;--> statement-breakpoint
ALTER TABLE "indicator" RENAME COLUMN "fingertips_id" TO "short_id";--> statement-breakpoint
ALTER TABLE "indicator" RENAME CONSTRAINT "indicator_fingertipsId_unique" TO "indicator_shortId_unique";--> statement-breakpoint
ALTER SEQUENCE "public"."indicator_short_id_seq" OWNED BY "indicator"."short_id";--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "short_id" SET DEFAULT nextval('indicator_short_id_seq');--> statement-breakpoint
GRANT USAGE ON SEQUENCE "indicator_short_id_seq" TO internal_api;--> statement-breakpoint
-- A stub indicator is created from a name alone, as a draft, and fills the rest in later.
ALTER TABLE "indicator" ALTER COLUMN "value_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "unit_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "year_type_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "polarity_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "frequency_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "created_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "updated_by" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator" ALTER COLUMN "status" SET DEFAULT 'draft';
