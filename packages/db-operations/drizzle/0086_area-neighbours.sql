CREATE TABLE "area_neighbour" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"area_id" uuid NOT NULL,
	"neighbour_area_id" uuid NOT NULL,
	"scheme" text NOT NULL,
	"position" integer NOT NULL,
	CONSTRAINT "area_neighbour_position_check" CHECK ("area_neighbour"."position" > 0)
);
--> statement-breakpoint
ALTER TABLE "area_neighbour" ADD CONSTRAINT "area_neighbour_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_neighbour" ADD CONSTRAINT "area_neighbour_neighbour_area_id_area_id_fk" FOREIGN KEY ("neighbour_area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idx_area_neighbour_area_scheme_position" ON "area_neighbour" USING btree ("area_id","scheme","position");