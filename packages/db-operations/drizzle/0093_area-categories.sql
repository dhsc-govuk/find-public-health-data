CREATE TABLE "area_category" (
	"area_id" uuid NOT NULL,
	"dimension_value_id" uuid NOT NULL,
	CONSTRAINT "area_category_area_id_dimension_value_id_pk" PRIMARY KEY("area_id","dimension_value_id")
);
--> statement-breakpoint
ALTER TABLE "area_category" ADD CONSTRAINT "area_category_area_id_area_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."area"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "area_category" ADD CONSTRAINT "area_category_dimension_value_id_dimension_value_id_fk" FOREIGN KEY ("dimension_value_id") REFERENCES "public"."dimension_value"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_area_category_dimension_value" ON "area_category" USING btree ("dimension_value_id","area_id");