---
slug: missing-unique-index-race
track: ruby
orderIndex: 87
title: Missing Unique Index On Email
difficulty: medium
tags:
  - database
  - uniqueness
  - race-condition
  - migrations
language: ruby
---

## Context

The `User` model has a Rails uniqueness validation on `email`. Despite this, the support team occasionally finds two accounts sharing the same email address in the database. The duplicates always seem to be created within milliseconds of each other, suggesting a race condition.

The model and migration are shown below.

## Buggy code

```ruby
# db/migrate/20240101000000_create_users.rb
class CreateUsers < ActiveRecord::Migration[7.1]
  def change
    create_table :users do |t|
      t.string :email, null: false
      t.string :password_digest, null: false
      t.boolean :admin, default: false
      t.timestamps
    end
  end
end

# app/models/user.rb
class User < ApplicationRecord
  has_secure_password

  validates :email,
    presence: true,
    uniqueness: { case_sensitive: false },
    format: { with: URI::MailTo::EMAIL_REGEXP }
end
```
