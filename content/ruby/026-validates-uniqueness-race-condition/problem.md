---
slug: validates-uniqueness-race-condition
track: ruby
orderIndex: 26
title: Uniqueness Validation Without DB Index
difficulty: medium
tags:
  - active-record
  - concurrency
  - rails
  - security
language: ruby
---

## Context

This code is in `app/models/invite.rb` for a B2B SaaS. Each `Invite` record has a unique token used in single-use invitation links. The model uses an ActiveRecord uniqueness validator to prevent duplicate tokens from being saved.

Occasionally, two invite records appear in the database with the same token. When both recipients click the same magic link, one of them gains access to an account they shouldn't. The issue appears only under load during a large batch invite job that creates thousands of invites concurrently via Sidekiq.

The team verified the validator fires in unit tests and assumed the problem was in the mailer de-duplication logic. They have not inspected the database schema for the invites table.

## Buggy code

```ruby
class Invite < ApplicationRecord
  before_create :generate_token
  validates :token, uniqueness: true
  validates :email, presence: true

  def generate_token
    self.token = SecureRandom.hex(24)
  end
end

# db/migrate/20240101000000_create_invites.rb
class CreateInvites < ActiveRecord::Migration[7.1]
  def change
    create_table :invites do |t|
      t.string :email, null: false
      t.string :token
      t.integer :account_id
      t.timestamps
    end
    # no index on token
  end
end
```
