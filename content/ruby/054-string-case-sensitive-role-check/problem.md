---
slug: string-case-sensitive-role-check
track: ruby
orderIndex: 54
title: Case-Sensitive Role Authorization Check
difficulty: easy
tags:
  - security
  - rails
  - authorization
  - idioms
language: ruby
---

## Context

`app/controllers/admin/dashboard_controller.rb` restricts access to the admin area by checking the current user's `role` column. The `role` column is a plain `string` in PostgreSQL, populated by a form that some legacy admin scripts fill with various capitalizations (`"Admin"`, `"ADMIN"`, `"admin"`).

The security team discovered during a review that several users with `role = "Admin"` or `role = "ADMIN"` could access the admin dashboard despite not being in a well-known admin group. Conversely, attempts to manually set a test account to `"Admin"` to test the flow were unexpectedly blocked.

No authentication middleware is involved — this is purely an application-level authorization guard.

## Buggy code

```ruby
# app/controllers/admin/dashboard_controller.rb
module Admin
  class DashboardController < ApplicationController
    before_action :require_admin!

    def index
      @stats = AdminStats.generate
    end

    private

    def require_admin!
      unless current_user&.role == "admin"
        flash[:alert] = "Not authorized."
        redirect_to root_path
      end
    end
  end
end
```
