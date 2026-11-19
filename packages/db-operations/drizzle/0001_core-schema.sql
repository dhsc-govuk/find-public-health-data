CREATE TABLE "available_data" (
	"indicator_id" uuid NOT NULL,
	"area_type_id" uuid NOT NULL,
	"area_type_name" text NOT NULL,
	"area_count" integer NOT NULL,
	CONSTRAINT "available_data_indicator_id_area_type_id_pk" PRIMARY KEY("indicator_id","area_type_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_dimension_values" (
	"indicator_id" uuid NOT NULL,
	"dimension_type_id" uuid NOT NULL,
	"dimension_type_name" text NOT NULL,
	"dimension_value_id" uuid NOT NULL,
	"dimension_value_name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "indicator_dimension_values_indicator_id_dimension_value_id_pk" PRIMARY KEY("indicator_id","dimension_value_id")
);
--> statement-breakpoint
CREATE TABLE "latest_headline" (
	"indicator_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"value" double precision,
	"lower_ci_95" double precision,
	"upper_ci_95" double precision
);
--> statement-breakpoint
CREATE TABLE "dimension_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"dimension_class" text NOT NULL,
	"classification_scheme" text,
	"granularity" text,
	"scheme_version" text,
	"is_required" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dimension_type_name_unique" UNIQUE("name"),
	CONSTRAINT "dimension_type_dimension_class_check" CHECK ("dimension_type"."dimension_class" IN ('core', 'inequality', 'demographic', 'clinical'))
);
--> statement-breakpoint
CREATE TABLE "dimension_value" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"dimension_type_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"code" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_aggregate" boolean DEFAULT false NOT NULL,
	CONSTRAINT "dimension_value_dimensionTypeId_name_unique" UNIQUE("dimension_type_id","name"),
	CONSTRAINT "dimension_value_id_dimensionTypeId_unique" UNIQUE("id","dimension_type_id")
);
--> statement-breakpoint
CREATE TABLE "area" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"area_type_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "area_validity_order_check" CHECK ("area"."valid_to" IS NULL OR "area"."valid_from" <= "area"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "area_relationship" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"parent_area_id" uuid NOT NULL,
	"child_area_id" uuid NOT NULL,
	"valid_from" date NOT NULL,
	"valid_to" date,
	CONSTRAINT "area_relationship_validity_order_check" CHECK ("area_relationship"."valid_to" IS NULL OR "area_relationship"."valid_from" <= "area_relationship"."valid_to")
);
--> statement-breakpoint
CREATE TABLE "area_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"hierarchy_type" text NOT NULL,
	"level" integer NOT NULL,
	CONSTRAINT "area_type_name_unique" UNIQUE("name"),
	CONSTRAINT "area_type_hierarchy_type_check" CHECK ("area_type"."hierarchy_type" IN ('NHS', 'Administrative'))
);
--> statement-breakpoint
CREATE TABLE "indicator" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"fingertips_id" integer NOT NULL,
	"name" text NOT NULL,
	"value_type_id" uuid NOT NULL,
	"unit_id" uuid NOT NULL,
	"year_type_id" uuid NOT NULL,
	"ci_method_id" uuid,
	"polarity_id" uuid NOT NULL,
	"frequency_id" uuid NOT NULL,
	"comparator_method_id" uuid,
	"disclosure_threshold" smallint,
	"ci_confidence_level" text,
	"supersedes_id" uuid,
	"status" text DEFAULT 'approved' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"config" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "indicator_fingertipsId_unique" UNIQUE("fingertips_id"),
	CONSTRAINT "indicator_ci_confidence_level_check" CHECK ("indicator"."ci_confidence_level" IN ('95', '99.8', 'both')),
	CONSTRAINT "indicator_status_check" CHECK ("indicator"."status" IN ('draft', 'in_review', 'approved', 'archived'))
);
--> statement-breakpoint
CREATE TABLE "indicator_metadata" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"definition" text,
	"rationale" text,
	"methodology" text,
	"numerator_definition" text,
	"denominator_definition" text,
	"disclosure_control" text,
	"caveats" text,
	"notes" text,
	"data_source_id" uuid,
	"numerator_source_id" uuid,
	"denominator_source_id" uuid,
	CONSTRAINT "indicator_metadata_indicatorId_unique" UNIQUE("indicator_id")
);
--> statement-breakpoint
CREATE TABLE "ci_method" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	CONSTRAINT "ci_method_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "comparator_method" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "comparator_method_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "data_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "frequency" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "frequency_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "numerator_denominator_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"url" text
);
--> statement-breakpoint
CREATE TABLE "polarity" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "polarity_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "unit" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"label" text NOT NULL,
	"multiplier" double precision DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "value_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "value_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "year_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "year_type_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "note_type" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"text" text NOT NULL,
	"category" text NOT NULL,
	CONSTRAINT "note_type_category_check" CHECK ("note_type"."category" IN ('disclosure', 'quality', 'geographic', 'methodological', 'estimation', 'missing', 'contextual'))
);
--> statement-breakpoint
CREATE TABLE "observation" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"area_id" uuid NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"value" double precision,
	"count" double precision,
	"denominator" double precision,
	"denominator_2" double precision,
	"lower_ci_95" double precision,
	"upper_ci_95" double precision,
	"lower_ci_998" double precision,
	"upper_ci_998" double precision,
	"distribution_rank" smallint,
	"published_at" timestamp with time zone NOT NULL,
	"upload_batch_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "observation_date_order_check" CHECK ("observation"."from_date" <= "observation"."to_date")
);
--> statement-breakpoint
CREATE TABLE "observation_dimension" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"observation_id" uuid NOT NULL,
	"dimension_value_id" uuid NOT NULL,
	"dimension_type_id" uuid NOT NULL,
	CONSTRAINT "observation_dimension_observationId_dimensionTypeId_unique" UNIQUE("observation_id","dimension_type_id")
);
--> statement-breakpoint
CREATE TABLE "observation_note" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"observation_id" uuid NOT NULL,
	"note_type_id" uuid NOT NULL,
	CONSTRAINT "observation_note_observationId_noteTypeId_unique" UNIQUE("observation_id","note_type_id")
);
--> statement-breakpoint
CREATE TABLE "upload_batch" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"original_filename" text NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text DEFAULT 'received' NOT NULL,
	"validation_result" jsonb,
	"superseded_by_id" uuid,
	CONSTRAINT "upload_batch_id_indicatorId_unique" UNIQUE("id","indicator_id"),
	CONSTRAINT "upload_batch_status_check" CHECK ("upload_batch"."status" IN ('received', 'validated', 'processed', 'failed', 'superseded'))
);
--> statement-breakpoint
ALTER TABLE "dimension_value" ADD CONSTRAINT "dimension_value_dimension_type_id_dimension_type_id_fk" FOREIGN KEY ("dimension_type_id") REFERENCES "public"."dimension_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dimension_value" ADD CONSTRAINT "dimension_value_parent_id_dimension_value_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area" ADD CONSTRAINT "area_area_type_id_area_type_id_fk" FOREIGN KEY ("area_type_id") REFERENCES "public"."area_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_relationship" ADD CONSTRAINT "area_relationship_parent_area_id_area_id_fk" FOREIGN KEY ("parent_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_relationship" ADD CONSTRAINT "area_relationship_child_area_id_area_id_fk" FOREIGN KEY ("child_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_value_type_id_value_type_id_fk" FOREIGN KEY ("value_type_id") REFERENCES "public"."value_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_year_type_id_year_type_id_fk" FOREIGN KEY ("year_type_id") REFERENCES "public"."year_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_ci_method_id_ci_method_id_fk" FOREIGN KEY ("ci_method_id") REFERENCES "public"."ci_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_polarity_id_polarity_id_fk" FOREIGN KEY ("polarity_id") REFERENCES "public"."polarity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_frequency_id_frequency_id_fk" FOREIGN KEY ("frequency_id") REFERENCES "public"."frequency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_comparator_method_id_comparator_method_id_fk" FOREIGN KEY ("comparator_method_id") REFERENCES "public"."comparator_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_supersedes_id_indicator_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_metadata" ADD CONSTRAINT "indicator_metadata_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_metadata" ADD CONSTRAINT "indicator_metadata_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_metadata" ADD CONSTRAINT "indicator_metadata_numerator_source_id_numerator_denominator_source_id_fk" FOREIGN KEY ("numerator_source_id") REFERENCES "public"."numerator_denominator_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_metadata" ADD CONSTRAINT "indicator_metadata_denominator_source_id_numerator_denominator_source_id_fk" FOREIGN KEY ("denominator_source_id") REFERENCES "public"."numerator_denominator_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation" ADD CONSTRAINT "observation_upload_batch_indicator_fk" FOREIGN KEY ("upload_batch_id","indicator_id") REFERENCES "public"."upload_batch"("id","indicator_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_dimension" ADD CONSTRAINT "observation_dimension_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_dimension" ADD CONSTRAINT "observation_dimension_value_type_fk" FOREIGN KEY ("dimension_value_id","dimension_type_id") REFERENCES "public"."dimension_value"("id","dimension_type_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_note" ADD CONSTRAINT "observation_note_observation_id_observation_id_fk" FOREIGN KEY ("observation_id") REFERENCES "public"."observation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "observation_note" ADD CONSTRAINT "observation_note_note_type_id_note_type_id_fk" FOREIGN KEY ("note_type_id") REFERENCES "public"."note_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "upload_batch" ADD CONSTRAINT "upload_batch_superseded_by_id_upload_batch_id_fk" FOREIGN KEY ("superseded_by_id") REFERENCES "public"."upload_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_available_data_area_indicator" ON "available_data" USING btree ("area_type_id","indicator_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_dimension_values_type_indicator" ON "indicator_dimension_values" USING btree ("dimension_type_id","indicator_id");--> statement-breakpoint
CREATE INDEX "lh_area" ON "latest_headline" USING btree ("area_id");--> statement-breakpoint
CREATE INDEX "lh_indicator" ON "latest_headline" USING btree ("indicator_id");--> statement-breakpoint
CREATE UNIQUE INDEX "lh_unique" ON "latest_headline" USING btree ("indicator_id","area_id");--> statement-breakpoint
CREATE INDEX "idx_dim_val_type" ON "dimension_value" USING btree ("dimension_type_id");--> statement-breakpoint
CREATE INDEX "idx_dim_val_parent" ON "dimension_value" USING btree ("parent_id") WHERE "dimension_value"."parent_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_area_code" ON "area" USING btree ("code");--> statement-breakpoint
CREATE INDEX "idx_area_code_validity" ON "area" USING btree ("code","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "idx_area_type" ON "area" USING btree ("area_type_id");--> statement-breakpoint
CREATE INDEX "idx_area_validity" ON "area" USING btree ("area_type_id","valid_from","valid_to");--> statement-breakpoint
CREATE INDEX "idx_area_rel_parent" ON "area_relationship" USING btree ("parent_area_id");--> statement-breakpoint
CREATE INDEX "idx_area_rel_child" ON "area_relationship" USING btree ("child_area_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_name_trgm" ON "indicator" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_indmeta_definition_trgm" ON "indicator_metadata" USING gin ("definition" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_obs_upload_batch" ON "observation" USING btree ("upload_batch_id");--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_dates" ON "observation" USING btree ("indicator_id","from_date","to_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_area_indicator" ON "observation" USING btree ("area_id","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_indicator_area_from" ON "observation" USING btree ("indicator_id","area_id","from_date") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_observation_area_from_indicator" ON "observation" USING btree ("area_id","from_date","indicator_id") WHERE "observation"."deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "idx_obs_dim_val_obs" ON "observation_dimension" USING btree ("dimension_value_id","observation_id");