// Delivers the non-secret VAPID public key to an authenticated OmniRelay staff session.
// The private key never leaves the dispatcher environment.
Deno.serve(() => {
  const publicKey = Deno.env.get("WEB_PUSH_VAPID_PUBLIC_KEY");
  if (!publicKey) {
    return Response.json({ error: "Push alerts are not configured." }, { status: 503 });
  }

  return Response.json({ publicKey }, {
    headers: { "Cache-Control": "no-store" },
  });
});
