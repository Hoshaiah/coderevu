---
slug: params-permit-symbol-vs-string
track: ruby
orderIndex: 57
title: Mass Assignment via Unpermitted Params
difficulty: medium
tags:
  - security
  - active-record
  - mass-assignment
language: ruby
---

## Context

This update action lives in `app/controllers/users_controller.rb` in a multi-tenant B2B application. Users can edit their own profile (name, email, bio). The `User` model has an `admin` boolean column and an `account_id` foreign key that must never be user-editable. The app uses Rails 7 with strong parameters.

A security researcher reported that sending `{"user":{"admin":true}}` in the request body successfully escalated their account to admin. The controller was supposed to whitelist only safe fields, but the researcher's Burp Suite replay confirmed the elevation works every time.

The developer who wrote the action tested it through the form in the browser and saw no issues; the form only submits `name`, `email`, and `bio`, so the vulnerability only manifests with crafted requests.

## Buggy code

```ruby
class UsersController < ApplicationController
  before_action :authenticate_user!
  before_action :set_user

  def update
    # Only allow safe profile fields
    safe_params = params[:user].permit(:name, :email, :bio)

    if @user.update(safe_params)
      render json: { status: :ok }
    else
      render json: { errors: @user.errors.full_messages }, status: :unprocessable_entity
    end
  end

  private

  def set_user
    @user = User.find(params[:id])
  end
end
```
