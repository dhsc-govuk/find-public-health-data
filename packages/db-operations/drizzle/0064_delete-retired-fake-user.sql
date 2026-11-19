-- Alex Morgan was the public-only fake user, gone now that public-web has no sign-in (FPH-598).
-- Only the public site let them sign in, and it writes nothing, so no row names them as an actor.
DELETE FROM "app_user" WHERE "id" = '01a13c69-96ac-700c-9c28-8f3a1d3968e2';
