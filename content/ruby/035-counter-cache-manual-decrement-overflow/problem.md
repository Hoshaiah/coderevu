---
slug: counter-cache-manual-decrement-overflow
track: ruby
orderIndex: 35
title: Counter Cache Manual Update Bug
difficulty: hard
tags:
  - active-record
  - concurrency
  - counter-cache
language: ruby
---

## Context

This code lives in `app/models/comment.rb` in a social platform Rails 7 app. Posts have a `comments_count` integer column managed manually (the team chose not to use Rails' built-in counter cache because they have custom logic around soft-deletes). The column is used to display comment counts in list views without joining to the `comments` table.

Users reported that comment counts occasionally go negative or show wildly incorrect values (e.g., -3 or 500 when there are actually 12 comments). The issue is more common on popular posts during peak traffic.

The team already added a database index on `comments.post_id` and confirmed that soft-deleted comments (`deleted_at IS NOT NULL`) are correctly excluded from the displayed count. They've been unable to reproduce it in a single-threaded test environment.

## Buggy code

```ruby
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
