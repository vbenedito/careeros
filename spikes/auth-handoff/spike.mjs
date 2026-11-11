// Spike for #10 / ADR-0003: can the dashboard hand the extension its own Supabase session
// through a single-use token, without opening email/password sign-up?
//
// Runs against a local Supabase stack (CI). Prints a JSON report and exits non-zero only on
// unexpected errors; the findings themselves are evaluated in docs/history/spikes/0003-auth-handoff.md.
//
// Env: SCENARIO, API_URL, PUBLISHABLE_KEY, SECRET_KEY, MAILPIT_URL, DB_CONTAINER, OTP_EXPIRY_S
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const env = (name) => {
  const value = process.env[name];
  if (!value) throw new Error(`missing env ${name}`);
  return value;
};

const API_URL = env("API_URL");
const PUBLISHABLE_KEY = env("PUBLISHABLE_KEY");
const SECRET_KEY = env("SECRET_KEY");
const MAILPIT_URL = env("MAILPIT_URL");
const DB_CONTAINER = env("DB_CONTAINER");
const OTP_EXPIRY_S = Number(process.env.OTP_EXPIRY_S ?? "0");

const report = { scenario: env("SCENARIO"), checks: {} };
const record = (name, value) => {
  report.checks[name] = value;
};

const memoryStorage = () => {
  const data = new Map();
  return {
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => data.set(k, v),
    removeItem: (k) => data.delete(k),
  };
};
/** A client with its own isolated session storage, like a separate app (dashboard / extension). */
const newClient = (key = PUBLISHABLE_KEY) =>
  createClient(API_URL, key, {
    auth: { autoRefreshToken: false, persistSession: true, storage: memoryStorage() },
  });

const admin = createClient(API_URL, SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const sql = (query) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      DB_CONTAINER,
      "psql",
      "-U",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ],
    { encoding: "utf8" },
  ).trim();

const mailCount = async () => {
  const res = await fetch(`${MAILPIT_URL}/api/v1/messages?limit=1`);
  if (!res.ok) return `mailpit ${res.status}`;
  return (await res.json()).total;
};

const decodeJwt = (token) => JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString());

/** Simulates a user created by GitHub OAuth (provider "github"), inserted directly in SQL so the
 *  before-user-created hook (scenario C) is not involved. */
function createOAuthUser(email) {
  const id = randomUUID();
  sql(`insert into auth.users (instance_id, id, aud, role, email, email_confirmed_at,
         raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
         confirmation_token, recovery_token, email_change_token_new, email_change,
         email_change_token_current, phone_change, phone_change_token, reauthentication_token)
       values ('00000000-0000-0000-0000-000000000000', '${id}', 'authenticated', 'authenticated',
         '${email}', now(), '{"provider":"github","providers":["github"]}', '{}', now(), now(),
         '', '', '', '', '', '', '', '');
       insert into auth.identities (id, user_id, provider_id, provider, identity_data, created_at, updated_at, last_sign_in_at)
       values (gen_random_uuid(), '${id}', '${id}', 'github',
         '{"sub":"${id}","email":"${email}"}', now(), now(), now());`);
  return id;
}

/** What the dashboard server will do: mint a single-use token for the signed-in user. */
async function mintToken(email) {
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error) return { error: `${error.status ?? ""} ${error.message}` };
  return { tokenHash: data.properties.hashed_token };
}

