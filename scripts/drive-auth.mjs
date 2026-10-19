// One-time OAuth desktop flow that prints a refresh token for .env (GOOGLE_OAUTH_REFRESH_TOKEN).
// Needs GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET of a "Desktop app" OAuth client.
// Run: node scripts/drive-auth.mjs   then sign in with the account that owns the folder.
import http from "node:http";
import { exec } from "node:child_process";

const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET first (export them or prefix the command)");
  process.exit(1);
}
const scope = "https://www.googleapis.com/auth/drive.readonly";

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://127.0.0.1");
  const code = url.searchParams.get("code");
  if (!code) { res.writeHead(404).end(); return; }
  const redirect = `http://127.0.0.1:${server.address().port}/`;
  const body = new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirect, grant_type: "authorization_code" });
  const token = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body }).then((r) => r.json());
  if (!token.refresh_token) {
    res.end("No refresh token returned. Revoke OFD at https://myaccount.google.com/permissions and run again.");
    console.error("no refresh_token in response:", token);
  } else {
    res.end("Done. You can close this tab and go back to the terminal.");
    console.log("\nAdd this to .env:\n");
    console.log(`GOOGLE_OAUTH_CLIENT_ID=${clientId}\nGOOGLE_OAUTH_CLIENT_SECRET=${clientSecret}\nGOOGLE_OAUTH_REFRESH_TOKEN=${token.refresh_token}\n`);
  }
  server.close();
});

server.listen(0, "127.0.0.1", () => {
  const redirect = `http://127.0.0.1:${server.address().port}/`;
  const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  auth.search = new URLSearchParams({ client_id: clientId, redirect_uri: redirect, response_type: "code", scope, access_type: "offline", prompt: "consent" }).toString();
  console.log("Open this URL and sign in with the account that owns the folder:\n\n" + auth.href + "\n");
  exec(`${process.platform === "darwin" ? "open" : "xdg-open"} "${auth.href}"`, () => {});
});
