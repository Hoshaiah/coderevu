---
slug: open-redirect-via-referer-header
track: ruby
orderIndex: 65
title: Redirect Trusts Referer Header
difficulty: medium
tags:
  - security
  - open-redirect
  - rails
language: ruby
---

## Context

`app/controllers/sessions_controller.rb` handles login. After a successful authentication the controller tries to send the user back to the page they were trying to reach before being redirected to sign in. A senior engineer added a convenience shortcut: if no explicit `return_to` session key was set, fall back to the HTTP `Referer` header so users aren't dropped on the home page after logging in from a deep link.

Over the past few weeks the security team received phishing reports. Attackers are crafting login links that, after a real successful sign-in, bounce the victim straight to an attacker-controlled domain. The page looks identical to the real app (it's a clone) and harvests credentials a second time.

The team already verified that `return_to` is cleared from the session on logout and that the CSRF token is valid on all POST requests, so neither of those is the vector.

## Buggy code

```ruby
class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  def new
  end

  def create
    user = User.find_by(email: params[:email])
    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      redirect_to after_login_path
    else
      flash.now[:alert] = "Invalid credentials"
      render :new, status: :unprocessable_entity
    end
  end

  def destroy
    session.delete(:user_id)
    session.delete(:return_to)
    redirect_to login_path, notice: "Signed out"
  end

  private

  def after_login_path
    session.delete(:return_to) || request.referer || root_path
  end
end
```
