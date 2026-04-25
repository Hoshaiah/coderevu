---
slug: unsafe-redirect-open-redirect
track: ruby
orderIndex: 50
title: Unsafe Redirect On Login Return Parameter
difficulty: easy
tags:
  - security
  - open-redirect
  - authentication
language: ruby
---

## Context

The app supports a `return_to` query parameter so users are redirected back to the page they were trying to visit after logging in. A security researcher reported that the login form can be used as an open redirector: an attacker sends a phishing link like `/login?return_to=https://evil.com` and after authenticating, the victim lands on the attacker's site.

The controller code is below.

## Buggy code

```ruby
# app/controllers/sessions_controller.rb
class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  def new
    @return_to = params[:return_to]
  end

  def create
    user = User.find_by(email: params[:email])
    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      return_to = params[:return_to].presence || root_path
      redirect_to return_to
    else
      flash.now[:alert] = "Invalid email or password."
      render :new, status: :unauthorized
    end
  end
end
```
