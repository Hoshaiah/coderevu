---
slug: security-preg-replace-e-modifier
track: php
orderIndex: 32
title: PREG_REPLACE e-Modifier Code Execution
difficulty: hard
tags:
  - security
  - code-execution
  - regex
language: php
---

## Context

This helper lives in `lib/TemplateRenderer.php` and is responsible for processing simple markup in user-generated blog post bodies. The application runs on PHP 5.6 and the team has repeatedly deferred a PHP 7 upgrade. The function is called from the public post-view endpoint with the raw post body fetched from the database.

The security team received a report that an authenticated user was able to execute arbitrary PHP on the server by crafting a specific post body. The site is defaced with `/etc/passwd` contents rendered inline. The team cannot reproduce it on their local PHP 7.4 Docker setup and is confused about why production is affected.

The engineer on call has checked that all SQL queries are parameterised and that file uploads are restricted. They've ruled out path traversal. The vulnerability is entirely within the template rendering function.

## Buggy code

```php
<?php
// lib/TemplateRenderer.php

class TemplateRenderer
{
    public static function renderPostBody(string $body): string
    {
        // Convert [b]...[/b] to <strong>...</strong>
        $body = preg_replace('/\[b\](.+?)\[\/b\]/e', "'<strong>'.strtoupper('\\1').'</strong>'", $body);

        // Convert [i]...[/i] to <em>...</em>
        $body = preg_replace('/\[i\](.+?)\[\/i\]/e', "'<em>'.htmlspecialchars('\\1').'</em>'", $body);

        // Convert [url=http://...]link text[/url]
        $body = preg_replace(
            '/\[url=([^\]]+)\](.+?)\[\/url\]/e',
            "'<a href=\''.\\1.'\'>'.\\2.'</a>'",
            $body
        );

        return $body;
    }
}
```
