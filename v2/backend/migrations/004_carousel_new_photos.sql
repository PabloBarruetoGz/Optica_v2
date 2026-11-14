ALTER TABLE carousel_slides ALTER COLUMN original_src DROP NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'carousel_slide_has_image' AND conrelid = 'carousel_slides'::regclass) THEN
    ALTER TABLE carousel_slides ADD CONSTRAINT carousel_slide_has_image CHECK (original_src IS NOT NULL OR image_id IS NOT NULL);
  END IF;
END $$;
