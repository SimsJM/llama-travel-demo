/*
 * Llama demo — Checkout backend.
 *
 * Two endpoints matter:
 *   POST /api/create-checkout-session   the pricing page calls this, gets back a URL
 *   POST /api/webhook                   Stripe calls this; this is what actually grants access
 *
 * Fulfilment lives in the webhook, not on the success page. A customer can pay and
 * then close the tab before the redirect lands, and some payment methods settle hours
 * later — in both cases the success page never runs.
 */

import express from "express";
import Stripe from "stripe";

const {
  STRIPE_API_KEY,
  STRIPE_WEBHOOK_SECRET,
  STRIPE_PRICE_ID,
  SITE_URL = "https://llama.hauuuse.uk",
  PORT = 4242,
} = process.env;

for (const [name, value] of Object.entries({ STRIPE_API_KEY, STRIPE_PRICE_ID })) {
  if (!value) {
    console.error(`[llama] missing required env var ${name} — refusing to start`);
    process.exit(1);
  }
}

if (!STRIPE_WEBHOOK_SECRET) {
  console.warn(
    "[llama] STRIPE_WEBHOOK_SECRET is not set. /api/webhook will reject every event " +
      "until it is. Subscriptions will appear to work and then silently never renew.",
  );
}

const stripe = new Stripe(STRIPE_API_KEY, {
  apiVersion: "2026-07-29.dahlia",
  appInfo: { name: "llama-demo", version: "1.0.0" },
});

const app = express();
app.set("trust proxy", true); // behind Caddy behind Cloudflare

/* ------------------------------------------------------------------ *
 * Webhook — must be registered BEFORE express.json(), because
 * signature verification needs the raw, unparsed body.
 * ------------------------------------------------------------------ */

app.post(
  "/api/webhook",
  express.raw({ type: "application/json" }),
  async (request, response) => {
    if (!STRIPE_WEBHOOK_SECRET) {
      return response.status(503).send("Webhook secret not configured");
    }

    let event;
    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        request.headers["stripe-signature"],
        STRIPE_WEBHOOK_SECRET,
      );
    } catch (error) {
      // Never process an event that fails signature verification — anyone can POST here.
      console.error("[llama] webhook signature verification failed:", error.message);
      return response.status(400).send(`Webhook Error: ${error.message}`);
    }

    try {
      switch (event.type) {
        // Both of these mean "the customer got through checkout". The async variant
        // arrives later for delayed-notification methods.
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
          const session = event.data.object;
          if (session.payment_status === "unpaid") {
            // Completed but not paid yet — a delayed method. Wait for the async event.
            console.log(`[llama] session ${session.id} completed but unpaid; holding off`);
            break;
          }
          grantAccess(session);
          break;
        }

        case "checkout.session.async_payment_failed":
          console.warn(`[llama] async payment failed for ${event.data.object.id}`);
          break;

        // Subscription lifecycle. Renewals, cancellations and dunning all happen
        // here, long after checkout — an integration that ignores these thinks
        // every subscriber is still active forever.
        case "invoice.paid":
          console.log(`[llama] invoice paid, subscription period extended: ${event.data.object.id}`);
          break;

        case "invoice.payment_failed":
          console.warn(`[llama] payment failed, dunning started: ${event.data.object.id}`);
          break;

        case "customer.subscription.updated":
        case "customer.subscription.deleted": {
          const subscription = event.data.object;
          console.log(`[llama] subscription ${subscription.id} is now ${subscription.status}`);
          break;
        }

        default:
          console.log(`[llama] unhandled event type ${event.type}`);
      }
    } catch (error) {
      // Return 500 so Stripe retries rather than dropping the event.
      console.error(`[llama] handler threw for ${event.type}:`, error);
      return response.status(500).send("Handler error");
    }

    response.json({ received: true });
  },
);

app.use(express.json());

/* ------------------------------------------------------------------ *
 * Checkout Session
 * ------------------------------------------------------------------ */

app.post("/api/create-checkout-session", async (request, response) => {
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: STRIPE_PRICE_ID, quantity: 1 }],
      // {CHECKOUT_SESSION_ID} is substituted by Stripe, not by us — the braces are
      // literal in this string. The success page uses it to look up what happened.
      success_url: `${SITE_URL}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/cancelled.html`,
      // Lets a customer manage the subscription later without you building billing UI.
      billing_address_collection: "auto",
      // Tags sessions in the Dashboard so this flow can be compared against others.
      integration_identifier: "llama-pricing-qkzvhtxm",
      // NOTE: payment_method_types is deliberately absent. Omitting it enables dynamic
      // payment methods, so what a customer sees is driven by Dashboard settings and
      // their location rather than hardcoded here.
    });

    response.json({ url: session.url });
  } catch (error) {
    console.error("[llama] failed to create Checkout Session:", error.message);
    response.status(500).json({ error: "Could not start checkout" });
  }
});

/*
 * What happened to this session? Used by the success page so it reports the real
 * outcome instead of assuming the page loading means someone paid.
 *
 * Only non-sensitive fields are returned. A session id is a bearer-ish token that
 * appears in a URL, so this must not become a way to read customer records.
 */
app.get("/api/session-status", async (request, response) => {
  const sessionId = request.query.session_id;

  if (typeof sessionId !== "string" || !sessionId.startsWith("cs_")) {
    return response.status(400).json({ error: "Invalid session id" });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    response.json({
      status: session.status,               // open | complete | expired
      paymentStatus: session.payment_status, // paid | unpaid | no_payment_required
      email: session.customer_details?.email ?? null,
    });
  } catch (error) {
    console.error("[llama] session lookup failed:", error.message);
    response.status(404).json({ error: "Session not found" });
  }
});

app.get("/api/health", (_request, response) => {
  response.json({
    ok: true,
    priceConfigured: Boolean(STRIPE_PRICE_ID),
    webhookConfigured: Boolean(STRIPE_WEBHOOK_SECRET),
    mode: STRIPE_API_KEY.includes("_test_") ? "test" : "live",
  });
});

/* ------------------------------------------------------------------ */

function grantAccess(session) {
  // A real app writes to its own database here — mark the customer as Premium,
  // send a welcome email, and so on. This demo has no user store, so it logs.
  console.log(
    `[llama] ACCESS GRANTED  customer=${session.customer} ` +
      `subscription=${session.subscription} email=${session.customer_details?.email ?? "unknown"}`,
  );
}

app.listen(PORT, () => {
  console.log(`[llama] checkout backend listening on :${PORT}`);
  console.log(`[llama] mode: ${STRIPE_API_KEY.includes("_test_") ? "TEST" : "LIVE"}`);
});
