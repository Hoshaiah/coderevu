---
slug: n-plus-one-nested-comments
track: ruby
orderIndex: 42
title: N+1 on Nested Comment Authors
difficulty: easy
tags:
  - n+1
  - active-record
  - rails
language: ruby
---

## Context

The endpoint in `app/controllers/posts_controller.rb` renders an article's comments for a single-page app. The JSON response includes each comment along with the commenting user's display name and avatar URL. This powers the comments section visible below every published article.

After a viral post attracted thousands of comments, the database CPU spiked to 100% and the endpoint started returning 504s. A DBA inspecting `pg_stat_activity` saw thousands of near-identical `SELECT * FROM users WHERE id = ?` queries executing concurrently. The endpoint that lists posts without loading comments had no such problem.

The team confirmed that response times scale linearly with the number of comments on a post, which is the classic symptom of this class of bug.

## Buggy code

```ruby
class PostsController < ApplicationController
  def show
    @post = Post.find(params[:id])
    @comments = @post.comments.order(created_at: :asc)

    render json: {
      post: @post.as_json(only: [:id, :title, :body]),
      comments: @comments.map do |comment|
        {
          id: comment.id,
          body: comment.body,
          author_name: comment.user.display_name,
          author_avatar: comment.user.avatar_url,
          created_at: comment.created_at
        }
      end
    }
  end
end
```
