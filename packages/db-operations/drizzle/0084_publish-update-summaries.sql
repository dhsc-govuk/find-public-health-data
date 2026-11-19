-- The summaries of published updates for the public indicator page: those the core team chose to
-- publish with visibility in history, and those it sent for IMRG review. Only an update the core
-- team published without visibility in history is left out. An update's version carries its
-- summary, and the decision is on the version's latest submission, the one that was approved. A
-- new indicator's submissions have no decision, so its first version is never listed.
CREATE VIEW published.indicator_update_summary AS
SELECT v.indicator_id, v.published_at, v.update_summary
FROM indicator_version v
JOIN LATERAL (
  SELECT s.update_decision FROM indicator_version_submission s
  WHERE s.indicator_version_id = v.id
  ORDER BY s.number DESC
  LIMIT 1
) latest ON latest.update_decision IN ('publish_with_history', 'imrg_review')
WHERE v.status = 'published' AND v.update_summary IS NOT NULL;
--> statement-breakpoint
GRANT SELECT ON published.indicator_update_summary TO public_api, internal_api;
