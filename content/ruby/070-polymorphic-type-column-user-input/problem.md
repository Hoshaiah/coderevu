---
slug: polymorphic-type-column-user-input
track: ruby
orderIndex: 70
title: Polymorphic Type Set from User Input
difficulty: hard
tags:
  - security
  - rails
  - active-record
language: ruby
---

## Context

This controller is in `app/controllers/comments_controller.rb` in a content platform. Comments are polymorphic — they can belong to articles, videos, or podcasts. The `commentable_type` and `commentable_id` are sent by the JavaScript client as part of the comment creation form payload.

A security researcher reported they were able to comment on internal `AdminNote` records that should not be user-visible, by manually crafting a POST request. They could also trigger server errors by sending arbitrary class names, and in one test managed to read back data from a model they should have no access to.

The team reviewed the `before_action` authorization and confirmed that it correctly checks `current_user` permissions, but the check is only on the comment itself, not on the target object.

## Buggy code

```ruby
class CommentsController < ApplicationController
  before_action :require_login

  ALLOWED_TYPES = %w[Article Video Podcast].freeze

  def create
    @comment = Comment.new(
      body: params[:body],
      user: current_user,
      commentable_type: params[:commentable_type],
      commentable_id: params[:commentable_id]
    )

    if @comment.save
      render json: @comment, status: :created
    else
      render json: @comment.errors, status: :unprocessable_entity
    end
  end
end
```
