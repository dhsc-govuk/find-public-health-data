-- A second publisher in Team A, so a teammate of Sam Taylor can edit, reply to a review and
-- resubmit the same indicator. The id is fixed: @fphd/auth signs the fake person in by it, until
-- people sign in through Entra.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a1a248-ca45-70b6-912d-21b990329653', 'Charlie Owen', 'person');
