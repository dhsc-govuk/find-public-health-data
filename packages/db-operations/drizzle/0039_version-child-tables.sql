-- The tag tables take the indicator_version_<child> names the other child tables have. Views
-- and grants follow a renamed table, so published.indicator_topic and
-- published.indicator_classification read the new names unchanged.
ALTER TABLE "indicator_topic" RENAME TO "indicator_version_topic";--> statement-breakpoint
ALTER TABLE "indicator_classification" RENAME TO "indicator_version_classification";--> statement-breakpoint
-- A renamed table keeps its not-null constraints' names, so they follow by hand.
ALTER TABLE "indicator_version_topic" RENAME CONSTRAINT "indicator_topic_indicator_version_id_not_null" TO "indicator_version_topic_indicator_version_id_not_null";--> statement-breakpoint
ALTER TABLE "indicator_version_topic" RENAME CONSTRAINT "indicator_topic_topic_id_not_null" TO "indicator_version_topic_topic_id_not_null";--> statement-breakpoint
ALTER TABLE "indicator_version_classification" RENAME CONSTRAINT "indicator_classification_indicator_version_id_not_null" TO "indicator_version_classification_indicator_version_id_not_null";--> statement-breakpoint
ALTER TABLE "indicator_version_classification" RENAME CONSTRAINT "indicator_classification_classification_id_not_null" TO "indicator_version_classification_classification_id_not_null";--> statement-breakpoint
-- The version comes first in every child table's primary key; a topic's versions are found by index.
ALTER TABLE "indicator_version_topic" DROP CONSTRAINT "indicator_topic_topic_id_indicator_version_id_pk";--> statement-breakpoint
ALTER TABLE "indicator_version_topic" ADD CONSTRAINT "indicator_version_topic_pk" PRIMARY KEY("indicator_version_id","topic_id");--> statement-breakpoint
DROP INDEX "idx_indicator_topic_indicator_version";--> statement-breakpoint
CREATE INDEX "idx_indicator_version_topic_topic" ON "indicator_version_topic" USING btree ("topic_id");--> statement-breakpoint
ALTER TABLE "indicator_version_classification" RENAME CONSTRAINT "indicator_classification_indicator_version_id_classification_id" TO "indicator_version_classification_pk";--> statement-breakpoint
ALTER INDEX "idx_indicator_classification_classification" RENAME TO "idx_indicator_version_classification_classification";--> statement-breakpoint
-- Every foreign key is named within Postgres's 63 bytes, so none is truncated.
ALTER TABLE "indicator_version_topic" RENAME CONSTRAINT "indicator_topic_indicator_version_id_indicator_version_id_fk" TO "indicator_version_topic_version_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_topic" RENAME CONSTRAINT "indicator_topic_topic_id_topic_id_fk" TO "indicator_version_topic_topic_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_classification" RENAME CONSTRAINT "indicator_classification_indicator_version_id_indicator_version" TO "indicator_version_classification_version_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_classification" RENAME CONSTRAINT "indicator_classification_classification_id_classification_id_fk" TO "indicator_version_classification_classification_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_link" RENAME CONSTRAINT "indicator_version_link_indicator_version_id_indicator_version_i" TO "indicator_version_link_version_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_age_range" RENAME CONSTRAINT "indicator_version_age_range_indicator_version_id_indicator_vers" TO "indicator_version_age_range_version_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_source" RENAME CONSTRAINT "indicator_version_source_indicator_version_id_indicator_version" TO "indicator_version_source_version_fk";--> statement-breakpoint
ALTER TABLE "indicator_version_source" RENAME CONSTRAINT "indicator_version_source_provider_id_data_provider_id_fk" TO "indicator_version_source_provider_fk";--> statement-breakpoint
-- The generated primary key name was cut short at 63 bytes.
ALTER TABLE "observation_range" RENAME CONSTRAINT "observation_range_indicator_id_display_group_from_date_to_date_" TO "observation_range_pk";
