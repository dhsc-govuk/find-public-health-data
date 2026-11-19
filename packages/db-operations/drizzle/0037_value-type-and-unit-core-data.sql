ALTER TABLE "comparator_method" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "comparator_method" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Every row takes the first position until import-core-data gives each its own.
ALTER TABLE "unit" ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "unit" ALTER COLUMN "position" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "unit" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "unit" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "value_type" ADD COLUMN "position" smallint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "value_type" ALTER COLUMN "position" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "value_type" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "value_type" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- A snapshot import's comparator methods carry ids of their own: each takes the id
-- data/comparator-methods.json gives its name, and the versions naming it follow.
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk" FOREIGN KEY ("comparator_method_id") REFERENCES "public"."comparator_method"("id") ON DELETE no action ON UPDATE cascade;--> statement-breakpoint
UPDATE "comparator_method" c
SET "id" = m.id
FROM (VALUES
  ('019fa38f-0756-71f5-a109-4f1f61b49a25'::uuid, 'Confidence intervals overlapping reference value (95.0 & 99.8)'),
  ('019fa38f-0751-7a9d-9344-d24639ec4c1b', 'Confidence intervals overlapping reference value (95.0)'),
  ('019fa38f-0757-7741-85a3-84bb9805ba5b', 'Confidence intervals overlapping reference value (99.8)'),
  ('019fa38f-0753-7f30-a0cf-61037e844ba7', 'Is a suicide prevention plan defined?'),
  ('019fa38f-0758-7d48-9991-8c1852e1829b', 'Legacy comparator method 12'),
  ('019fa38f-0759-7cc2-b03b-894932ed9e8c', 'Legacy comparator method 15'),
  ('019fa38f-075a-730b-8eb0-517bbe3595b9', 'Legacy comparator method 17'),
  ('019fa38f-075b-721d-82d8-ffbcc8a9caa2', 'Legacy comparator method 18'),
  ('019fa38f-0750-73a5-a5aa-998e2d8982c2', 'No comparison'),
  ('019fa38f-0752-7559-a682-6cd10ebd0b9a', 'Overlapping confidence intervals (95.0)'),
  ('019fa38f-0755-7319-8a9c-23e8e9f97264', 'Quartiles (Longer Lives only)'),
  ('019fa38f-0754-71bd-ac34-5687fe18d4b4', 'Quintiles')
) AS m(id, name)
WHERE c.name = m.name AND c.id <> m.id;--> statement-breakpoint
-- Stops rather than drop an answer the core data does not hold.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "indicator_version"
    WHERE "comparator_method_id" NOT IN (
      '019fa38f-0756-71f5-a109-4f1f61b49a25', '019fa38f-0751-7a9d-9344-d24639ec4c1b',
      '019fa38f-0757-7741-85a3-84bb9805ba5b', '019fa38f-0753-7f30-a0cf-61037e844ba7',
      '019fa38f-0758-7d48-9991-8c1852e1829b', '019fa38f-0759-7cc2-b03b-894932ed9e8c',
      '019fa38f-075a-730b-8eb0-517bbe3595b9', '019fa38f-075b-721d-82d8-ffbcc8a9caa2',
      '019fa38f-0750-73a5-a5aa-998e2d8982c2', '019fa38f-0752-7559-a682-6cd10ebd0b9a',
      '019fa38f-0755-7319-8a9c-23e8e9f97264', '019fa38f-0754-71bd-ac34-5687fe18d4b4'
    )
  ) THEN
    RAISE EXCEPTION 'indicator_version references a comparator method data/comparator-methods.json does not name';
  END IF;
END
$$;--> statement-breakpoint
DELETE FROM "comparator_method" WHERE "id" NOT IN (
  '019fa38f-0756-71f5-a109-4f1f61b49a25', '019fa38f-0751-7a9d-9344-d24639ec4c1b',
  '019fa38f-0757-7741-85a3-84bb9805ba5b', '019fa38f-0753-7f30-a0cf-61037e844ba7',
  '019fa38f-0758-7d48-9991-8c1852e1829b', '019fa38f-0759-7cc2-b03b-894932ed9e8c',
  '019fa38f-075a-730b-8eb0-517bbe3595b9', '019fa38f-075b-721d-82d8-ffbcc8a9caa2',
  '019fa38f-0750-73a5-a5aa-998e2d8982c2', '019fa38f-0752-7559-a682-6cd10ebd0b9a',
  '019fa38f-0755-7319-8a9c-23e8e9f97264', '019fa38f-0754-71bd-ac34-5687fe18d4b4'
);--> statement-breakpoint
ALTER TABLE "indicator_version" DROP CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk";--> statement-breakpoint
ALTER TABLE "indicator_version" ADD CONSTRAINT "indicator_version_comparator_method_id_comparator_method_id_fk" FOREIGN KEY ("comparator_method_id") REFERENCES "public"."comparator_method"("id") ON DELETE no action ON UPDATE no action;
