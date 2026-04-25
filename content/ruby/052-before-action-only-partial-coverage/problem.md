---
slug: before-action-only-partial-coverage
track: ruby
orderIndex: 52
title: before_action Only Leaves Gap
difficulty: easy
tags:
  - security
  - rails
  - idioms
language: ruby
---

## Context

`app/controllers/documents_controller.rb` manages sensitive documents. Authentication is enforced with a `before_action` hook. A new `download` action was added by a contractor during a feature sprint. The controller already had a well-known pattern for skipping auth on the `public_preview` action, and the contractor followed the same pattern — but applied it in the wrong direction.

A penetration test found that any unauthenticated user could access the `download` action by hitting the URL directly. The application returns a 200 with the file instead of redirecting to the login page. The bug is invisible from the existing action list because `download` is not in the `only:` list on the `before_action`.

This is a common off-by-one of coverage: the developer added a new action but forgot to extend the allow-list on the authentication hook.

## Buggy code

```ruby
class DocumentsController < ApplicationController
  before_action :authenticate_user!, only: [:index, :show, :edit, :update, :destroy]

  def index
    @documents = current_user.documents
  end

  def show
    @document = current_user.documents.find(params[:id])
  end

  def public_preview
    @document = Document.published.find(params[:id])
    render :preview
  end

  # Added later — NOT in the only: list above, so no auth check runs.
  def download
    @document = Document.find(params[:id])
    send_file @document.file_path
  end

  def edit; end
  def update; end
  def destroy; end
end
```
