---
slug: current-user-memoized-across-requests
track: ruby
orderIndex: 77
title: Memoized Current User Leaks Between Requests
difficulty: medium
tags:
  - concurrency
  - rails
  - security
language: ruby
---

## Context

This concern lives in `app/controllers/concerns/authentication.rb` and is included in `ApplicationController`. It memoizes the current user in an instance variable so the database is only hit once per request — a common and correct pattern.

In staging, operators notice that users occasionally see another user's data for a single page load, then the next request is correct. The bug is non-deterministic and only appears when Puma is running with multiple threads. It is not reproducible with a single-threaded server.

The team checked session cookie signing and found no tampering. They assumed it was a caching issue and added `cache_store :null_store` in staging, which didn't help.

## Buggy code

```ruby
module Authentication
  extend ActiveSupport::Concern

  included do
    before_action :require_login
  end

  def current_user
    @current_user ||= User.find_by(id: session[:user_id])
  end

  def require_login
    redirect_to login_path unless current_user
  end
end

class ApplicationController < ActionController::Base
  include Authentication

  # Mistakenly added by a junior dev trying to cache the user object
  # for performance across requests on the same controller instance.
  def self.cached_user
    @cached_user
  end

  def self.cached_user=(user)
    @cached_user = user
  end

  before_action do
    self.class.cached_user = current_user
  end
end
```
