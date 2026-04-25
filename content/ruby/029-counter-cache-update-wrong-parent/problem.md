---
slug: counter-cache-update-wrong-parent
track: ruby
orderIndex: 29
title: Counter Cache Updates Wrong Parent
difficulty: medium
tags:
  - active-record
  - rails
  - n+1
language: ruby
---

## Context

`app/models/comment.rb` belongs to both a `Post` and a `User`. The `Post` model has a `comments_count` counter cache column. The model was recently refactored to support threaded comments, adding an optional `parent_comment_id`. During the refactor, the `belongs_to` declaration for `post` was rewritten.

After the deploy, the product team noticed that `comments_count` on posts diverges from the actual comment count within hours of traffic. Some posts show a count that is far too high; others show zero despite having many comments. A manual `Post.reset_counters` call fixes individual posts temporarily but the problem recurs.

The team ran `rails db:schema:dump` and confirmed the column exists and has the right default. The issue is not in the schema — it is in the model declaration.

## Buggy code

```ruby
class Comment < ApplicationRecord
  belongs_to :user
  belongs_to :post, counter_cache: true
  belongs_to :parent_comment, class_name: 'Comment', optional: true

  # After the threaded-comment refactor, comments can be re-parented:
  def reparent!(new_post)
    self.post = new_post
    save!
  end
end

# app/models/post.rb (excerpt):
# has_many :comments, dependent: :destroy
# The comments_count column exists on posts.
```
