CREATE TABLE IF NOT EXISTS profiles (
  code text PRIMARY KEY CHECK (code IN ('admin', 'client')),
  name text NOT NULL UNIQUE,
  description text NOT NULL
);
INSERT INTO profiles (code, name, description) VALUES
  ('admin', 'Administrador', 'Gestiona perfiles de usuarios, solicitudes de contacto y fotos de los carruseles.'),
  ('client', 'Cliente', 'Accede y actualiza su propia cuenta.')
ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description;
ALTER TABLE "user" ALTER COLUMN role SET DEFAULT 'client';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_profile_fk' AND conrelid = '"user"'::regclass) THEN
    ALTER TABLE "user" ADD CONSTRAINT user_profile_fk FOREIGN KEY (role) REFERENCES profiles(code);
  END IF;
END $$;