async function main() {
  const email = `spike-${Date.now()}@example.test`;
  const userId = createOAuthUser(email);
  record("oauthUserCreated", Boolean(userId));

  // 1. "Dashboard" session (in production this comes from OAuth; here from a token too).
  const dashboard = newClient();
  const t1 = await mintToken(email);
  record("generateLink", t1.error ?? "ok");
  if (t1.error) return;
  const mailsBefore = await mailCount();
  const d = await dashboard.auth.verifyOtp({ token_hash: t1.tokenHash, type: "magiclink" });
  record("dashboardSession", d.error ? d.error.message : "ok");
  if (d.error) return;

  // 2. Extension handoff: new token, exchanged by an independent client.
  const t2 = await mintToken(email);
  const mailsAfter = await mailCount();
  record(
    "generateLinkSendsNoEmail",
    mailsBefore === mailsAfter ? "ok" : `${mailsBefore} -> ${mailsAfter}`,
  );
  const extension = newClient();
  const e = await extension.auth.verifyOtp({ token_hash: t2.tokenHash, type: "magiclink" });
  record("extensionSession", e.error ? e.error.message : "ok");
  if (e.error) return;

  const dSid = decodeJwt(d.data.session.access_token).session_id;
  const eSid = decodeJwt(e.data.session.access_token).session_id;
  record(
    "independentSessions",
    dSid && eSid && dSid !== eSid ? "ok" : `same or missing: ${dSid} ${eSid}`,
  );
  record("sameUser", e.data.user.id === userId ? "ok" : "different user!");
  record("tokenLength", t2.tokenHash.length);

  // 3. Single use: replaying the same token hash must fail.
  const replay = await newClient().auth.verifyOtp({ token_hash: t2.tokenHash, type: "magiclink" });
  record("singleUse", replay.error ? `ok (${replay.error.message})` : "REPLAY SUCCEEDED");

  // 4. type "email" also accepted? (supabase-js docs only show type "email" with token_hash)
  const t3 = await mintToken(email);
  const viaEmailType = await newClient().auth.verifyOtp({
    token_hash: t3.tokenHash,
    type: "email",
  });
  record("typeEmailWorks", viaEmailType.error ? viaEmailType.error.message : "ok");

  // 5. Independent refresh: rotate each session twice, then both must still work.
  for (let i = 0; i < 2; i++) {
    const rd = await dashboard.auth.refreshSession();
    const re = await extension.auth.refreshSession();
    if (rd.error || re.error) {
      record("independentRefresh", `${rd.error?.message ?? ""} ${re.error?.message ?? ""}`);
      break;
    }
  }
  const ud = await dashboard.auth.getUser();
  const ue = await extension.auth.getUser();
  report.checks.independentRefresh ??=
    !ud.error && !ue.error ? "ok" : `${ud.error?.message} ${ue.error?.message}`;

  // 6. Expiry: an unused token older than OTP_EXPIRY_S must fail.
  if (OTP_EXPIRY_S > 0) {
    const t4 = await mintToken(email);
    await new Promise((r) => setTimeout(r, (OTP_EXPIRY_S + 3) * 1000));
    const late = await newClient().auth.verifyOtp({ token_hash: t4.tokenHash, type: "magiclink" });
    record(
      `expiresAfter${OTP_EXPIRY_S}s`,
      late.error ? `ok (${late.error.message})` : "STILL VALID",
    );
  }

  // 7. Extension local sign-out must not affect the dashboard (AUTH-04/AUTH-12).
  await extension.auth.signOut({ scope: "local" });
  const afterExtSignOut = await dashboard.auth.refreshSession();
  record(
    "extensionSignOutKeepsDashboard",
    afterExtSignOut.error ? afterExtSignOut.error.message : "ok",
  );

  // 8. "Sign out of all devices" from the dashboard revokes other sessions (AUTH-12a).
  const ext2 = newClient();
  const t5 = await mintToken(email);
  await ext2.auth.verifyOtp({ token_hash: t5.tokenHash, type: "magiclink" });
  await dashboard.auth.signOut({ scope: "global" });
  const ext2Refresh = await ext2.auth.refreshSession();
  record(
    "globalSignOutRevokesExtension",
    ext2Refresh.error ? `ok (${ext2Refresh.error.message})` : "STILL VALID",
  );

  // 9. Is public email/password sign-up open? (AUTH-01 allows only Google/GitHub)
  const attacker = newClient();
  const signUp = await attacker.auth.signUp({
    email: `attacker-${Date.now()}@example.test`,
    password: "Sp1ke-Passw0rd!",
  });
  record("publicEmailSignUp", signUp.error ? `blocked (${signUp.error.message})` : "OPEN");

  // 10. Can anyone request a magic link e-mail for an existing user? (passwordless login path)
  const before = await mailCount();
  const otp = await attacker.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  const after = await mailCount();
  record(
    "publicMagicLinkForExistingUser",
    otp.error ? `blocked (${otp.error.message})` : `sent (${before} -> ${after})`,
  );
}

try {
  await main();
} catch (err) {
  report.fatal = String(err?.stack ?? err);
}
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.fatal) process.exit(1);
