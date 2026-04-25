---
slug: security-ssrf-http-fetch
track: php
orderIndex: 30
title: SSRF via User-Supplied URL
difficulty: hard
tags:
  - security
  - ssrf
  - input-validation
language: php
---

## Context

The endpoint `api/preview.php` accepts a URL from the client, fetches its HTML with cURL, and returns the page title — a feature used by the company's Slack-style internal chat to generate link previews. The URL is passed as a query parameter.

The security team's internal red team exercise found that an employee was able to hit `http://169.254.169.254/latest/meta-data/iam/security-credentials/` (the AWS instance metadata endpoint) by submitting that URL to the preview API, retrieving live IAM credentials. On-premise deployments are equally at risk via `http://localhost/admin`.

The team has already confirmed cURL is the only HTTP client used and that PHP's `allow_url_fopen` is off, ruling out `file_get_contents` as an attack vector here.

## Buggy code

```php
<?php
// api/preview.php

header('Content-Type: application/json');

$url = $_GET['url'] ?? '';

if (empty($url)) {
    http_response_code(400);
    echo json_encode(['error' => 'url required']);
    exit;
}

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
curl_setopt($ch, CURLOPT_MAXREDIRS, 10);
curl_setopt($ch, CURLOPT_TIMEOUT, 5);
$body = curl_exec($ch);
curl_close($ch);

preg_match('/<title>(.*?)<\/title>/is', $body, $m);
$title = $m[1] ?? 'No title';

echo json_encode(['title' => htmlspecialchars($title)]);
```
