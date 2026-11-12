-- A reviewer's approval of an update has no IMRG meeting date. The check now lets any approval
-- go undated, and the internal API requires the date on a new indicator's approval. Relaxing the
-- check holds for every existing row, and no published view reads responses.
ALTER TABLE "indicator_version_submission_response" DROP CONSTRAINT "indicator_version_submission_response_imrg_reviewed_on_check";--> statement-breakpoint
ALTER TABLE "indicator_version_submission_response" ADD CONSTRAINT "indicator_version_submission_response_imrg_reviewed_on_check" CHECK (("indicator_version_submission_response"."imrg_reviewed_on" IS NULL) = ("indicator_version_submission_response"."kind" = 'pre_imrg_feedback') OR "indicator_version_submission_response"."kind" = 'approved');
