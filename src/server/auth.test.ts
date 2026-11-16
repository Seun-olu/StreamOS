import { describe, expect, test } from "vitest";
import { decodeSession, encodeSession, hashPassword, verifyPassword } from "./auth";

describe("local auth primitives", () => {
  test("password hashing round-trips and rejects wrong passwords", async () => {
    const h = await hashPassword("correct horse");
    expect(h).toMatch(/^scrypt\$/);
    expect(await verifyPassword("correct horse", h)).toBe(true);
    expect(await verifyPassword("wrong", h)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });

  test("sessions are signed and expire", () => {
    const t = encodeSession("u1", 1000);
    expect(decodeSession(t, 2000)).toBe("u1");
    expect(decodeSession(t, 1000 + 8 * 24 * 3600 * 1000)).toBeNull();
    const [payload, sig] = t.split(".");
    const forged = Buffer.from(JSON.stringify({ uid: "admin", exp: 9e15 })).toString("base64url");
    expect(decodeSession(`${forged}.${sig}`, 2000)).toBeNull();
    expect(decodeSession(`${payload}.x`, 2000)).toBeNull();
    expect(decodeSession(undefined)).toBeNull();
  });
});
