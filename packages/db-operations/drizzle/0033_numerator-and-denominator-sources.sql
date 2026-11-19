-- A numerator and a denominator each name any number of providers, with a source of each or
-- none in particular, from the core data list. Fingertips' single flat source per part is
-- dropped with its table: the list only arrives with the core data import, after this runs,
-- so a database holding versions gets their sources back by seeding or importing again,
-- which map the Fingertips names onto the list.
-- published.indicator names the two columns, so it is dropped here and rebuilt below.
DROP VIEW published.indicator;--> statement-breakpoint
DROP VIEW published.numerator_denominator_source;--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_numerator_source_id_numerator_denominator_source_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_denominator_source_id_numerator_denominator_source_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "numerator_source_id";--> statement-breakpoint
ALTER TABLE "indicator_version" DROP COLUMN "denominator_source_id";--> statement-breakpoint
DROP TABLE "numerator_denominator_source";--> statement-breakpoint
CREATE TABLE "data_provider" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "data_provider_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "data_provider_source" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"provider_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "data_provider_source_provider_id_name_unique" UNIQUE("provider_id","name"),
	CONSTRAINT "data_provider_source_id_provider_id_unique" UNIQUE("id","provider_id")
);
--> statement-breakpoint
CREATE TABLE "indicator_version_source" (
	"indicator_version_id" uuid NOT NULL,
	"part" text NOT NULL,
	"position" smallint NOT NULL,
	"provider_id" uuid NOT NULL,
	"source_id" uuid,
	CONSTRAINT "indicator_version_source_indicator_version_id_part_position_pk" PRIMARY KEY("indicator_version_id","part","position"),
	CONSTRAINT "indicator_version_source_pair_unique" UNIQUE NULLS NOT DISTINCT("indicator_version_id","part","provider_id","source_id"),
	CONSTRAINT "indicator_version_source_part_check" CHECK ("indicator_version_source"."part" IN ('numerator', 'denominator')),
	CONSTRAINT "indicator_version_source_position_check" CHECK ("indicator_version_source"."position" >= 0)
);
--> statement-breakpoint
ALTER TABLE "data_provider_source" ADD CONSTRAINT "data_provider_source_provider_id_data_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_indicator_version_id_indicator_version_id_fk" FOREIGN KEY ("indicator_version_id") REFERENCES "public"."indicator_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_provider_id_data_provider_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."data_provider"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "indicator_version_source" ADD CONSTRAINT "indicator_version_source_source_fk" FOREIGN KEY ("source_id","provider_id") REFERENCES "public"."data_provider_source"("id","provider_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

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
  v.polarity,
  v.update_frequency,
  v.comparator_method_id,
  v.disclosure_threshold,
  v.ci_confidence_level,
  v.config,
  v.definition,
  v.rationale,
  v.methodology,
  v.numerator_definition,
  v.denominator_definition,
  v.disclosure_control_detail,
  v.caveats_detail,
  v.other_notes_detail,
  v.data_source_id,
  v.updated_at,
  p.first_published_at,
  p.last_published_at
FROM indicator i
JOIN current_published_version cpv ON cpv.indicator_id = i.id
JOIN indicator_version v ON v.id = cpv.id
CROSS JOIN LATERAL (
  SELECT min(pv.published_at) AS first_published_at, max(pv.published_at) AS last_published_at
  FROM indicator_version pv
  WHERE pv.indicator_id = i.id
) p;--> statement-breakpoint

-- Follows the version published.indicator shows, as the topic memberships do.
CREATE VIEW published.indicator_source AS
SELECT cpv.indicator_id, s.part, s.position, s.provider_id, s.source_id
FROM current_published_version cpv
JOIN indicator_version_source s ON s.indicator_version_id = cpv.id;--> statement-breakpoint

CREATE VIEW published.data_provider AS SELECT * FROM data_provider;--> statement-breakpoint
CREATE VIEW published.data_provider_source AS SELECT * FROM data_provider_source;--> statement-breakpoint

GRANT SELECT ON published.indicator, published.indicator_source, published.data_provider,
  published.data_provider_source
TO public_api, internal_api;--> statement-breakpoint
-- The list is core data, written by the import; the publisher writes only the choices.
GRANT SELECT ON data_provider, data_provider_source TO internal_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON indicator_version_source TO internal_api;
