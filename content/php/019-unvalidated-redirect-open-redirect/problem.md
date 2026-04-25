---
slug: unvalidated-redirect-open-redirect
track: php
orderIndex: 19
title: Unvalidated Host Header Redirect
difficulty: medium
tags:
  - security
  - open-redirect
  - headers
  - phishing
language: php
---

## Context

The file `sso/callback.php` is the landing page for a SAML single sign-on flow. After the identity provider posts back a valid assertion, the application logs the user in and redirects them to the URL they were originally trying to reach. That URL was stored in the session when the user was first bounced to the IdP.

A penetration tester demonstrated that the redirect destination can be manipulated to point to an attacker-controlled domain. The application's bug bounty program classifies open redirects as medium severity, but in the context of SSO the risk is higher: a successful phishing link looks like a legitimate company login URL, and the victim ends up on a malicious site immediately after completing real authentication — so they have no reason to be suspicious.

The developer who wrote this endpoint thought checking that the `return_to` path starts with `/` was sufficient. The tester showed it is not.

## Buggy code

```php
<?php
// sso/callback.php

session_start();

require_once __DIR__ . '/../lib/saml.php';

$assertion = saml_parse_response($_POST['SAMLResponse']);

if (!$assertion || !$assertion->isValid()) {
    http_response_code(400);
    exit('Invalid SAML response');
}

$_SESSION['user_id']    = $assertion->getNameId();
$_SESSION['user_email'] = $assertion->getAttribute('email');
session_regenerate_id(true);

$returnTo = $_SESSION['return_to'] ?? '/';

// Developer comment: checked it starts with / so it can't be an external URL
if (!str_starts_with($returnTo, '/')) {
    $returnTo = '/';
}

unset($_SESSION['return_to']);

header('Location: ' . $returnTo);
exit;
```
