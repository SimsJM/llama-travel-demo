/*
 * One-off: create the Product and recurring Price the pricing page sells.
 *
 *   node setup-catalog.js
 *
 * Prints the price ID to put in STRIPE_PRICE_ID. Safe to re-run — it looks for an
 * existing product with the same lookup key before creating anything.
 */

import Stripe from "stripe";

const { STRIPE_API_KEY } = process.env;

if (!STRIPE_API_KEY) {
  console.error("Set STRIPE_API_KEY first.");
  process.exit(1);
}

const stripe = new Stripe(STRIPE_API_KEY, { apiVersion: "2026-07-29.dahlia" });

const LOOKUP_KEY = "llama_premium_monthly";

const existing = await stripe.prices.list({
  lookup_keys: [LOOKUP_KEY],
  expand: ["data.product"],
});

if (existing.data.length > 0) {
  const price = existing.data[0];
  console.log(`Already exists.\n  product: ${price.product.id} (${price.product.name})`);
  console.log(`  price:   ${price.id}`);
  console.log(`\nSTRIPE_PRICE_ID=${price.id}`);
  process.exit(0);
}

// One Product per plan the customer can choose — not one product with many prices.
// Multiple prices on one product are for variants of the same plan (monthly vs annual).
const product = await stripe.products.create({
  name: "Llama Premium",
  description: "Unlimited trips, live re-planning, offline access and priority support.",
});

const price = await stripe.prices.create({
  product: product.id,
  lookup_key: LOOKUP_KEY,
  unit_amount: 2000, // £20.00 in pence — must match pricing.html
  currency: "gbp",
  recurring: { interval: "month" },
});

console.log(`Created.\n  product: ${product.id}\n  price:   ${price.id}`);
console.log(`\nSTRIPE_PRICE_ID=${price.id}`);
