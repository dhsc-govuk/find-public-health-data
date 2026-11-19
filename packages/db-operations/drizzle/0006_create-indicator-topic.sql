CREATE TABLE "indicator_topic" (
	"topic_id" uuid NOT NULL,
	"indicator_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_topic_topic_id_indicator_id_pk" PRIMARY KEY("topic_id","indicator_id")
);
--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "data_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "indicator_topic" ADD CONSTRAINT "indicator_topic_topic_id_topic_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topic"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_topic" ADD CONSTRAINT "indicator_topic_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_indicator_topic_indicator" ON "indicator_topic" USING btree ("indicator_id");