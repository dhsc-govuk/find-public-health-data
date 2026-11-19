CREATE TABLE "classification" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dimension" text NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "classification_slug_unique" UNIQUE("slug"),
	CONSTRAINT "classification_dimension_check" CHECK ("classification"."dimension" IN ('indicator_type', 'population', 'risk_factor', 'inequality', 'framework'))
);
--> statement-breakpoint
CREATE TABLE "indicator_classification" (
	"indicator_id" uuid NOT NULL,
	"classification_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "indicator_classification_indicator_id_classification_id_pk" PRIMARY KEY("indicator_id","classification_id")
);
--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD CONSTRAINT "indicator_classification_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD CONSTRAINT "indicator_classification_classification_id_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."classification"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_classification_dimension" ON "classification" USING btree ("dimension");--> statement-breakpoint
CREATE INDEX "idx_indicator_classification_classification" ON "indicator_classification" USING btree ("classification_id");