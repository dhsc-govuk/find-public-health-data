-- The publisher's reason for fast-tracking a draft: no published view reads it, and internal_api
-- writes it under its table-level grant on indicator_version.
ALTER TABLE "indicator_version" ADD COLUMN "fast_track_reason" text;
