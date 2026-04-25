---
slug: counter-cache-off-by-one
track: ruby
orderIndex: 18
title: Counter Cache Off-By-One On Delete
difficulty: medium
tags:
  - active-record
  - counter-cache
  - correctness
  - callbacks
language: ruby
---

## Context

The `comments_count` column on `posts` is used everywhere in the UI to display comment counts without extra queries. After deploying a new moderation feature that hard-deletes spam comments, the counts shown on posts are consistently higher than the real number of comments.

The relevant model code is below. The `posts` table has a `comments_count integer default 0` column.

## Buggy code

```ruby
# app/models/comment.rb
class Comment < ApplicationRecord
  belongs_to :post

  after_create  :increment_post_counter
  after_destroy :decrement_post_counter

  private

  def increment_post_counter
    post.update_column(:comments_count, post.comments_count + 1)
  end

  def decrement_post_counter
    post.update_column(:comments_count, post.comments_count - 1)
  end
end
```
