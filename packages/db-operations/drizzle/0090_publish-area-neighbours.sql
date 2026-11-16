-- Statistical neighbours are reference data, published as they are held.
CREATE VIEW published.area_neighbour AS SELECT * FROM area_neighbour;
--> statement-breakpoint
GRANT SELECT ON published.area_neighbour TO public_api, internal_api;
