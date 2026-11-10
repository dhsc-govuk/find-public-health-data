ALTER TABLE "deprivation_scheme" DROP CONSTRAINT "deprivation_scheme_id_dimension_type_id_fk";
--> statement-breakpoint
ALTER TABLE "dimension_type_public" DROP CONSTRAINT "dimension_type_public_id_dimension_type_id_fk";
--> statement-breakpoint
ALTER TABLE "dimension_value_public" DROP CONSTRAINT "dimension_value_public_id_dimension_value_id_fk";
--> statement-breakpoint
ALTER TABLE "note_type_public" DROP CONSTRAINT "note_type_public_id_note_type_id_fk";
--> statement-breakpoint
ALTER TABLE "deprivation_scheme" ADD CONSTRAINT "deprivation_scheme_id_dimension_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_type"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dimension_type_public" ADD CONSTRAINT "dimension_type_public_id_dimension_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_type"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "dimension_value_public" ADD CONSTRAINT "dimension_value_public_id_dimension_value_id_fk" FOREIGN KEY ("id") REFERENCES "public"."dimension_value"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "note_type_public" ADD CONSTRAINT "note_type_public_id_note_type_id_fk" FOREIGN KEY ("id") REFERENCES "public"."note_type"("id") ON DELETE cascade ON UPDATE cascade;