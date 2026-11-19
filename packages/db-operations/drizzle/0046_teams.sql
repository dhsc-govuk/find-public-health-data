CREATE TABLE "team" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "team_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "indicator" ADD COLUMN "team_id" uuid;--> statement-breakpoint
ALTER TABLE "indicator" ADD CONSTRAINT "indicator_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- The ids are fixed: @fphd/auth names them as the teams its fake users belong to. Fingertips holds
-- the imported indicators and has no publishers.
INSERT INTO "team" ("id", "name") VALUES
  ('01a13c69-96aa-70af-81f9-10856a4023b2', 'Team A'),
  ('01a13c69-96ab-7598-9ce0-eae589a6c7e7', 'Team B'),
  ('01a13c69-96ab-7598-9ce0-ef35bcca9627', 'Team C'),
  ('01a13ca4-5b80-76ba-bda8-93cbb4a49f64', 'Fingertips');--> statement-breakpoint
GRANT SELECT ON "team" TO internal_api;
