CREATE TABLE instagram_section (
  id integer PRIMARY KEY CHECK (id = 1),
  enabled boolean NOT NULL DEFAULT true,
  posts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(posts) = 'array' AND jsonb_array_length(posts) <= 12),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO instagram_section (id) VALUES (1);
