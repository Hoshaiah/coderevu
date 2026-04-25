## Reference solution

```php
// ------------------------------------------------------------------------
// ANSWER — OAuth Callback Skips State Validation
// ------------------------------------------------------------------------

<?php
// auth/oauth_callback.php

session_start();

$code  = $_GET['code']  ?? '';
$state = $_GET['state'] ?? '';

if (empty($code)) {
    http_response_code(400);
    echo 'Missing authorization code';
    exit;
}

// CHANGE 3: Reject the request immediately if state is absent, preventing an empty-state bypass.
if (empty($state)) {
    http_response_code(400);
    echo 'Missing state parameter';
    exit;
}

// CHANGE 1: Validate the received state against the value stored in the session when the flow started; abort with 403 if they do not match, preventing CSRF.
if (!isset($_SESSION['oauth_state']) || !hash_equals($_SESSION['oauth_state'], $state)) {
    http_response_code(403);
    echo 'Invalid state parameter';
    exit;
}
unset($_SESSION['oauth_state']);

// Exchange code for access token
$response = file_get_contents('https://provider.example.com/token?' . http_build_query([
    'client_id'     => 'CLIENT_ID',
    'client_secret' => 'CLIENT_SECRET',
    'code'          => $code,
    'grant_type'    => 'authorization_code',
    'redirect_uri'  => 'https://app.example.com/auth/oauth_callback.php',
]));

$token_data = json_decode($response, true);
$access_token = $token_data['access_token'] ?? '';

// Fetch user profile
$profile = json_decode(file_get_contents(
    'https://provider.example.com/userinfo',
    false,
    stream_context_create(['http' => ['header' => 'Authorization: Bearer ' . $access_token]])
), true);

// CHANGE 2: Regenerate the session ID before writing identity data so the pre-login session ID cannot be used to hijack the authenticated session.
session_regenerate_id(true);

$_SESSION['user_id']    = $profile['id'];
$_SESSION['user_email'] = $profile['email'];

header('Location: /dashboard.php');
exit;
```

## Explanation

### Issue 1: Missing CSRF State Validation

**Problem:** The original code calls `error_log` with the received `state` value and does nothing else with it. An attacker can craft a callback URL containing a valid authorization `code` obtained from the provider under the attacker's own account, paste it into a link, and trick the victim into clicking it. The victim's session then gets the attacker's provider identity written into it without any error.

**Fix:** After the empty-state guard (CHANGE 3), a `hash_equals` comparison is added between `$_SESSION['oauth_state']` (set by `oauth_start.php`) and the `$state` value from the query string. If they differ or the session value is absent, the handler returns HTTP 403 and exits. The stored value is then `unset` so it cannot be replayed.

**Explanation:** The `state` parameter works as a one-time token tied to a specific user session. `oauth_start.php` generates a random value, stores it in `$_SESSION['oauth_state']`, and passes it to the provider. When the provider redirects back, only the legitimate browser that started the flow will have that session value. Without the comparison, any request carrying a valid `code` — regardless of who initiated the flow — succeeds. `hash_equals` is used instead of `===` to prevent timing-based side-channel leaks on the comparison. After a successful check, `unset` ensures the same state token cannot be used a second time in a replay attempt.

---

### Issue 2: Session Regeneration After Identity Write

**Problem:** The original code writes `$_SESSION['user_id']` and `$_SESSION['user_email']` and only then calls `session_regenerate_id(true)`. The sensitive identity data is briefly associated with the old, pre-authentication session ID. If an attacker obtained the session ID before authentication completed (e.g., via network sniffing on a non-TLS hop, or a session-fixation setup), they can use the old ID to read the now-authenticated session before regeneration occurs.

**Fix:** `session_regenerate_id(true)` is moved to before the two `$_SESSION` assignment lines (CHANGE 2). The `true` argument deletes the old session file on disk, so the previous ID becomes immediately invalid.

**Explanation:** Session fixation works by planting a known session ID in the victim's browser before login. When the application promotes that session to an authenticated state without changing its ID, the attacker — who already knows the ID — gains access. Regenerating the ID before writing identity data means the window in which the old ID is privileged is zero. The `true` parameter to `session_regenerate_id` is critical; without it, PHP deletes the old session from memory but may leave the file on disk accessible to a concurrent request.

---

### Issue 3: Empty State Silently Accepted

**Problem:** If the `state` parameter is absent from the callback URL (stripped by a proxy, omitted by a misconfigured provider, or deliberately removed by an attacker), `$state` is an empty string. The state-comparison check in CHANGE 1 would still trigger because `$_SESSION['oauth_state']` is non-empty, but defensive early rejection is cleaner and surfaces the missing parameter explicitly.

**Fix:** An `empty($state)` guard is added immediately after the `$code` check (CHANGE 3). If `$state` is absent or blank, the handler returns HTTP 400 and exits before reaching any token exchange logic.

**Explanation:** The `hash_equals` check alone would catch this case only if `$_SESSION['oauth_state']` is set, but there is an edge case: if the session itself has expired or was never started correctly, `$_SESSION['oauth_state']` would also be absent, meaning both sides of the comparison are empty strings and `hash_equals('', '')` returns `true`, bypassing the CSRF check entirely. The explicit empty-state guard ensures the handler never reaches `hash_equals` with a blank incoming value, closing that edge case before it can be exploited.
