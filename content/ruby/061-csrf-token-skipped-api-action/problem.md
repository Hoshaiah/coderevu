---
slug: csrf-token-skipped-api-action
track: ruby
orderIndex: 61
title: CSRF Protection Skipped on Action
difficulty: medium
tags:
  - security
  - rails
  - csrf
language: ruby
---

## Context

`app/controllers/transfers_controller.rb` handles internal money transfers between a user's own accounts on a personal finance app. The controller was adapted from an earlier API-only prototype that used token authentication. During the migration to a session-based web app, the developer kept the `protect_from_forgery` skip that had been needed for the mobile API clients.

A security audit flagged the endpoint as vulnerable: an authenticated user visiting a malicious third-party website could have funds transferred without their knowledge via a forged cross-site request.

All other controllers in the app use the default Rails CSRF protection. The relevant session cookie is `SameSite=Lax`, which provides partial protection on modern browsers but is not considered sufficient by the security team's policy.

## Buggy code

```ruby
# app/controllers/transfers_controller.rb
class TransfersController < ApplicationController
  skip_before_action :verify_authenticity_token, only: [:create]

  before_action :authenticate_user!

  def new
    @transfer = Transfer.new
    @accounts = current_user.accounts
  end

  def create
    @transfer = current_user.transfers.build(transfer_params)
    if @transfer.save
      redirect_to accounts_path, notice: "Transfer initiated."
    else
      render :new
    end
  end

  private

  def transfer_params
    params.require(:transfer).permit(:from_account_id, :to_account_id, :amount_cents)
  end
end
```
