CREATE TABLE IF NOT EXISTS inquiries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('Persona Natural', 'Operativo empresarial')),
  name text NOT NULL,
  email text NOT NULL,
  phone text NOT NULL,
  service text NOT NULL,
  company text,
  employees integer CHECK (employees > 0),
  appointment_date date,
  appointment_time time,
  address text,
  message text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind <> 'Operativo empresarial' OR (company IS NOT NULL AND employees IS NOT NULL AND appointment_date IS NOT NULL AND appointment_time IS NOT NULL))
);
