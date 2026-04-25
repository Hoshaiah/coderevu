---
slug: thread-local-request-store-leak
track: ruby
orderIndex: 79
title: Thread-Local State Leaks Between Requests
difficulty: hard
tags:
  - concurrency
  - rails
  - ruby
language: ruby
---

## Context

The middleware `lib/middleware/current_tenant.rb` is responsible for parsing the subdomain from each incoming request and storing the resolved `Tenant` record in a thread-local variable so that ActiveRecord scopes throughout the app can automatically filter by tenant. The app runs on Puma with multiple threads per worker.

Operators noticed that occasionally a request meant for `tenant-a.example.com` receives data belonging to `tenant-b`. The bug is not reproducible in development (which uses a single-threaded server) and appears more frequently under load when threads are reused rapidly across requests.

Database logs confirm that queries sometimes include the wrong `tenant_id` in the `WHERE` clause. The tenant model and subdomain parsing logic have been verified as correct in isolation.

## Buggy code

```ruby
module Middleware
  class CurrentTenant
    def initialize(app)
      @app = app
    end

    def call(env)
      request = Rack::Request.new(env)
      subdomain = request.host.split('.').first
      tenant = Tenant.find_by(subdomain: subdomain)

      RequestStore.store[:current_tenant] = tenant
      @app.call(env)
    ensure
      # Intentionally left blank — developer assumed GC would handle cleanup
    end
  end
end

module Current
  def self.tenant
    RequestStore.store[:current_tenant]
  end
end
```
