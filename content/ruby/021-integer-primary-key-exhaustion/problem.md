---
slug: integer-primary-key-exhaustion
track: ruby
orderIndex: 21
title: Integer Primary Key Nears Limit
difficulty: medium
tags:
  - active-record
  - rails
  - idioms
language: ruby
---

## Context

The migration in `db/migrate/20190314_create_events.rb` created the `events` table for a high-volume analytics ingestion pipeline. The table receives roughly 2 million inserts per day and has been running for several years. The schema uses Rails' default primary key type.

An on-call engineer received a PagerDuty alert that the events API was returning 500 errors. The database logs showed `ERROR: integer out of range`. The table had crossed the 2.1-billion-row mark, exhausting the signed 32-bit integer primary key sequence.

A data team query had flagged the primary key reaching 80% capacity six months earlier, but no remediation ticket was acted upon. The fix now requires a multi-hour `ALTER TABLE` on a live, write-heavy table.

## Buggy code

```ruby
# db/migrate/20190314_create_events.rb
class CreateEvents < ActiveRecord::Migration[5.2]
  def change
    create_table :events do |t|
      t.string  :event_type,  null: false
      t.integer :user_id
      t.jsonb   :payload,     default: {}
      t.timestamps
    end

    add_index :events, :event_type
    add_index :events, :user_id
    add_index :events, :created_at
  end
end
```
