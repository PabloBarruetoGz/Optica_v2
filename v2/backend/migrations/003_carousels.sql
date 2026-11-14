CREATE TABLE IF NOT EXISTS carousels (
  key text PRIMARY KEY CHECK (key IN ('exam', 'glasses', 'delivery', 'advice')),
  name text NOT NULL,
  display_order integer NOT NULL
);
CREATE TABLE IF NOT EXISTS carousel_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  data bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS carousel_slides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  carousel_key text NOT NULL REFERENCES carousels(key),
  position integer NOT NULL CHECK (position >= 0),
  original_src text NOT NULL,
  original_alt text NOT NULL,
  alt text NOT NULL,
  image_id uuid REFERENCES carousel_images(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (carousel_key, position)
);
INSERT INTO carousels (key, name, display_order) VALUES ('exam', 'Examen visual completo', 0) ON CONFLICT (key) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 0, '/assets/media/DSC07111-f923eceeb3.webp', 'DSC07111', 'DSC07111') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 1, '/assets/media/DSC07109-924d256309.webp', 'DSC07109', 'DSC07109') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 2, '/assets/media/IMG_1311-31ff7928e5.webp', 'IMG_1311', 'IMG_1311') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 3, '/assets/media/IMG_3042-44fda1f39c.webp', 'IMG_3042', 'IMG_3042') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 4, '/assets/media/DSC07087-cd224f7ae6.webp', 'DSC07087', 'DSC07087') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 5, '/assets/media/DSC07089-6a1cd44975.webp', 'DSC07089', 'DSC07089') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 6, '/assets/media/DSC07117-5178fb0216.webp', 'DSC07117', 'DSC07117') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 7, '/assets/media/IMG_1213-d0a6775f2c.webp', 'IMG_1213', 'IMG_1213') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 8, '/assets/media/IMG_4855-58d42962b9.webp', 'IMG_4855', 'IMG_4855') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 9, '/assets/media/IMG_4865-eff303d97c.webp', 'IMG_4865', 'IMG_4865') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 10, '/assets/media/IMG_8988-142d7e67d5.webp', 'IMG_8988', 'IMG_8988') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('exam', 11, '/assets/media/DSC07097-c655d02a7e.webp', 'DSC07097', 'DSC07097') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousels (key, name, display_order) VALUES ('glasses', 'Venta de lentes ópticos', 1) ON CONFLICT (key) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 0, '/assets/media/DSC07080-c1052e303e.webp', 'DSC07080', 'DSC07080') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 1, '/assets/media/84DDF9D9-45C7-4B2F-8B9A-722E3E6D51BF-d2dc4acbdc.png', '84DDF9D9-45C7-4B2F-8B9A-722E3E6D51BF', '84DDF9D9-45C7-4B2F-8B9A-722E3E6D51BF') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 2, '/assets/media/IMG_2684-ba6cff6f42.webp', 'IMG_2684', 'IMG_2684') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 3, '/assets/media/IMG_2719-495cbc5ddf.webp', 'IMG_2719', 'IMG_2719') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 4, '/assets/media/IMG_2772-ed73c9a870.webp', 'IMG_2772', 'IMG_2772') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 5, '/assets/media/IMG_2774-c6b49a7f8b.webp', 'IMG_2774', 'IMG_2774') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 6, '/assets/media/IMG_2775-991db9ebf8.webp', 'IMG_2775', 'IMG_2775') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 7, '/assets/media/IMG_3297-ca67ec33c3.webp', 'IMG_3297', 'IMG_3297') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 8, '/assets/media/IMG_3046-1e50e14e4d.webp', 'IMG_3046', 'IMG_3046') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 9, '/assets/media/DSC06966-d80837cdb5.webp', 'DSC06966', 'DSC06966') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('glasses', 10, '/assets/media/DSC07123-4d0fbf9892.webp', 'DSC07123', 'DSC07123') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousels (key, name, display_order) VALUES ('delivery', 'Entrega en la empresa', 2) ON CONFLICT (key) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 0, '/assets/media/IMG_3684-9554bd2a7b.webp', 'IMG_3684', 'IMG_3684') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 1, '/assets/media/IMG_3674-8b9175e81e.webp', 'IMG_3674', 'IMG_3674') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 2, '/assets/media/IMG_3681-6c8e4ea059.webp', 'IMG_3681', 'IMG_3681') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 3, '/assets/media/IMG_3673-4ef0870dc1.webp', 'IMG_3673', 'IMG_3673') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 4, '/assets/media/IMG_8339-e264fb4c59.webp', 'IMG_8339', 'IMG_8339') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 5, '/assets/media/IMG_4884-36fc286773.webp', 'IMG_4884', 'IMG_4884') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 6, '/assets/media/IMG_4883-f8d9ca7024.webp', 'IMG_4883', 'IMG_4883') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 7, '/assets/media/IMG_4882-789ddd4374.webp', 'IMG_4882', 'IMG_4882') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 8, '/assets/media/IMG_4876-74a7ebb7de.webp', 'IMG_4876', 'IMG_4876') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('delivery', 9, '/assets/media/IMG_4873-4aa5042c7c.webp', 'IMG_4873', 'IMG_4873') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousels (key, name, display_order) VALUES ('advice', 'Asesoría de imagen', 3) ON CONFLICT (key) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 0, '/assets/media/DSC06978-f740d75470.webp', 'DSC06978', 'DSC06978') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 1, '/assets/media/3c3a6142-1896-43d8-b8a7-d72074186504-2f3ebbc2ad.webp', '3c3a6142-1896-43d8-b8a7-d72074186504', '3c3a6142-1896-43d8-b8a7-d72074186504') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 2, '/assets/media/74eee585-d2a5-40e8-8e9b-6d5bdc9e80e0-c772b7f74f.webp', '74eee585-d2a5-40e8-8e9b-6d5bdc9e80e0', '74eee585-d2a5-40e8-8e9b-6d5bdc9e80e0') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 3, '/assets/media/b428ffc1-ae81-4c8b-bd98-ffdbd6d5805a-2f8203651d.webp', 'b428ffc1-ae81-4c8b-bd98-ffdbd6d5805a', 'b428ffc1-ae81-4c8b-bd98-ffdbd6d5805a') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 4, '/assets/media/140a2f4d-def6-4e99-9fb3-241263d48abe-aeb3065a98.webp', '140a2f4d-def6-4e99-9fb3-241263d48abe', '140a2f4d-def6-4e99-9fb3-241263d48abe') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 5, '/assets/media/DSC06995-9e28bb9a9b.webp', 'DSC06995', 'DSC06995') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 6, '/assets/media/DSC07026-af5f81b162.webp', 'DSC07026', 'DSC07026') ON CONFLICT (carousel_key, position) DO NOTHING;
INSERT INTO carousel_slides (carousel_key, position, original_src, original_alt, alt) VALUES ('advice', 7, '/assets/media/DSC07059-d851b56490.webp', 'DSC07059', 'DSC07059') ON CONFLICT (carousel_key, position) DO NOTHING;
