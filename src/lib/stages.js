// Single source of truth for the timeline grid's columns, in sheet order.
// 'boolean' stages are marked done/not-done; 'date' stages record when the
// thing happened. Both are stored the same way (product_stages.completed_at)
// — a date-type stage's completed_at IS the recorded date.

const STAGES = [
  { key: 'shopify_synced', label: 'Shopify Synced', type: 'boolean' },
  { key: 'ref_sample_purchased', label: 'Ref Sample Purchased', type: 'boolean' },
  { key: 'cad_drawing', label: 'CAD Drawing', type: 'boolean' },
  { key: 'sent_to_rach', label: 'Sent to Rach', type: 'date' },
  { key: 'specs_completed', label: 'Specs Completed', type: 'boolean' },
  { key: 'tech_pack_sent', label: 'Tech Pack Sent', type: 'date' },
  { key: 'first_sample_comments', label: 'First Sample Comments', type: 'date' },
  { key: 'second_sample_comments', label: 'Second Sample Comments', type: 'date' },
  { key: 'third_sample_comments', label: 'Third Sample Comments', type: 'date' },
  { key: 'approved_for_bulk', label: 'Approved for Bulk', type: 'date' },
  { key: 'bulk_order_arrival', label: 'Bulk Order Arrival', type: 'date' },
  { key: 'shipping_sample_received', label: 'Shipping Sample Received', type: 'boolean' },
  { key: 'flat_lay_images', label: 'Flat Lay Images', type: 'boolean' },
  { key: 'stylised_flat_lay_images', label: 'Stylised Flat Lay Images', type: 'boolean' },
  { key: 'ecomm_images', label: 'E-Comm Images', type: 'boolean' },
];

const STAGE_KEYS = STAGES.map((s) => s.key);
const STAGE_BY_KEY = Object.fromEntries(STAGES.map((s) => [s.key, s]));

// A product's "current stage" is the first stage (in sheet order) that
// isn't done yet — mirrors the client-side version in public/app.js.
// null means every stage is complete.
function currentStage(stageMap) {
  return STAGES.find((s) => !(stageMap[s.key] && stageMap[s.key].completed_at)) || null;
}

module.exports = { STAGES, STAGE_KEYS, STAGE_BY_KEY, currentStage };
