-- Nothing reads these two read models or their views (FPH-571). Dropping the views first keeps the
-- table drops from removing anything unnamed; the grants and indexes go with their objects.
DROP VIEW published.latest_headline;--> statement-breakpoint
DROP VIEW published.indicator_dimension_values;--> statement-breakpoint
DROP TABLE "indicator_dimension_values" CASCADE;--> statement-breakpoint
DROP TABLE "latest_headline" CASCADE;
