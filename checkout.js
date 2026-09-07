/*
 * Subscribe button.
 *
 * The site is static. This posts to a backend endpoint that creates a Stripe
 * Checkout Session and returns { url }, then redirects to it. Until that
 * endpoint exists the button fails visibly rather than silently — which is the
 * behaviour you want while you are still building.
 *
 * Backend contract expected:
 *   POST /api/create-checkout-session   { plan: "premium_monthly" }
 *   200  { "url": "https://checkout.stripe.com/c/pay/cs_test_..." }
 */

var ENDPOINT = "/api/create-checkout-session";

var button = document.getElementById("subscribe");
var status = document.getElementById("checkout-status");

function say(message) {
  status.textContent = message;
}

button.addEventListener("click", async function () {
  button.disabled = true;
  say("Opening secure checkout…");

  try {
    var response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: button.dataset.plan })
    });

    if (!response.ok) {
      throw new Error("Server returned " + response.status);
    }

    var session = await response.json();
    if (!session.url) {
      throw new Error("Response had no checkout URL");
    }

    window.location.href = session.url;
  } catch (error) {
    button.disabled = false;
    say("Checkout isn't wired up yet — " + error.message + ".");
    console.error("[llama] checkout failed:", error);
  }
});
