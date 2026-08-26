-- Optional example data for local development (SEED_EXAMPLE_DATA=true).
INSERT INTO products (style_code, name, category, launch_date, image_url, box_size, source)
VALUES
  ('W26JK017AGY', 'KINGSWOOD CARGO SHORT - ASH GREY', 'SHORTS', '2026-09-21', NULL, '1', 'am'),
  ('W26JK017CYG', 'KINGSWOOD CARGO SHORT - CANYON GREEN', 'SHORTS', '2026-09-21', NULL, '1', 'am'),
  ('W26JK017MAB', 'KINGSWOOD CARGO SHORT - MARINE BLUE', 'SHORTS', '2026-09-21', NULL, '1', 'am')
ON CONFLICT (style_code) DO NOTHING;
