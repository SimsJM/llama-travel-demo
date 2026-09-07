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
| `styles.css` | All styling — light and dark themes, responsive |
| `checkout.js` | Subscribe button: creates a Checkout Session, redirects to Stripe |

No build step, no package manager, no CDN, no external fonts. Four files and a web server.

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

The site is deliberately static. The **Subscribe** button on `pricing.html` posts to a
single backend endpoint, which is the only server-side piece required:

```
POST /api/create-checkout-session
     { "plan": "premium_monthly" }

200  { "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
```

`checkout.js` then redirects the browser to that URL. Until the endpoint exists, the
button reports the failure on the page rather than hanging silently — which is the
behaviour you want while building.

Serve the endpoint from the **same origin** as the site (e.g. a `/api/*` route on the
same host). A separate subdomain works but pulls CORS into a flow that doesn't need it.

### Testing

In test mode, pay with card `4242 4242 4242 4242`, any future expiry, any CVC, any
postcode. Stripe's [full test card list](https://docs.stripe.com/testing) covers
declines, 3-D Secure and other failure paths.

### Keys

The publishable key (`pk_test_…`) is safe in client code. The secret key (`sk_test_…`)
and the webhook signing secret must live in the server's environment and never in this
repository — everything here is served verbatim to the public.

## Notes

The content is fictional. "Llama" is not a real company, the testimonial is invented,
and no real payments are processed.

## Licence

MIT — see [LICENSE](LICENSE).
