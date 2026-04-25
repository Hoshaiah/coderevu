---
slug: session-fixation-on-login
track: ruby
orderIndex: 69
title: Session Fixation on Login
difficulty: hard
tags:
  - security
  - authentication
  - rails
language: ruby
---

## Context

This sessions controller lives in `app/controllers/sessions_controller.rb` in a Rails 7 consumer web application that uses cookie-based sessions (the default `ActionDispatch::Session::CookieStore`). The app does not use Devise — authentication is hand-rolled. The login form POSTs credentials to `SessionsController#create`.

A penetration tester flagged a session fixation vulnerability: an attacker can pre-set a known session cookie in the victim's browser (e.g., via a subdomain XSS or network interception), wait for the victim to log in, and then use that same cookie to gain authenticated access as the victim — without ever knowing the victim's credentials.

The developer who wrote the action argued that because `CookieStore` signs the session, an attacker cannot forge one. The pen tester confirmed the attack still works even with signed cookies, and the developer is unsure why.

## Buggy code

```ruby
class SessionsController < ApplicationController
  skip_before_action :verify_authenticity_token, only: :create

  def create
    user = User.find_by(email: params[:email])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      redirect_to dashboard_path, notice: "Welcome back!"
    else
      flash.now[:alert] = "Invalid email or password."
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session.delete(:user_id)
    redirect_to root_path
  end
end
```
