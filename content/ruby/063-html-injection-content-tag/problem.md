---
slug: html-injection-content-tag
track: ruby
orderIndex: 63
title: XSS via Unsanitized content_tag
difficulty: medium
tags:
  - security
  - rails
  - xss
language: ruby
---

## Context

This code lives in `app/helpers/notifications_helper.rb`. The helper renders a user-facing notification banner on the dashboard. Notifications can be created by admins through a backoffice UI, and they support a `title` and a `body` field. The body field is described in the admin UI as "plain text — no HTML".

The security team found during a pen test that an admin account (or an attacker who compromises one) can inject arbitrary JavaScript into the notification body that executes in every user's browser when the dashboard loads. The exploit payload was `<img src=x onerror=alert(document.cookie)>`.

The developer who wrote the helper believed that passing content through `content_tag` automatically escapes everything, which is true for the *tag attributes* — but not for the block content in all cases.

## Buggy code

```ruby
module NotificationsHelper
  def render_notification(notification)
    return unless notification

    content_tag(:div, class: "notification-banner #{notification.severity}") do
      content_tag(:h4, notification.title) +
      content_tag(:p, notification.body.html_safe)
    end
  end

  def notification_icon(severity)
    icons = { info: "ℹ", warning: "⚠", error: "✖" }
    icons[severity.to_sym].html_safe
  end
end
```
