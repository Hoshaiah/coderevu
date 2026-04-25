---
slug: session-fixation-oauth-callback
track: php
orderIndex: 45
title: OAuth Callback Skips State Validation
difficulty: medium
tags:
  - sessions
  - security
  - oauth
language: php
---

## Context

The OAuth 2.0 callback handler lives at `auth/oauth_callback.php`. When a user clicks "Sign in with Provider", `auth/oauth_start.php` redirects them to the provider with a `state` parameter, then this file handles the return trip. The state parameter is supposed to prevent CSRF attacks against the OAuth flow.

A security audit found that the `state` parameter is generated and stored in the session at the start of the flow, but on the callback it is only logged — never validated against the stored value. An attacker who tricks a victim into visiting a crafted callback URL can complete the OAuth flow on the victim's behalf, binding the attacker's provider account to the victim's session (or vice versa).

## Buggy code

```php
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

// Log state for debugging (but never actually check it)
error_log('OAuth state received: ' . $state);

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

$_SESSION['user_id']    = $profile['id'];
$_SESSION['user_email'] = $profile['email'];

session_regenerate_id(true);
header('Location: /dashboard.php');
exit;
```
