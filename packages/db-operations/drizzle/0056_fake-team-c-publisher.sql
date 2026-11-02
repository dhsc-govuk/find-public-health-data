-- A second publisher in Team C, so a teammate of the publishing reviewer can submit an indicator
-- for them to review. The id is fixed: @fphd/auth signs the fake person in by it, until people
-- sign in through Entra.
INSERT INTO "app_user" ("id", "display_name", "kind") VALUES
  ('01a19d3e-4a0b-7591-9eb4-83550cc19ef5', 'Drew Kaur', 'person');
