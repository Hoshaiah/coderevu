---
slug: cache-key-user-id-collision
track: ruby
orderIndex: 73
title: Cache Key Exposes Tenant Data
difficulty: hard
tags:
  - security
  - active-record
  - rails
language: ruby
---

## Context

`app/controllers/reports_controller.rb` caches expensive report queries in Rails cache. The cache key was designed to be unique per report type and per user to avoid exposing one user's data to another. The controller is used in a multi-tenant app where users from different organizations should never see each other's report data.

The security team received a report from a penetration tester: after logging out and logging in as a different user in the same browser, the second user briefly saw the first user's financial report. Clearing browser cache had no effect — the data was served from the server-side Rails cache.

The team confirmed that authorization checks on the `Report` model correctly prevent database queries across tenants. The problem is in cache retrieval, not in model authorization.

## Buggy code

```ruby
class ReportsController < ApplicationController
  before_action :require_login

  def show
    report_type = params[:type]
    cache_key = "reports/#{report_type}/user_#{current_user.id}"

    @report_data = Rails.cache.fetch(cache_key, expires_in: 15.minutes) do
      ReportGenerator.run(type: report_type, organization: current_user.organization)
    end

    render json: @report_data
  end
end
```
