---
slug: url-redirect-host-not-validated
track: ruby
orderIndex: 64
title: Open Redirect Without Host Check
difficulty: medium
tags:
  - security
  - rails
  - open-redirect
language: ruby
---

## Context

This code lives in `app/controllers/sessions_controller.rb`. After a successful login, the controller redirects the user to a `return_to` URL that was stored in the session before they were sent to the login page. This pattern lets users land on the page they originally requested after authenticating.

The security team received a report from a bug bounty hunter showing that an attacker can craft a phishing URL like `https://myapp.com/login?return_to=https://evil.com/fake-login` that, after login, redirects the victim to an external malicious site. The victim sees the legitimate domain in the browser before login and may not notice the redirect.

The developer originally used `redirect_to session[:return_to]` but switched to the current approach after a Rails upgrade started showing a warning about unsafe redirects. They thought the `url_whitelist` check was sufficient.

## Buggy code

```ruby
class SessionsController < ApplicationController
  skip_before_action :require_login, only: [:new, :create]

  SAFE_REDIRECT_PATHS = %w[/dashboard /profile /orders /settings].freeze

  def new
    session[:return_to] = params[:return_to] if params[:return_to].present?
  end

  def create
    user = User.find_by(email: params[:email])

    if user&.authenticate(params[:password])
      session[:user_id] = user.id
      return_url = session.delete(:return_to) || root_path

      if SAFE_REDIRECT_PATHS.include?(return_url)
        redirect_to return_url
      else
        redirect_to root_path
      end
    else
      flash.now[:error] = "Invalid email or password"
      render :new, status: :unprocessable_entity
    end
  end
end
```
