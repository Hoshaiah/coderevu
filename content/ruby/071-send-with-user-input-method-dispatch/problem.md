---
slug: send-with-user-input-method-dispatch
track: ruby
orderIndex: 71
title: Arbitrary Method Dispatch via User Input
difficulty: hard
tags:
  - security
  - ruby
  - rails
language: ruby
---

## Context

This code is in `app/controllers/reports_controller.rb` in an internal analytics dashboard. Report columns can be sorted by passing a `sort_by` parameter, which is mapped to a model method to avoid writing multiple query branches. The feature was built quickly for an internal tool but has since been exposed to external API consumers.

A penetration tester found they could call arbitrary methods on the `Report` model by crafting `sort_by` parameters, including `destroy_all`, `connection`, and `class_eval`. Sending `sort_by=delete_all` wiped the reports table in their test environment.

The team has `strong_parameters` enabled for writes but this action is a GET request where no params permit list was applied.

## Buggy code

```ruby
class ReportsController < ApplicationController
  before_action :require_login

  ALLOWED_SORTS = %w[created_at revenue user_count].freeze

  def index
    sort_by = params[:sort_by] || "created_at"
    @reports = Report.all.sort_by { |r| r.send(sort_by) }
    render json: @reports
  end
end
```
