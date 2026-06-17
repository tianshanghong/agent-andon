/**
 * Web Push (RFC 8291 + VAPID) unit tests. The crypto is checked against the
 * RFC 8291 §5 gold-standard vector and round-tripped (GCM-authenticated), so we
 * know a real browser/push-service will decrypt our output — without needing a
 * live endpoint. The notifier behaviour mirrors the desktop alerter's discipline.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import * as crypto from "crypto";
import * as os from "os";
import * as path from "path";
import {
  encryptPayload,
  generateVapidKeys,
  vapidAuthHeader,
  isValidSubscription,
  PushHub,
} from "../src/push";
import type { Session } from "../src/types";

const b = (s: string) => Buffer.from(s, "base64url");

// ── RFC 8291 §5 "Push Message Encryption Example" ────────────────────────────
const RX_PRIV = b("q1dXpw3UpT5VOmu_cf_v6ih07Aems3njxI-JWgLcM94");
const RX_PUB = "BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4";
const AUTH = "BTBZMqHH6r4Tts7J_aSIgg";
const AS_PRIV = b("yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw");
const AS_PUB = b("BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8");
const SALT = b("DGv6ra1nlYgDCS1FRnbzlw");
const PLAINTEXT = "When I grow up, I want to be a watermelon";
const RFC_BODY = b(
  "DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27ml" +
    "mlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPT" +
    "pK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN",
);

/** A from-scratch RFC-8291 decryptor (test side) — independent of the encrypt path. */
function decrypt(body: Buffer, uaPriv: Buffer, uaPub: Buffer, auth: Buffer): string {
  const hk = (salt: Buffer, ikm: Buffer, info: string, len: number) =>
    Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from(info, "utf8"), len));
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const asPub = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  const ec = crypto.createECDH("prime256v1");
  ec.setPrivateKey(uaPriv);
  const secret = ec.computeSecret(asPub);
  const ikm = Buffer.from(
    crypto.hkdfSync("sha256", secret, auth, Buffer.concat([Buffer.from("WebPush: info\0", "utf8"), uaPub, asPub]), 32),
  );
  const cek = hk(salt, ikm, "Content-Encoding: aes128gcm\0", 16);
  const nonce = hk(salt, ikm, "Content-Encoding: nonce\0", 12);
  const tag = ct.subarray(ct.length - 16);
  const data = ct.subarray(0, ct.length - 16);
  const d = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(tag);
  const rec = Buffer.concat([d.update(data), d.final()]);
  let end = rec.length;
  while (end > 0 && rec[end - 1] === 0) end--; // strip 0x00 padding
  if (rec[end - 1] === 2) end--; // drop the last-record delimiter
  return rec.subarray(0, end).toString("utf8");
}

const sub = { endpoint: "https://web.push.apple.com/q/abc", keys: { p256dh: RX_PUB, auth: AUTH } };

test("push: decrypts the RFC 8291 §5 gold-standard ciphertext", () => {
  assert.equal(decrypt(RFC_BODY, RX_PRIV, b(RX_PUB), b(AUTH)), PLAINTEXT);
});

test("push: our encrypt's header matches the RFC vector byte-for-byte", () => {
  const out = encryptPayload(sub, Buffer.from(PLAINTEXT), { asPrivate: AS_PRIV, asPublic: AS_PUB, salt: SALT });
  // salt | rs | idlen | as_public = first 86 bytes
  assert.ok(out.subarray(0, 86).equals(RFC_BODY.subarray(0, 86)));
});

test("push: round-trips our own encryption (GCM-authenticated)", () => {
  const msg = "auth-service needs you";
  const enc = encryptPayload(sub, Buffer.from(msg)); // fresh random ephemeral + salt
  assert.equal(decrypt(enc, RX_PRIV, b(RX_PUB), b(AUTH)), msg);
});

test("push: a tampered ciphertext fails authentication (no silent accept)", () => {
  const enc = encryptPayload(sub, Buffer.from("hi"));
  enc[enc.length - 1] ^= 0xff; // flip a tag byte
  assert.throws(() => decrypt(enc, RX_PRIV, b(RX_PUB), b(AUTH)));
});

