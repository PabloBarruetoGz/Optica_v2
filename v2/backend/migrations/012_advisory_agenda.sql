CREATE TABLE advisory_slots (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 starts_at timestamptz NOT NULL, ends_at timestamptz NOT NULL,
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','published','blocked')),
 CHECK (ends_at > starts_at),
 EXCLUDE USING gist (tstzrange(starts_at,ends_at,'[)') WITH &&)
);
CREATE INDEX advisory_slots_start ON advisory_slots(starts_at);
CREATE TABLE advisory_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 slot_id uuid NOT NULL REFERENCES advisory_slots(id),
 name text NOT NULL, phone text NOT NULL, email text,
 status text NOT NULL DEFAULT 'confirmed' CHECK(status IN ('confirmed','cancelled')),
 request_id uuid UNIQUE NOT NULL, request_hash text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX advisory_active_booking ON advisory_bookings(slot_id) WHERE status='confirmed';
CREATE TABLE advisory_booking_history (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 booking_id uuid NOT NULL REFERENCES advisory_bookings(id),
 slot_id uuid NOT NULL REFERENCES advisory_slots(id),
 action text NOT NULL CHECK(action IN ('confirmed','cancelled','rescheduled')),
 actor_id text REFERENCES "user"(id) ON DELETE SET NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX advisory_booking_history_lookup ON advisory_booking_history(booking_id,id);
