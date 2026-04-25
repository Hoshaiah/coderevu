---
slug: around-action-missing-yield
track: ruby
orderIndex: 95
title: Around Action Skips Yield
difficulty: easy
tags:
  - rails
  - idioms
  - active-record
language: ruby
---

## Context

`app/controllers/api/v1/application_controller.rb` defines an `around_action` used by all API controllers to wrap each request in a multi-tenant context. It sets the current tenant from the `X-Tenant-ID` header, yields to the action, then tears down the context. This pattern is common in Rails SaaS apps.

After a refactor that added error handling to the around action, QA reported that every API endpoint returns a blank 200 response with no body. No exception is raised, no logs show the action executing, and the database shows no queries from those requests.

The previous version of the callback (before the refactor) worked correctly. The refactor only added the `rescue` clause.

## Buggy code

```ruby
module Api
  module V1
    class ApplicationController < ActionController::API
      around_action :with_tenant_context

      private

      def with_tenant_context
        tenant_id = request.headers["X-Tenant-ID"]
        unless tenant_id
          render json: { error: "Missing tenant" }, status: :bad_request
          return
        end

        Tenant.current = Tenant.find_by!(id: tenant_id)
        yield
      rescue ActiveRecord::RecordNotFound
        render json: { error: "Unknown tenant" }, status: :not_found
      rescue StandardError => e
        Rails.logger.error("Tenant context error: #{e.message}")
        render json: { error: "Internal error" }, status: :internal_server_error
      ensure
        Tenant.current = nil
      end
    end
  end
end
```
