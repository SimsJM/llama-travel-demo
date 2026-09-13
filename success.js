/*
 * Success page.
 *
 * Stripe sends the customer here with ?session_id={CHECKOUT_SESSION_ID}. This asks
 * the backend what that session actually is, rather than assuming the page loading
 * means someone paid — anyone can type this URL in.
 *
 * This is confirmation UI only. Access is granted by the webhook, because a customer
 * can pay and never load this page at all.
 */

const statusEl = document.getElementById("status");
const headlineEl = document.getElementById("headline");
const eyebrowEl = document.getElementById("eyebrow");

const sessionId = new URLSearchParams(window.location.search).get("session_id");

function render({ eyebrow, headline, detail }) {
  eyebrowEl.textContent = eyebrow;
  headlineEl.textContent = headline;
  statusEl.textContent = detail;
}

if (!sessionId) {
  render({
    eyebrow: "Nothing to show",
    headline: "No checkout to confirm.",
    detail:
      "This page confirms a completed checkout. Start one from the pricing page.",
  });
} else {
  render({
    eyebrow: "One moment",
    headline: "Confirming your payment…",
    detail: "Checking with Stripe.",
  });

  fetch(`/api/session-status?session_id=${encodeURIComponent(sessionId)}`)
    .then((response) => {
      if (!response.ok) throw new Error(`Server returned ${response.status}`);
      return response.json();
    })
    .then((session) => {
      if (session.status === "complete" && session.paymentStatus === "paid") {
        render({
          eyebrow: "Payment received",
          headline: "You're on Premium.",
          detail: session.email
            ? `A receipt is on its way to ${session.email}.`
            : "A receipt is on its way to your email.",
        });
        return;
      }

      if (session.paymentStatus === "unpaid") {
        // Delayed-notification method: completed, but the money hasn't settled.
        render({
          eyebrow: "Almost there",
          headline: "Your payment is processing.",
          detail:
            "Some payment methods take a little while to clear. We'll email you the " +
            "moment it settles — no need to pay again.",
        });
        return;
      }

      render({
        eyebrow: "Not completed",
        headline: "That checkout didn't finish.",
        detail: "No payment was taken. You can try again from the pricing page.",
      });
    })
    .catch((error) => {
      // Don't claim success we can't verify.
      render({
        eyebrow: "Couldn't confirm",
        headline: "We can't reach Stripe right now.",
        detail:
          "If your payment went through it is safe — check your email for a receipt, " +
          "and contact us before paying again.",
      });
      console.error("[llama] session lookup failed:", error);
    });
}
