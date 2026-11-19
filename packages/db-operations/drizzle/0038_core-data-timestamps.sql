ALTER TABLE "ci_method" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "ci_method" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_provider" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_provider" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_provider_source" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "data_provider_source" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_classification" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "indicator_classification" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "indicator_topic" DROP COLUMN "created_at";--> statement-breakpoint
ALTER TABLE "indicator_topic" DROP COLUMN "updated_at";