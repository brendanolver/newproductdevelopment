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
