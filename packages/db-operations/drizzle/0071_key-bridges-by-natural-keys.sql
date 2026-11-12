-- For the primary key builds below.
SET LOCAL maintenance_work_mem = '512MB';--> statement-breakpoint

-- Dropping each id drops its primary key, so the natural key, until now a unique constraint, can
-- take its place.
ALTER TABLE "observation_dimension" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "observation_note" DROP COLUMN "id";--> statement-breakpoint
ALTER TABLE "observation_dimension" DROP CONSTRAINT "observation_dimension_observation_id_dimension_type_id_unique";--> statement-breakpoint
ALTER TABLE "observation_note" DROP CONSTRAINT "observation_note_observation_id_note_type_id_unique";--> statement-breakpoint
ALTER TABLE "observation_dimension" ADD CONSTRAINT "observation_dimension_pk" PRIMARY KEY("observation_id","dimension_type_id");--> statement-breakpoint
ALTER TABLE "observation_note" ADD CONSTRAINT "observation_note_pk" PRIMARY KEY("observation_id","note_type_id");
