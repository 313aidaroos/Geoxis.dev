import test from "node:test";
import assert from "node:assert/strict";
import handler from "../api/config.js";

test("/api/config lists both master admins", () => {
  let body;
  handler({}, { statusCode: 0, setHeader() {}, end(b) { body = JSON.parse(b); }, status() { return this; } });
  assert.deepEqual(body.ownerEmails.sort(), ["alaidaroosawad@gmail.com", "awad@apixis.dev"]);
  assert.equal(body.ownerEmail, "awad@apixis.dev");
});
