## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — SSRF via User-Supplied URL
// ------------------------------------------------------------------------

<?php
// api/preview.php

header('Content-Type: application/json');

$url = $_GET['url'] ?? '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'url required']);
    exit;
}

// CHANGE 1: Validate scheme and resolve the hostname to an IP, then reject private/loopback/link-local ranges to prevent SSRF.
$parsed = parse_url($url);
if (!$parsed || !in_array($parsed['scheme'] ?? '', ['http', 'https'], true)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid url']);
    exit;
}
$host = $parsed['host'] ?? '';
if (empty($host)) {
    http_response_code(400);
    echo json_encode(['error' => 'invalid url']);
    exit;
}
$ip = gethostbyname($host);
if ($ip === $host && !filter_var($ip, FILTER_VALIDATE_IP)) {
    http_response_code(400);
    echo json_encode(['error' => 'unresolvable host']);
    exit;
}
function isPrivateOrReservedIp(string $ip): bool {
    // Covers loopback, link-local (169.254.x.x), RFC-1918 private, and IPv6 equivalents.
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) === false;
}
if (isPrivateOrReservedIp($ip)) {
    http_response_code(400);
    echo json_encode(['error' => 'forbidden url']);
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
// CHANGE 2: Disable CURLOPT_FOLLOWLOCATION entirely so redirects to internal addresses are not followed; remove CURLOPT_MAXREDIRS as it is now irrelevant.
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
// CHANGE 3: Fetch headers alongside the body so we can reject non-HTML content types before returning anything to the caller.
curl_setopt($ch, CURLOPT_HEADER, true);
$response = curl_exec($ch);
$headerSize = curl_getinfo($ch, CURLINFO_HEADER_SIZE);
$contentType = curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
curl_close($ch);

// CHANGE 3 (continued): Reject responses whose Content-Type is not HTML to avoid leaking JSON credential payloads or other non-HTML data.
if (!$response || stripos($contentType, 'text/html') === false) {
    http_response_code(422);
    echo json_encode(['error' => 'url did not return an html page']);
    exit;
}

$body = substr($response, $headerSize);
preg_match('/<title>(.*?)<\/title>/is', $body, $m);
$title = $m[1] ?? 'No title';

echo json_encode(['title' => htmlspecialchars($title)]);
```

## Explanation

### Issue 1: No SSRF validation on supplied URL

**Problem:** The code passes the raw user-supplied URL directly to `curl_init` without checking the scheme or resolving the destination host. An attacker submits `http://169.254.169.254/latest/meta-data/iam/security-credentials/` and cURL happily fetches it, returning live AWS IAM credentials. `http://localhost/admin` and `http://10.0.0.1/` are equally reachable.

**Fix:** After `parse_url`, the hostname is resolved to an IP with `gethostbyname`, then `filter_var` with `FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE` rejects loopback, link-local (169.254.x.x), and all RFC-1918 private ranges. Only `http` and `https` schemes are whitelisted. This block is added before `curl_init`.

**Explanation:** SSRF works because the server is the one making the request, so it has access to the internal network the browser does not. The fix resolves the hostname at validation time rather than trusting the string form, which catches hostnames like `internal.corp` that DNS resolves to `10.x.x.x`. One important pitfall: if the server's DNS is attacker-influenced (DNS rebinding), the resolved IP at validation time could differ from the IP used during the actual TCP connection. Disabling redirects in CHANGE 2 limits that window, and for higher-assurance environments a TCP-level firewall rule is a complementary control.

---

### Issue 2: Open redirect following bypasses SSRF check

**Problem:** `CURLOPT_FOLLOWLOCATION` is set to `true` with up to 10 redirects. Even if an upfront URL check is added, an attacker can register an external domain that redirects to `http://169.254.169.254/` and the check on the initial URL passes while cURL silently follows the chain to the internal target.

**Fix:** `CURLOPT_FOLLOWLOCATION` is changed to `false` and `CURLOPT_MAXREDIRS` is removed. The code no longer follows any redirects at all.

**Explanation:** cURL's redirect following is transparent — the caller only sees the final response body, not that the URL changed mid-flight. A 301 from a whitelisted external URL to an internal one completely defeats IP-range validation on the original URL. Disabling redirects means the caller gets back a 3xx status for any redirect, which `preg_match` on `<title>` will simply not match, producing "No title". For the link-preview use case this is acceptable; a link that immediately redirects still shows no title rather than leaking internal data.

---

### Issue 3: Non-HTML responses silently accepted

**Problem:** If a URL returns JSON, plain text, or binary data — such as the credential JSON from the AWS metadata service — the code runs `preg_match` looking for `<title>`, finds nothing, and returns `{"title":"No title"}`. That alone looks safe, but it means future code changes (e.g., logging `$body`) could accidentally expose the raw payload, and it provides no early signal that something suspicious was fetched.

**Fix:** `CURLOPT_HEADER` is set to `true` and `curl_getinfo(CURLINFO_CONTENT_TYPE)` is checked after `curl_exec`. If the `Content-Type` does not contain `text/html`, the endpoint returns a 422 error and exits before touching `$body`.

**Explanation:** Defense in depth means even a bypass of the IP check (e.g., a newly-added private subnet the filter does not know about) should not silently succeed. HTML pages from legitimate sites declare `text/html`; the AWS metadata API returns `text/plain`. Rejecting non-HTML responses makes the check explicit and auditable. It also prevents the function from being abused as a generic TCP probe by observing whether a port returns HTML or not.
