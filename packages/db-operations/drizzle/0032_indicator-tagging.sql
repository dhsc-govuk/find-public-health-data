ALTER TABLE "indicator_version" ADD COLUMN "has_risk_factor" boolean;--> statement-breakpoint
ALTER TABLE "indicator_version" ADD COLUMN "has_framework" boolean;--> statement-breakpoint
-- A version already given a risk factor or framework has answered yes; the rest stay unanswered.
UPDATE "indicator_version" SET "has_risk_factor" = true
WHERE EXISTS (
  SELECT 1 FROM "indicator_classification" ic
  JOIN "classification" c ON c.id = ic.classification_id
  WHERE ic.indicator_version_id = "indicator_version".id AND c.dimension = 'risk_factor'
);--> statement-breakpoint
UPDATE "indicator_version" SET "has_framework" = true
WHERE EXISTS (
  SELECT 1 FROM "indicator_classification" ic
  JOIN "classification" c ON c.id = ic.classification_id
  WHERE ic.indicator_version_id = "indicator_version".id AND c.dimension = 'framework'
);--> statement-breakpoint
-- Classifications take the fixed ids the core data file gives them: each row the file names
-- moves to its id, matched by slug, and its links move with it. Other rows keep their ids.
ALTER TABLE "indicator_classification" DROP CONSTRAINT "indicator_classification_classification_id_classification_id_fk";--> statement-breakpoint
WITH fixed (slug, id) AS (VALUES
  ('indicator-type-determinant-or-risk-factor', '01a0edef-f608-76bb-b95c-c9b3d204b658'),
  ('indicator-type-healthcare-utilisation', '01a0edef-f609-758f-8890-bf7510dc1c4f'),
  ('indicator-type-outcome', '01a0edef-f609-758f-8890-c2d9a81ec617'),
  ('indicator-type-prevalence-and-detection', '01a0edef-f609-758f-8890-c6ca27373c3b'),
  ('indicator-type-spend-and-resource', '01a0edef-f609-758f-8890-c8e2952e8f22'),
  ('indicator-type-treatment-and-care', '01a0edef-f609-758f-8890-cfe4981b005c'),
  ('risk-factor-air-pollution-or-environment', '01a0edef-f609-758f-8890-d1f237542d17'),
  ('risk-factor-alcohol', '01a0edef-f609-758f-8890-d4ee5defa462'),
  ('risk-factor-diet-and-nutrition', '01a0edef-f609-758f-8890-d841b1e11b9f'),
  ('risk-factor-drug-use', '01a0edef-f609-758f-8890-de9b3495bd43'),
  ('risk-factor-excess-weight-or-obesity', '01a0edef-f609-758f-8890-e39194bfca67'),
  ('risk-factor-gambling', '01a0edef-f609-758f-8890-e7bf5424a10d'),
  ('risk-factor-high-blood-pressure-or-cholesterol', '01a0edef-f609-758f-8890-eb7d2105d501'),
  ('risk-factor-physical-activity-or-inactivity', '01a0edef-f609-758f-8890-ec70198472ec'),
  ('risk-factor-smoking-and-tobacco', '01a0edef-f609-758f-8890-f23d6e3a1846'),
  ('risk-factor-violence', '01a0edef-f609-758f-8890-f75d7dd3d9d5'),
  ('framework-10-year-plan', '01a0edef-f609-758f-8890-f8164270ccf0'),
  ('framework-healthy-child', '01a0edef-f609-758f-8890-ffbad7ea5363'),
  ('framework-local-outcomes-framework', '01a0edef-f609-758f-8891-01cd56687ef4'),
  ('framework-public-health-outcomes-framework', '01a0edef-f609-758f-8891-079e7e9029dc'),
  ('inequality-deprivation-or-income', '01a0edef-f609-758f-8891-0923cbae4102'),
  ('population-all-ages', '01a0edef-f609-758f-8891-0c5261f1e793'),
  ('population-infants-and-early-years-aged-4-years-and-under', '01a0edef-f609-758f-8891-11a47fd1bcde'),
  ('population-working-age-adults-aged-18-to-64-years', '01a0edef-f609-758f-8891-1412a3792ed6')
),
moved AS (
  SELECT c.id AS old_id, f.id::uuid AS new_id
  FROM "classification" c JOIN fixed f ON f.slug = c.slug
  WHERE c.id <> f.id::uuid
),
relinked AS (
  UPDATE "indicator_classification" ic SET classification_id = m.new_id
  FROM moved m WHERE ic.classification_id = m.old_id
)
UPDATE "classification" c SET id = m.new_id FROM moved m WHERE c.id = m.old_id;--> statement-breakpoint
ALTER TABLE "indicator_classification" ADD CONSTRAINT "indicator_classification_classification_id_classification_id_fk" FOREIGN KEY ("classification_id") REFERENCES "public"."classification"("id") ON DELETE no action ON UPDATE no action;
