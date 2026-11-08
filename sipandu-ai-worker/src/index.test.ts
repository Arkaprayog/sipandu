import test from "node:test";
import assert from "node:assert/strict";
import { decodeFirebaseClaims } from "./index";

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
