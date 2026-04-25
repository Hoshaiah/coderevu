## Reference solution

```javascript
// ------------------------------------------------------------------------
// ANSWER — Session Cookie Not Sent on Fetch
// ------------------------------------------------------------------------

const BASE_URL = "https://api.example.com";

async function apiFetch(path, options = {}) {
  const url = `${BASE_URL}${path}`;

  // CHANGE 2: destructure headers out of options so the spread below doesn't overwrite the merged headers object
  const { headers: optionHeaders, ...restOptions } = options;

  const response = await fetch(url, {
    // CHANGE 1: add credentials: 'include' so the browser attaches the session cookie on cross-origin requests
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...optionHeaders,
    },
    // CHANGE 2: spread restOptions (which no longer contains a headers key) so it cannot silently overwrite the merged headers
    ...restOptions,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message);
  }

  return response.json();
}

export async function getUser(userId) {
  return apiFetch(`/users/${userId}`);
}

export async function updateUser(userId, data) {
  return apiFetch(`/users/${userId}`, {
    method: "PUT",
    body: JSON.stringify(data),
  });
}
```

## Explanation

### Issue 1: Missing `credentials: 'include'` on cross-origin fetch

**Problem:** Every API request arrives at the Express server without a `Cookie` header, even though the session cookie is visible in DevTools. The server treats each request as unauthenticated and returns 401, which users experience as being randomly logged out.

**Fix:** Add `credentials: "include"` as a top-level property inside the `fetch` options object in `apiFetch`, as shown at the CHANGE 1 site.

**Explanation:** By default, the Fetch API uses `credentials: 'same-origin'`, which only attaches cookies when the request URL's origin matches the page's origin. Here the frontend is on `https://app.example.com` and the API is on `https://api.example.com` — a different origin — so the browser silently drops all cookies. Setting `credentials: 'include'` tells the browser to attach cookies on cross-origin requests too. This only works when the server also responds with `Access-Control-Allow-Credentials: true` and a specific (non-wildcard) `Access-Control-Allow-Origin` header, which the backend team confirmed is already configured. A related pitfall: if you later add a wildcard `Access-Control-Allow-Origin: *` to the server for any route, the browser will block credentialed responses even with `credentials: 'include'` set on the client.

---

### Issue 2: `...options` spread silently overwrites merged headers

**Problem:** When a caller passes a `headers` property inside `options` (for example, to add an `Authorization` header), the spread `...options` at the end of the fetch options object replaces the entire merged `headers` object that was built just above it. `Content-Type` and any other pre-merged headers disappear. In the current callers this is masked because none of them pass `headers`, but the bug would surface the moment any caller does.

**Fix:** At the CHANGE 2 sites, destructure `options` into `optionHeaders` and `restOptions` before building the fetch config. Spread `optionHeaders` inside the `headers` block and spread `restOptions` (which no longer has a `headers` key) at the top level.

**Explanation:** JavaScript object spread is positional: a later key with the same name wins. Writing `{ headers: { ...merged }, ...options }` means if `options` contains `{ headers: { 'X-Custom': '1' } }`, the whole `headers` property is replaced by `options.headers`, throwing away `Content-Type`. Destructuring `options` into its `headers` portion and the remainder keeps the merge intentional and explicit. The server then rejects requests missing `Content-Type: application/json` on PUT/POST bodies, which would show up as 400 errors that are hard to trace back to a spread-order issue in a shared utility function.
