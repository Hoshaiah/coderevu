---
slug: redirect-after-destroy-double-render
track: ruby
orderIndex: 89
title: Destroy Action Double Render Race Condition
difficulty: easy
tags:
  - error-handling
  - controller
  - double-render
language: ruby
---

## Context

The `DocumentsController#destroy` action has been intermittently raising `AbstractController::DoubleRenderError` in production. Sentry shows the error fires roughly once every few hundred deletions, seemingly at random. The stack trace always points to the same `destroy` action.

Locally developers can reproduce it by quickly clicking the delete button twice.

## Buggy code

```ruby
# app/controllers/documents_controller.rb
class DocumentsController < ApplicationController
  before_action :set_document

  def destroy
    if @document.destroy
      flash[:notice] = "Document deleted successfully."
    else
      flash[:alert] = "Could not delete document."
    end
    redirect_to documents_path
  end

  private

  def set_document
    @document = Document.find(params[:id])
  end
end
```
