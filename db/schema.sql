-- WNDRR Product Timeline schema
-- style_code follows the same scheme as ApparelMagic/wndrr-ad-pipeline so
-- data can be shared across tools without a migration.

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  style_code VARCHAR(64) UNIQUE NOT NULL,
  am_product_id VARCHAR(32),
  name VARCHAR(255) NOT NULL,
  category VARCHAR(255),
  launch_date DATE,
  image_url TEXT,
  box_size VARCHAR(64),
  source VARCHAR(10) NOT NULL DEFAULT 'am' CHECK (source IN ('am', 'manual')),
  archived BOOLEAN NOT NULL DEFAULT false,
  am_last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_archived ON products(archived);
CREATE INDEX IF NOT EXISTS idx_products_launch_date ON products(launch_date);

-- One row per (product, stage) that has ever been touched. Absence of a row
-- means the stage is not done. completed_at doubles as the "date" value for
-- date-type stages and as the completion flag for boolean-type stages.
CREATE TABLE IF NOT EXISTS product_stages (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  stage_key VARCHAR(64) NOT NULL,
  completed_at TIMESTAMPTZ,
  note TEXT,
  updated_by VARCHAR(255),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (product_id, stage_key)
);

CREATE INDEX IF NOT EXISTS idx_product_stages_product_id ON product_stages(product_id);

CREATE TABLE IF NOT EXISTS team_members (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Added after the initial release — IF NOT EXISTS so this is safe to
-- re-run against a database that already has product_stages.
ALTER TABLE product_stages ADD COLUMN IF NOT EXISTS owner_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL;

-- Default owner per stage (set in Admin), so opening a stage that's never
-- been touched for a given product pre-fills its owner instead of starting
-- unassigned every time. Purely a UI convenience default — once a product's
-- stage has its own owner_id saved, changing the default here doesn't touch it.
CREATE TABLE IF NOT EXISTS stage_default_owners (
  stage_key VARCHAR(64) PRIMARY KEY,
  owner_id INTEGER REFERENCES team_members(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Single-row table (id always 1) holding when the weekly outstanding-styles
-- email goes out, editable from Admin instead of being a code constant.
-- weekday matches JS Date#getDay() (0 = Sunday .. 6 = Saturday). Time is
-- interpreted in Australia/Sydney, same as the rest of the scheduler.
CREATE TABLE IF NOT EXISTS weekly_email_schedule (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  weekday SMALLINT NOT NULL DEFAULT 1 CHECK (weekday BETWEEN 0 AND 6),
  hour SMALLINT NOT NULL DEFAULT 8 CHECK (hour BETWEEN 0 AND 23),
  minute SMALLINT NOT NULL DEFAULT 0 CHECK (minute BETWEEN 0 AND 59),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO weekly_email_schedule (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

-- The timeline's milestone columns, editable from Admin (add/remove/reorder)
-- instead of a hardcoded list. sort_order controls display order; gaps are
-- fine since reordering rewrites every row's value. Seeded once with the
-- app's original 15 stages so existing product_stages rows (keyed by
-- stage_key, no FK) keep matching after upgrade.
CREATE TABLE IF NOT EXISTS stages (
  stage_key VARCHAR(64) PRIMARY KEY,
  label VARCHAR(255) NOT NULL,
  type VARCHAR(10) NOT NULL DEFAULT 'boolean' CHECK (type IN ('boolean', 'date')),
  sort_order INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stages_sort_order ON stages(sort_order);

INSERT INTO stages (stage_key, label, type, sort_order) VALUES
  ('shopify_synced', 'Shopify Synced', 'boolean', 0),
  ('ref_sample_purchased', 'Ref Sample Purchased', 'boolean', 1),
  ('cad_drawing', 'CAD Drawing', 'boolean', 2),
  ('sent_to_rach', 'Sent to Rach', 'date', 3),
  ('specs_completed', 'Specs Completed', 'boolean', 4),
  ('tech_pack_sent', 'Tech Pack Sent', 'date', 5),
  ('first_sample_comments', 'First Sample Comments', 'date', 6),
  ('second_sample_comments', 'Second Sample Comments', 'date', 7),
  ('third_sample_comments', 'Third Sample Comments', 'date', 8),
  ('approved_for_bulk', 'Approved for Bulk', 'date', 9),
  ('bulk_order_arrival', 'Bulk Order Arrival', 'date', 10),
  ('shipping_sample_received', 'Shipping Sample Received', 'boolean', 11),
  ('flat_lay_images', 'Flat Lay Images', 'boolean', 12),
  ('stylised_flat_lay_images', 'Stylised Flat Lay Images', 'boolean', 13),
  ('ecomm_images', 'E-Comm Images', 'boolean', 14)
ON CONFLICT (stage_key) DO NOTHING;

-- Weekly email recipients, editable from Admin instead of a hardcoded
-- constant / env var. Seeded with the previous hardcoded addresses so
-- upgrading doesn't silently stop emailing anyone.
CREATE TABLE IF NOT EXISTS email_recipients (
  id SERIAL PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO email_recipients (email) VALUES
  ('brendan@kohindustries.com'),
  ('sheridan@kohindustries.com')
ON CONFLICT (email) DO NOTHING;
