CREATE TABLE lens_order_status (
  code text PRIMARY KEY,
  label text NOT NULL,
  position integer NOT NULL UNIQUE
);
INSERT INTO lens_order_status VALUES
 ('registered','Orden registrada',1),('preparing','En preparación',2),
 ('processing','En proceso',3),('ready','Listo para retiro',4),
 ('delivered','Entregado',5),('cancelled','Cancelado',6);
CREATE TABLE lens_order_transition (
  source text REFERENCES lens_order_status(code), target text REFERENCES lens_order_status(code),
  PRIMARY KEY(source,target), CHECK (source <> target)
);
INSERT INTO lens_order_transition VALUES
 ('registered','preparing'),('preparing','processing'),('processing','ready'),('ready','delivered'),
 ('registered','cancelled'),('preparing','cancelled'),('processing','cancelled'),('ready','cancelled');
CREATE TABLE lens_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  customer_id text NOT NULL REFERENCES "user"(id),
  customer_name text NOT NULL, phone text NOT NULL, whatsapp_consent boolean NOT NULL DEFAULT false, description text NOT NULL,
  lens_type text NOT NULL DEFAULT '', frame text NOT NULL DEFAULT '', internal_notes text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'registered' REFERENCES lens_order_status(code),
  available_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lens_orders_customer ON lens_orders(customer_id, number DESC);
CREATE TABLE lens_order_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  order_id uuid NOT NULL REFERENCES lens_orders(id),
  actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
  status text NOT NULL REFERENCES lens_order_status(code),
  kind text NOT NULL CHECK(kind IN ('status','edit')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lens_order_history_order ON lens_order_history(order_id,id);
CREATE TABLE pickup_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL UNIQUE REFERENCES lens_orders(id),
  recipient text NOT NULL, status text NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','sending','sent','delivered','failed','uncertain','cancelled','skipped')),
  attempts integer NOT NULL DEFAULT 0, next_attempt timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(), provider_id text UNIQUE, error_code text
);
CREATE INDEX pickup_notifications_pending ON pickup_notifications(next_attempt) WHERE status='pending';
CREATE TABLE pickup_notification_attempts (
  notification_id uuid REFERENCES pickup_notifications(id), attempt integer NOT NULL,
  outcome text NOT NULL, code text, recorded_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(notification_id,attempt)
);
