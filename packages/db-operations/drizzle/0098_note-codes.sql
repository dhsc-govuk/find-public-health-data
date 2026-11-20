CREATE TABLE "note_type_public" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	CONSTRAINT "note_type_public_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "note_type_public" ADD CONSTRAINT "note_type_public_id_note_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."note_type"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE VIEW published.note_type_public AS SELECT * FROM note_type_public;--> statement-breakpoint
GRANT SELECT ON published.note_type_public TO public_api, internal_api;
