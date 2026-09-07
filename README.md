# Llama — travel assistant demo site

A two-page static marketing site for a fictional travel-planning assistant, built as a
sandbox for integrating **Stripe Checkout** subscriptions.

**Live demo:** https://llama.hauuuse.uk

---

## What's here

| File | Purpose |
|------|---------|
| `index.html` | Landing page — hero with a sample itinerary, how-it-works, feature cards |
| `pricing.html` | Free vs Premium plans, subscribe button, FAQ |
| `success.html` | Post-checkout landing page |
| `styles.css` | All styling — light and dark themes, responsive |
| `checkout.js` | Subscribe button: creates a Checkout Session, redirects to Stripe |
| `server/` | Node backend — Checkout Session creation and webhook handling |

The front end has no build step, no package manager, no CDN and no external fonts.
The backend is a single Node file in a container.

## Running it locally

```bash
git clone https://github.com/<your-username>/llama-travel-demo.git
cd llama-travel-demo
python -m http.server 8080
```

Then open http://localhost:8080.

It will also open straight from a `file://` path, but use the server — `checkout.js`
needs a real origin to POST to.

## Deploying

Any static host will serve this. A minimal [Caddy](https://caddyserver.com) config:

```caddyfile
example.com {
    root * /srv/llama
    file_server
    encode gzip
}
```

nginx:

```nginx
server {
    listen 80;
    server_name example.com;
    root /srv/llama;
    index index.html;
    location / { try_files $uri $uri/ =404; }
}
```

Or with Docker, no host config at all:

```bash
docker run -d -p 8080:80 -v "$PWD:/usr/share/nginx/html:ro" nginx:alpine
```

## Stripe integration

The **Subscribe** button on `pricing.html` posts to the backend, which creates a
[Checkout Session](https://docs.stripe.com/api/checkout/sessions) in `subscription`
mode and returns its URL. The browser is then redirected to Stripe's hosted page.

```
POST /api/create-checkout-session
     { "plan": "premium_monthly" }

200  { "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

Serve the backend from the **same origin** as the site — a `/api/*` route on the same
host. A separate subdomain works but pulls CORS into a flow that doesn't need it.

### Running the backend

```bash
cd server
cp .env.example .env      # fill in your keys
npm install
node setup-catalog.js     # creates the Product and Price, prints STRIPE_PRICE_ID
npm start
```

Or with Docker:

```bash
cd server
cp .env.example .env
docker compose up -d --build
```

### Webhooks are not optional

Fulfilment runs in the `/api/webhook` handler, **not** on `success.html`. A customer can
pay and close the tab before the redirect lands, and some payment methods settle hours
after checkout — in both cases the success page never executes. For subscriptions this
matters twice over: renewals, failed payments and cancellations all happen long after
the session, and an integration that only watches checkout believes every subscriber is
active forever.

Handled events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`
(gated on `payment_status`), `checkout.session.async_payment_failed`, `invoice.paid`,
`invoice.payment_failed`, `customer.subscription.updated`, `customer.subscription.deleted`.

Signatures are verified on every event before processing — the endpoint is public and
anyone can POST to it.

For local testing:

```bash
stripe listen --forward-to localhost:4242/api/webhook
```

### Testing

Pay with card `4242 4242 4242 4242`, any future expiry, any CVC, any postcode. Stripe's
[test card list](https://docs.stripe.com/testing) covers declines, 3-D Secure and other
failure paths — worth exercising, since the interesting bugs live there.

### Keys

Use a **restricted key** (`rk_…`) rather than a secret key (`sk_…`). This integration
needs only write on Checkout Sessions and read on Products and Prices; a restricted key
that leaks can't drain the account.

Keys and the webhook signing secret live in `server/.env`, which is gitignored. Nothing
secret belongs in the repository root — those files are served verbatim to the public.

### Note on payment methods

`payment_method_types` is deliberately never passed. Omitting it enables
[dynamic payment methods](https://docs.stripe.com/payments/payment-methods/dynamic-payment-methods),
so what a customer sees is driven by Dashboard settings and their location rather than
hardcoded in the request.

### Tax

If you charge US or EU customers for real, you'll need
[Stripe Tax](https://docs.stripe.com/billing/taxes/collect-taxes) alongside Billing.
Enabling `automatic_tax` is not sufficient on its own — Stripe collects nothing, and
reports no error, until you hold an active tax registration in the customer's
jurisdiction. This demo does not enable it.

## Notes

The content is fictional. "Llama" is not a real company, the testimonial is invented,
and no real payments are processed.

## Licence

MIT — see [LICENSE](LICENSE).
