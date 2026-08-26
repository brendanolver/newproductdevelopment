# WNDRR Product Timeline

Tracks every new WNDRR product from initial order through launch — replaces
the "New Product Development" Google Sheet. Styled and structured after
[wndrr-ad-pipeline](https://github.com/brendanolver/wndrr-ad-pipeline).

## What it does

- Auto-syncs the product list from Apparel Magic (AM): a style appears here
  once someone sets its **Box Size** field in AM, which is treated as "this
  style is ready to be tracked." Runs on startup and every 30 minutes, plus
  a manual "Sync Apparel Magic" button.
- Each product gets a row in the Timeline grid; each column is a stage from
  the original sheet (Ref Sample Purchased, CAD Drawing, Sent to Rach, Specs
  Completed, Tech Pack Sent, three rounds of Sample Comments, Approved for
  Bulk, Bulk Order Arrival, Shipping Sample Received, then Flat Lay /
  Stylised Flat Lay / E-Comm Images). Click a cell to mark it done, set a
  date, or leave a note.
- Admin tab: manually add a product AM doesn't have yet, archive/unarchive,
  or trigger a sync.

## Local setup

```bash
npm install
cp .env.example .env
# fill in DATABASE_URL (a local Postgres works fine), APP_PASSWORD,
# SESSION_SECRET, and AM_TOKEN
npm run dev
```

The server runs schema migrations automatically on start. Set
`SEED_EXAMPLE_DATA=true` once to load `db/seed.sql`'s three example products.

## Deployment (Railway)

1. Create a Railway project from this repo.
2. Add a Postgres plugin — sets `DATABASE_URL` automatically.
3. Set `APP_PASSWORD`, `SESSION_SECRET`, `AM_TOKEN` env vars.
4. Deploy — `railway.json` runs `npm start`.

## Notes

- The AM token is only ever used server-side (`src/lib/amClient.js`) — the
  browser never sees it.
- The sync never deletes or overwrites a manually-added product, and never
  removes a product just because AM stops returning it — checklist progress
  shouldn't vanish because a field changed upstream.
