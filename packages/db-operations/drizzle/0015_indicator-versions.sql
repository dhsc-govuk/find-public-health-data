CREATE SCHEMA "published";
--> statement-breakpoint
CREATE TABLE "indicator_version" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"indicator_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"value_type_id" uuid,
	"unit_id" uuid,
	"year_type_id" uuid,
	"ci_method_id" uuid,
	"polarity_id" uuid,
	"frequency_id" uuid,
	"comparator_method_id" uuid,
	"disclosure_threshold" smallint,
	"ci_confidence_level" text,
	"config" jsonb,
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
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" text NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "indicator_version_ci_confidence_level_check" CHECK ("indicator_version"."ci_confidence_level" IN ('95', '99.8', 'both')),
	CONSTRAINT "indicator_version_status_check" CHECK ("indicator_version"."status" IN ('draft', 'published')),
	CONSTRAINT "indicator_version_published_at_check" CHECK (("indicator_version"."status" = 'published') = ("indicator_version"."published_at" IS NOT NULL)),
	CONSTRAINT "indicator_version_slug_check" CHECK ("indicator_version"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND "indicator_version"."slug" !~ '^[0-9]+$' AND length("indicator_version"."slug") <= 200)
);
--> statement-breakpoint
ALTER TABLE "indicator_metadata" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "indicator_metadata" CASCADE;--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_ci_confidence_level_check";--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_status_check";--> statement-breakpoint
ALTER TABLE "indicator_classification" DROP CONSTRAINT "indicator_classification_indicator_id_indicator_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_value_type_id_value_type_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_unit_id_unit_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_year_type_id_year_type_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_ci_method_id_ci_method_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_polarity_id_polarity_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_frequency_id_frequency_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_comparator_method_id_comparator_method_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator" DROP CONSTRAINT "indicator_supersedes_id_indicator_id_fk";
--> statement-breakpoint
ALTER TABLE "indicator_topic" DROP CONSTRAINT "indicator_topic_indicator_id_indicator_id_fk";
--> statement-breakpoint
DROP INDEX "idx_indicator_name_trgm";--> statement-breakpoint
DROP INDEX "idx_indicator_topic_indicator";--> statement-breakpoint
ALTER TABLE "indicator_classification" DROP CONSTRAINT "indicator_classification_indicator_id_classification_id_pk";--> statement-breakpoint
ALTER TABLE "indicator_topic" DROP CONSTRAINT "indicator_topic_topic_id_indicator_id_pk";--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD COLUMN "indicator_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_topic" ADD COLUMN "indicator_version_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD CONSTRAINT "indicator_classification_indicator_version_id_classification_id_pk" PRIMARY KEY("indicator_version_id","classification_id");--> statement-breakpoint
ALTER TABLE "indicator_topic" ADD CONSTRAINT "indicator_topic_topic_id_indicator_version_id_pk" PRIMARY KEY("topic_id","indicator_version_id");--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_indicator_id_indicator_id_fk" FOREIGN KEY ("indicator_id") REFERENCES "public"."indicator"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_value_type_id_value_type_id_fk" FOREIGN KEY ("value_type_id") REFERENCES "public"."value_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_unit_id_unit_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."unit"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_year_type_id_year_type_id_fk" FOREIGN KEY ("year_type_id") REFERENCES "public"."year_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ci_method_id_ci_method_id_fk" FOREIGN KEY ("ci_method_id") REFERENCES "public"."ci_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_polarity_id_polarity_id_fk" FOREIGN KEY ("polarity_id") REFERENCES "public"."polarity"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_frequency_id_frequency_id_fk" FOREIGN KEY ("frequency_id") REFERENCES "public"."frequency"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk" FOREIGN KEY ("comparator_method_id") REFERENCES "public"."comparator_method"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_data_source_id_data_source_id_fk" FOREIGN KEY ("data_source_id") REFERENCES "public"."data_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_numerator_source_id_numerator_denominator_source_id_fk" FOREIGN KEY ("numerator_source_id") REFERENCES "public"."numerator_denominator_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_denominator_source_id_numerator_denominator_source_id_fk" FOREIGN KEY ("denominator_source_id") REFERENCES "public"."numerator_denominator_source"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_indicator_version_one_draft" ON "indicator_version" USING btree ("indicator_id") WHERE "indicator_version"."status" = 'draft';--> statement-breakpoint
CREATE INDEX "idx_indicator_version_indicator" ON "indicator_version" USING btree ("indicator_id");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_slug" ON "indicator_version" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_indicator_version_name_trgm" ON "indicator_version" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_indicator_version_definition_trgm" ON "indicator_version" USING gin ("definition" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD CONSTRAINT "indicator_classification_indicator_version_id_indicator_version_id_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_topic" ADD CONSTRAINT "indicator_topic_indicator_version_id_indicator_version_id_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_indicator_topic_indicator_version" ON "indicator_topic" USING btree ("indicator_version_id");--> statement-breakpoint
ALTER TABLE "indicator_classification" DROP COLUMN "indicator_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "name";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "value_type_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "unit_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "year_type_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "ci_method_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "polarity_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "frequency_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "comparator_method_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "disclosure_threshold";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "ci_confidence_level";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "supersedes_id";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "reviewed_at";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "reviewed_by";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "config";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "updated_at";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "created_by";--> statement-breakpoint
ALTER TABLE "indicator" DROP COLUMN "updated_by";--> statement-breakpoint
ALTER TABLE "indicator_topic" DROP COLUMN "indicator_id";--> statement-breakpoint
CREATE VIEW "public"."current_published_version" AS (select distinct on ("indicator_version"."indicator_id") "id", "indicator_id", "status", "published_at", "name", "slug", "value_type_id", "unit_id", "year_type_id", "ci_method_id", "polarity_id", "frequency_id", "comparator_method_id", "disclosure_threshold", "ci_confidence_level", "config", "definition", "rationale", "methodology", "numerator_definition", "denominator_definition", "disclosure_control", "caveats", "notes", "data_source_id", "numerator_source_id", "denominator_source_id", "created_at", "updated_at", "created_by", "updated_by" from "indicator_version" where "indicator_version"."status" = 'published' order by "indicator_version"."indicator_id" asc, "indicator_version"."published_at" desc, "indicator_version"."id" desc);--> statement-breakpoint