test("push: VAPID Authorization is a valid ES256 JWT under the public key", () => {
  const vk = generateVapidKeys();
  const hdr = vapidAuthHeader("https://web.push.apple.com/abc", "mailto:x@y.z", vk);
  const t = hdr.match(/t=([^,]+)/)![1]!;
  assert.equal(hdr.includes(`k=${vk.publicKey}`), true);
  const [h, p, s] = t.split(".");
  const pub = b(vk.publicKey);
  const jwk = { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33, 65).toString("base64url") };
  const ok = crypto.verify(
    "sha256",
    Buffer.from(`${h}.${p}`),
    { key: crypto.createPublicKey({ format: "jwk", key: jwk }), dsaEncoding: "ieee-p1363" },
    b(s!),
  );
  assert.equal(ok, true);
  const claims = JSON.parse(Buffer.from(p!, "base64url").toString());
  assert.equal(claims.aud, "https://web.push.apple.com"); // origin only, not the path
});

test("push: isValidSubscription accepts real push hosts, rejects junk + SSRF endpoints", () => {
  assert.equal(isValidSubscription(sub), true); // Apple
  assert.equal(isValidSubscription({ endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: RX_PUB, auth: AUTH } }), true); // Google
  assert.equal(isValidSubscription(null), false);
  assert.equal(isValidSubscription({ endpoint: "not a url", keys: { p256dh: RX_PUB, auth: AUTH } }), false);
  assert.equal(isValidSubscription({ endpoint: "https://web.push.apple.com/y", keys: { p256dh: "short", auth: AUTH } }), false); // bad key length
  assert.equal(isValidSubscription({ endpoint: "https://web.push.apple.com/y" }), false); // missing keys
  // SSRF guard: arbitrary / internal / non-https endpoints are rejected before storage
  assert.equal(isValidSubscription({ endpoint: "https://evil.example/x", keys: { p256dh: RX_PUB, auth: AUTH } }), false);
  assert.equal(isValidSubscription({ endpoint: "https://169.254.169.254/latest/meta-data", keys: { p256dh: RX_PUB, auth: AUTH } }), false);
  assert.equal(isValidSubscription({ endpoint: "http://web.push.apple.com/x", keys: { p256dh: RX_PUB, auth: AUTH } }), false);
});

const TMP = path.join(os.tmpdir(), "andon-push-test");
const sess = (id: string, state: Session["state"]): Session => ({ id, agent: "claude", state, title: id, message: "secret code", pending: 0, updated_at: 0 });

test("push: notifier fires only on needs-you/stuck transitions, never done/working", () => {
  const hub = new PushHub({ dataDir: TMP });
  hub.add({ endpoint: "https://web.push.apple.com/z", keys: { p256dh: RX_PUB, auth: AUTH } });
  const sent: Array<{ title: string; body: string }> = [];
  hub.send = async (s, body) => {
    sent.push({ title: "", body: "" }); // record the call; body is ciphertext
    void s;
    void body;
    return { status: 200 };
  };
  const notify = hub.notifier("http://board");

  notify([sess("a", "working"), sess("b", "working")]); // prime
  assert.equal(sent.length, 0);
  notify([sess("a", "waiting"), sess("b", "working")]); // a → waiting: push
  assert.equal(sent.length, 1);
  notify([sess("a", "waiting"), sess("b", "error")]); // b → error (different id, no cooldown): push
  assert.equal(sent.length, 2);
  notify([sess("a", "waiting"), sess("b", "error")]); // no transitions: no push
  assert.equal(sent.length, 2);
  notify([sess("a", "done"), sess("b", "error")]); // a → done: phones never fire on done
  assert.equal(sent.length, 2);
});

test("push: the encrypted body never contains the agent's message text", () => {
  // privacy: only the coarse state + title go out, never s.message ("secret code")
  const hub = new PushHub({ dataDir: TMP });
  let captured: Buffer | null = null;
  hub.add({ endpoint: "https://web.push.apple.com/z", keys: { p256dh: RX_PUB, auth: AUTH } });
  hub.send = async (_s, body) => {
    captured = body;
    return { status: 200 };
  };
  const notify = hub.notifier();
  notify([sess("checkout-api", "working")]);
  notify([sess("checkout-api", "error")]);
  assert.ok(captured, "a push was sent");
  // decrypt and confirm the title is present but the message is not
  const text = decrypt(captured!, RX_PRIV, b(RX_PUB), b(AUTH));
  assert.equal(text.includes("checkout-api"), true);
  assert.equal(text.includes("secret code"), false);
});
