---
slug: where-in-loop-n-plus-one
track: ruby
orderIndex: 48
title: N+1 Inside Notification Fanout
difficulty: medium
tags:
  - n+1
  - active-record
  - performance
  - rails
language: ruby
---

## Context

`app/services/notification_service.rb` is called whenever a user publishes a new article. It looks up all followers of that user and sends each one an in-app notification. The service was written when the largest user in the system had ~200 followers. A viral user recently accumulated 80,000 followers.

Operators saw database connection pool exhaustion alerts and a single `NotificationService#fanout` call holding a database connection for over 40 seconds. `pg_stat_activity` showed thousands of near-identical `SELECT * FROM users WHERE id = $1` queries executing sequentially during that window.

The engineer on call added a `LIMIT 500` to the followers query as a band-aid, but the underlying query pattern still fires once per follower for every batch.

## Buggy code

```ruby
class NotificationService
  def fanout(article)
    author = article.user
    followers = Follow.where(followee_id: author.id).pluck(:follower_id)

    followers.each do |follower_id|
      recipient = User.find(follower_id)
      Notification.create!(
        recipient: recipient,
        actor: author,
        action: "published",
        notifiable: article
      )
    end
  end
end
```
