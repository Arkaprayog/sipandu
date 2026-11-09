import test from "node:test";
import assert from "node:assert/strict";
import { decodeFirebaseClaims, containsSensitivePrompt, containsSensitiveHistory, verifyFirebaseIdToken, isActiveFirebaseAccount } from "./index";

function makeToken(payload: Record<string, unknown>): string {
  const encode = (value: unknown) => btoa(JSON.stringify(value)).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
  return encode({ alg: "none", typ: "JWT" }) + "." + encode(payload) + ".signature";
}

test("accepts only supported current SIPANDU staff role claims as query-scope hints", () => {
  const now = 1_800_000_000;
  const base = {
    sub: "staff-uid",
    aud: "sipandu-project",
    iss: "https://securetoken.google.com/sipandu-project",
    exp: now + 3600,
  };
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "owner" }), "sipandu-project", now)?.role, "owner");
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "supervisor" }), "sipandu-project", now)?.role, "supervisor");
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "pendamping" }), "sipandu-project", now)?.role, "pendamping");
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "public" }), "sipandu-project", now), null);
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "owner", exp: now - 1 }), "sipandu-project", now), null);
  assert.equal(decodeFirebaseClaims(makeToken({ ...base, role: "owner" }), "other-project", now), null);
});

test("rejects common identity and clinical-information patterns in user prompts", () => {
  assert.equal(containsSensitivePrompt("Tolong cari NIK 1234567890123456"), true);
  assert.equal(containsSensitivePrompt("Nomor HP 081234567890"), true);
  assert.equal(containsSensitivePrompt("Tampilkan nama lengkap PPKS"), true);
  assert.equal(containsSensitivePrompt("Analisis viral load seseorang"), true);
  assert.equal(containsSensitivePrompt("Analisis jumlah permintaan bantuan nutrisi per wilayah"), false);
});

function encodeBase64Url(value: string): string {
  return btoa(value).replaceAll("=", "").replaceAll("+", "-").replaceAll("/", "_");
}

test("verifies Firebase ID-token RS256 signature and all required claims", async () => {
  const projectId = "sipandu-project";
  const now = 1_800_000_000;
  const keyPair = await crypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"],
  );
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  const key = { ...publicKey, kid: "test-kid", alg: "RS256" };
  const header = encodeBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "test-kid" }));
  const payloadObject = {
    sub: "staff-uid",
    aud: projectId,
    iss: "https://securetoken.google.com/" + projectId,
    exp: now + 3600,
    iat: now - 60,
    auth_time: now - 120,
    role: "pendamping",
  };
  const payload = encodeBase64Url(JSON.stringify(payloadObject));
  const message = header + "." + payload;
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keyPair.privateKey, new TextEncoder().encode(message));
  const signatureText = encodeBase64Url(String.fromCharCode(...new Uint8Array(signature)));
  const token = message + "." + signatureText;

  const claims = await verifyFirebaseIdToken(token, projectId, [key], now);
  assert.equal(claims?.sub, "staff-uid");
  assert.equal(claims?.role, "pendamping");

  const alteredPayload = encodeBase64Url(JSON.stringify({ ...payloadObject, role: "supervisor" }));
  assert.equal(await verifyFirebaseIdToken(header + "." + alteredPayload + "." + signatureText, projectId, [key], now), null);
  assert.equal(await verifyFirebaseIdToken(token, projectId, [], now), null);
  assert.equal(await verifyFirebaseIdToken(token, "different-project", [key], now), null);
  assert.equal(await verifyFirebaseIdToken(token, projectId, [key], now + 4000), null);
});

test("rejects disabled, mismatched, or revoked Firebase accounts", () => {
  const claims = {
    sub: "staff-uid",
    aud: "sipandu-project",
    iss: "https://securetoken.google.com/sipandu-project",
    exp: 1_800_003_600,
    iat: 1_800_000_000,
    auth_time: 1_799_999_900,
    role: "pendamping" as const,
  };
  assert.equal(isActiveFirebaseAccount({ localId: "staff-uid", disabled: false, validSince: "1799999800" }, claims), true);
  assert.equal(isActiveFirebaseAccount({ localId: "another-uid", disabled: false }, claims), false);
  assert.equal(isActiveFirebaseAccount({ localId: "staff-uid", disabled: true }, claims), false);
  assert.equal(isActiveFirebaseAccount({ localId: "staff-uid", validSince: "1800000001" }, claims), false);
  assert.equal(isActiveFirebaseAccount({ localId: "staff-uid", validSince: "invalid" }, claims), false);
  assert.equal(isActiveFirebaseAccount(undefined, claims), false);
});

test("blocks sensitive information in the bounded user conversation history", () => {
  assert.equal(containsSensitiveHistory([
    { role: "user", text: "Analisis status layanan PPKS" },
    { role: "user", text: "NIK 1234567890123456" },
  ]), true);
  assert.equal(containsSensitiveHistory([
    { role: "user", text: "Analisis jumlah layanan per wilayah" },
    { role: "model", text: "Nama lengkap PPKS adalah contoh" },
  ]), false);
});
