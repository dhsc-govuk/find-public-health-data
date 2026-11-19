ALTER TABLE "area" ADD CONSTRAINT "area_code_validity_excl" EXCLUDE USING gist (
  code WITH =,
  daterange(valid_from, COALESCE(valid_to, '9999-12-31'::date), '[]') WITH &&
);
