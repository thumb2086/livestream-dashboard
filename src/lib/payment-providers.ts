/**
 * Payment gateway signatures — ECPay (綠界), OPay (歐付寶) and PayPal IPN.
 *
 * Ported from LiveCore's `payment-providers.ts`. The CheckMacValue algorithm is
 * the part that cannot be reconstructed from the docs alone, because it inherits
 * .NET's `HttpUtility.UrlEncode` character table rather than RFC 3986. Getting it
 * subtly wrong means either every legitimate webhook is rejected, or forged ones
 * are accepted, so it is ported verbatim and covered by tests.
 */

import { createHash } from "node:crypto";

// ── ECPay / OPay CheckMacValue ───────────────────────────────────────────────

/**
 * `HttpUtility.UrlEncode` post-processing. .NET decodes these back out of
 * percent-encoding, so the string fed to SHA256 must contain the raw characters.
 */
const DOTNET_URL_DECODE_MAP: ReadonlyArray<[string, string]> = [
  ["%2d", "-"],
  ["%5f", "_"],
  ["%2e", "."],
  ["%21", "!"],
  ["%2a", "*"],
  ["%28", "("],
  ["%29", ")"],
  ["%20", "+"],
];

/**
 * `encodeURIComponent` leaves these two alone per RFC 3986, but the .NET table
 * still percent-encodes them, so they have to be patched in manually.
 */
const ECPAY_EXTRA_ENCODE_MAP: ReadonlyArray<[string, string]> = [
  ["~", "%7e"],
  ["'", "%27"],
];

/**
 * 1. drop CheckMacValue  2. sort keys case-insensitively  3. join `k=v` with `&`
 * 4. wrap in HashKey=…&…&HashIV=…  5. URL-encode  6. lowercase
 * 7. apply the .NET table  8. SHA256  9. uppercase
 */
export function computeCheckMacValue(params: Record<string, string>, hashKey: string, hashIv: string): string {
  const filtered = { ...params };
  delete filtered.CheckMacValue;

  const sorted = Object.keys(filtered).sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  const pairs = sorted.map((key) => `${key}=${filtered[key]}`).join("&");

  let encoded = encodeURIComponent(`HashKey=${hashKey}&${pairs}&HashIV=${hashIv}`).toLowerCase();
  for (const [search, replace] of DOTNET_URL_DECODE_MAP) encoded = encoded.replaceAll(search, replace);
  for (const [search, replace] of ECPAY_EXTRA_ENCODE_MAP) encoded = encoded.replaceAll(search, replace);

  return createHash("sha256").update(encoded).digest("hex").toUpperCase();
}

/**
 * Verifies a gateway callback. Any mismatch in amount, merchant, or order id
 * also invalidates the signature, because those fields are part of it.
 */
export function verifyCheckMacValue(params: Record<string, string>, hashKey: string, hashIv: string): boolean {
  const received = params.CheckMacValue;
  if (!received) return false;

  const expected = computeCheckMacValue(params, hashKey, hashIv);
  if (expected.length !== received.length) return false;

  // Constant-time compare: signature checks are the classic timing-oracle target.
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ received.charCodeAt(i);
  return diff === 0;
}

// ── PayPal IPN ───────────────────────────────────────────────────────────────

const IPN_VERIFY_PRODUCTION = "https://ipnpb.paypal.com/cgi-bin/webscr";
const IPN_VERIFY_SANDBOX = "https://ipnpb.sandbox.paypal.com/cgi-bin/webscr";

/** Posts the message back to PayPal with `cmd=_notify-validate` prepended. */
export async function verifyPayPalIpn(rawBody: string, options?: { sandbox?: boolean }): Promise<boolean> {
  const url = options?.sandbox ? IPN_VERIFY_SANDBOX : IPN_VERIFY_PRODUCTION;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `cmd=_notify-validate&${rawBody}`,
    });
    return (await res.text()).trim() === "VERIFIED";
  } catch {
    // Fail closed: an unreachable verifier is not a verified message.
    return false;
  }
}

// ── Shared ───────────────────────────────────────────────────────────────────

export type PaymentProvider = "ecpay" | "opay" | "paypal";

/**
 * Flattenes a form body. A repeated key arrives as an array; the gateway sends
 * the last value, so take that rather than stringifying to "a,b".
 */
export function normalizeFormBody(body: unknown): Record<string, string> {
  if (typeof body !== "object" || body === null) return {};

  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    out[key] = Array.isArray(value) ? String(value[value.length - 1]) : String(value ?? "");
  }
  return out;
}
