---
slug: render-json-exposes-all-attributes
track: ruby
orderIndex: 51
title: 'render json: Leaks Sensitive Attributes'
difficulty: easy
tags:
  - security
  - rails
  - active-record
language: ruby
---

## Context

The endpoint in `app/controllers/api/v1/users_controller.rb` powers the mobile app's profile screen. It fetches the current user record and returns it as JSON. The controller was written quickly during an early sprint and marked for cleanup, but it shipped to production before that cleanup happened.

A security audit found that API responses include `password_digest`, `reset_password_token`, and `stripe_customer_id` fields in plaintext. Any authenticated user who intercepts their own API response — or whose traffic is logged by a proxy — can see these values.

The team confirmed that none of the mobile app screens display or consume those fields, so they were never intended to be public.

## Buggy code

```ruby
module Api
  module V1
    class UsersController < ApplicationController
      before_action :authenticate_user!

      def show
        user = User.find(params[:id])
        render json: user
      end

      def update
        user = User.find(params[:id])
        if user.update(user_params)
          render json: user
        else
          render json: { errors: user.errors.full_messages }, status: :unprocessable_entity
        end
      end

      private

      def user_params
        params.require(:user).permit(:name, :email)
      end
    end
  end
end
```
