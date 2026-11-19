ALTER TABLE "indicator_version" ADD COLUMN "demographics" text[];--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "genders" text[];--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "ethnic_groups" text[];--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_demographics_check" CHECK ("indicator_version"."demographics" <@ ARRAY['sex', 'gender', 'ethnicity']::text[] AND cardinality("indicator_version"."demographics") > 0);--> statement-breakpoint
-- A version that holds sexes collected sex, which the check below requires beside them, so it
-- is set to have collected sex. Other versions stay unanswered.
UPDATE "indicator_version" SET "demographics" = ARRAY['sex'] WHERE "sexes" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_sexes_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['sex']::text[]) IS TRUE) = ("indicator_version"."sexes" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_genders_check" CHECK ("indicator_version"."genders" <@ ARRAY['persons', 'women-and-girls', 'men-and-boys', 'non-binary', 'other', 'prefer-not-to-say']::text[] AND cardinality("indicator_version"."genders") > 0);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_genders_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['gender']::text[]) IS TRUE) = ("indicator_version"."genders" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ethnic_groups_check" CHECK ("indicator_version"."ethnic_groups" <@ ARRAY['asian', 'black', 'mixed', 'white', 'other']::text[] AND cardinality("indicator_version"."ethnic_groups") > 0);--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_ethnic_groups_demographic_check" CHECK ((("indicator_version"."demographics" @> ARRAY['ethnicity']::text[]) IS TRUE) = ("indicator_version"."ethnic_groups" IS NOT NULL));
