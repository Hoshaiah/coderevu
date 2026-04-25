---
slug: symbolize-keys-user-input
track: ruby
orderIndex: 62
title: User Input Symbolized Without Limit
difficulty: medium
tags:
  - security
  - ruby
  - memory
language: ruby
---

## Context

This code lives in `app/controllers/api/v1/webhooks_controller.rb`. The endpoint accepts JSON payloads from third-party partners and routes them to a processing service. The controller parses the raw body, symbolizes the keys, and passes the hash to `WebhookProcessor.call`.

The security team flagged this endpoint during a routine audit. No immediate incident has occurred, but the concern is about what happens under adversarial or malformed input at scale. The endpoint receives roughly 50,000 requests per day from a variety of partners, some of whom send inconsistently named keys.

The development team had added `symbolize_keys` to make downstream code cleaner — `processor.payload[:event_type]` reads better than `processor.payload["event_type"]`. Nobody considered what happens to the Ruby symbol table when this runs in production.

## Buggy code

```ruby
class Api::V1::WebhooksController < ApplicationController
  skip_before_action :verify_authenticity_token
  before_action :authenticate_partner!

  def receive
    raw = request.body.read
    payload = JSON.parse(raw).symbolize_keys

    WebhookProcessor.call(
      partner: current_partner,
      payload: payload
    )

    head :ok
  rescue JSON::ParserError
    head :bad_request
  end

  private

  def authenticate_partner!
    token = request.headers["X-Partner-Token"]
    @current_partner = Partner.find_by!(api_token: token)
  rescue ActiveRecord::RecordNotFound
    head :unauthorized
  end
end
```
