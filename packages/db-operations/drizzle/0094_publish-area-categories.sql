CREATE VIEW published.area_category AS SELECT * FROM area_category;
--> statement-breakpoint
GRANT SELECT ON published.area_category TO public_api, internal_api;
