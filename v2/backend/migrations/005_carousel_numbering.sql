ALTER TABLE carousel_slides DROP CONSTRAINT IF EXISTS carousel_slides_carousel_key_position_key;
ALTER TABLE carousel_slides ADD CONSTRAINT carousel_slides_carousel_key_position_key UNIQUE (carousel_key, position) DEFERRABLE INITIALLY IMMEDIATE;