-- A slug belongs to one indicator for ever: versions of one indicator share it, two
-- indicators never do. A draft therefore reserves its slug until it is deleted.
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_slug_indicator_excl" EXCLUDE USING gist (
  slug WITH =,
  indicator_id WITH <>
);--> statement-breakpoint

-- The internal reads join current_published_version; public_api reads the published views alone.
GRANT SELECT ON current_published_version TO internal_api;--> statement-breakpoint

-- The public read surface is the `published` schema. Every predicate that hides an
-- unpublished indicator lives in a view definition, so no query has to remember it.
-- Ordinary views, owned by the migration role: public_api reads through the owner's
-- privileges and holds none of its own on the tables underneath.
CREATE VIEW published.indicator AS
SELECT
  i.id,
  i.short_id,
  i.data_updated_at,
  i.created_at,
  v.name,
  v.slug,
  v.value_type_id,
  v.unit_id,
  v.year_type_id,
  v.ci_method_id,
  v.polarity_id,
  v.frequency_id,
  v.comparator_method_id,
  v.disclosure_threshold,
  v.ci_confidence_level,
  v.config,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.denominator_definition,
  v.disclosure_control,
  v.caveats,
  v.notes,
  v.data_source_id,
  v.numerator_source_id,
  v.denominator_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at
FROM indicator i
JOIN current_published_version v ON v.indicator_id = i.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p;--> statement-breakpoint

-- Memberships follow the same version published.indicator shows, so a superseded
-- version's topics never reach the public pages.
CREATE VIEW published.indicator_topic AS
SELECT v.indicator_id, it.topic_id
FROM current_published_version v
JOIN indicator_topic it ON it.indicator_version_id = v.id;--> statement-breakpoint

CREATE VIEW published.indicator_classification AS
SELECT v.indicator_id, ic.classification_id
FROM current_published_version v
JOIN indicator_classification ic ON ic.indicator_version_id = v.id;--> statement-breakpoint

-- Every slug a published version carries, so an indicator's earlier addresses still
-- resolve to it. The public role reads this rather than the version table.
CREATE VIEW published.indicator_slug AS
SELECT DISTINCT v.slug, v.indicator_id
FROM indicator_version v
WHERE v.status = 'published';--> statement-breakpoint

