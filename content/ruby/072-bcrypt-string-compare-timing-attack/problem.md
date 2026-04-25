---
slug: bcrypt-string-compare-timing-attack
track: ruby
orderIndex: 72
title: API Token Timing Attack
difficulty: hard
tags:
  - security
  - rails
  - concurrency
language: ruby
---

## Context

`app/controllers/api/v1/base_controller.rb` implements token-based authentication for a public REST API. Clients include a bearer token in the `Authorization` header. The controller looks up the user by token and compares it to a stored hashed token.

A security auditor flagged the authentication comparison as vulnerable to a timing side-channel attack. An attacker who can make many requests and measure response latencies could distinguish a valid token prefix from an invalid one, eventually reconstructing a live token without the hash.

The team has confirmed TLS is in use and rate limiting is applied, but the auditor's report notes these are mitigations, not fixes — the underlying comparison is still non-constant-time.

## Buggy code

```ruby
class Api::V1::BaseController < ActionController::API
  before_action :authenticate_api_user!

  private

  def authenticate_api_user!
    token = request.headers['Authorization']&.split(' ')&.last
    return render json: { error: 'Unauthorized' }, status: :unauthorized unless token

    @current_user = User.find_by(api_token_digest: Digest::SHA256.hexdigest(token))

    unless @current_user
      render json: { error: 'Unauthorized' }, status: :unauthorized
    end
  end
end

# app/models/user.rb (relevant excerpt):
# def self.authenticate_by_token(raw_token)
#   digest = Digest::SHA256.hexdigest(raw_token)
#   # Direct string equality used here in old code path:
#   all.find { |u| u.api_token_digest == digest }
# end
```