-- The indicator-level predicate holds whatever the data plan later does with row-level
-- publication state: an indicator with no published version exposes no observations.
CREATE VIEW published.observation AS
SELECT
  o.id,
  o.indicator_id,
  o.area_id,
  o.from_date,
  o.to_date,
  o.value,
  o.count,
  o.denominator,
  o.denominator_2,
  o.lower_ci_95,
  o.upper_ci_95,
  o.lower_ci_998,
  o.upper_ci_998,
  o.distribution_rank,
  o.published_at,
  o.upload_batch_id,
  o.created_at
FROM observation o
WHERE o.deleted_at IS NULL
  AND o.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

CREATE VIEW published.observation_dimension AS
SELECT od.id, od.observation_id, od.dimension_value_id, od.dimension_type_id
FROM observation_dimension od
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = od.observation_id);--> statement-breakpoint

CREATE VIEW published.observation_note AS
SELECT onote.id, onote.observation_id, onote.note_type_id
FROM observation_note onote
WHERE EXISTS (SELECT 1 FROM published.observation o WHERE o.id = onote.observation_id);--> statement-breakpoint

CREATE VIEW published.latest_headline AS
SELECT lh.*
FROM latest_headline lh
WHERE lh.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

CREATE VIEW published.available_data AS
SELECT ad.*
FROM available_data ad
WHERE ad.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

CREATE VIEW published.indicator_dimension_values AS
SELECT idv.*
FROM indicator_dimension_values idv
WHERE idv.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

CREATE VIEW published.observation_range AS
SELECT orng.*
FROM observation_range orng
WHERE orng.indicator_id IN (SELECT indicator_id FROM indicator_version WHERE status = 'published');--> statement-breakpoint

-- Reference data is not versioned by this plan, so these pass through. They exist so the
-- public role has one kind of object to read, and so registry versioning can later change
-- a definition without touching a grant.
CREATE VIEW published.value_type AS SELECT * FROM value_type;--> statement-breakpoint
CREATE VIEW published.unit AS SELECT * FROM unit;--> statement-breakpoint
CREATE VIEW published.year_type AS SELECT * FROM year_type;--> statement-breakpoint
CREATE VIEW published.ci_method AS SELECT * FROM ci_method;--> statement-breakpoint
CREATE VIEW published.polarity AS SELECT * FROM polarity;--> statement-breakpoint
CREATE VIEW published.frequency AS SELECT * FROM frequency;--> statement-breakpoint
CREATE VIEW published.comparator_method AS SELECT * FROM comparator_method;--> statement-breakpoint
CREATE VIEW published.data_source AS SELECT * FROM data_source;--> statement-breakpoint
CREATE VIEW published.numerator_denominator_source AS SELECT * FROM numerator_denominator_source;--> statement-breakpoint
CREATE VIEW published.dimension_type AS SELECT * FROM dimension_type;--> statement-breakpoint
CREATE VIEW published.dimension_value AS SELECT * FROM dimension_value;--> statement-breakpoint
CREATE VIEW published.area_type AS SELECT * FROM area_type;--> statement-breakpoint
CREATE VIEW published.area AS SELECT * FROM area;--> statement-breakpoint
CREATE VIEW published.area_relationship AS SELECT * FROM area_relationship;--> statement-breakpoint
CREATE VIEW published.note_type AS SELECT * FROM note_type;--> statement-breakpoint
CREATE VIEW published.topic AS SELECT * FROM topic;--> statement-breakpoint
CREATE VIEW published.classification AS SELECT * FROM classification;--> statement-breakpoint

-- public_api keeps no privilege of its own in `public`: a future table granted to it there
-- is a mistake, and the grants test fails on it.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM public_api;--> statement-breakpoint
GRANT USAGE ON SCHEMA published TO public_api;--> statement-breakpoint
GRANT USAGE ON SCHEMA published TO internal_api;--> statement-breakpoint
-- internal-api mounts the public routes, so it reads the same views.
GRANT SELECT ON ALL TABLES IN SCHEMA published TO public_api;--> statement-breakpoint
GRANT SELECT ON ALL TABLES IN SCHEMA published TO internal_api;--> statement-breakpoint
-- The publisher writes: whole tables, as the existing write grants are.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  indicator, indicator_version, indicator_topic, indicator_classification
TO internal_api;
