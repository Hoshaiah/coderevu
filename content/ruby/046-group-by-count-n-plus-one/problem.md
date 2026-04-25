---
slug: group-by-count-n-plus-one
track: ruby
orderIndex: 46
title: N+1 Inside a Group-By Report
difficulty: medium
tags:
  - n+1
  - active-record
  - rails
  - performance
language: ruby
---

## Context

This code lives in `app/services/billing/invoice_summary.rb`, called by a background job that emails monthly billing summaries to account owners. The summary shows each account's total invoice count and the name of the account's primary owner.

The job runs fine for small tenants but times out for large installations with thousands of accounts. A slow-query alert shows the database receiving one query per account, all of the form `SELECT * FROM users WHERE id = ?`, flooding the connection pool.

The team optimised the invoice query with an index and saw no improvement. They haven't looked at the user lookups.

## Buggy code

```ruby
module Billing
  class InvoiceSummary
    def self.generate
      counts = Invoice
        .where(status: "issued")
        .group(:account_id)
        .count

      counts.map do |account_id, invoice_count|
        account = Account.find(account_id)
        owner   = account.owner  # has_one :owner, class_name: 'User'

        {
          account_id: account_id,
          owner_name: owner.full_name,
          invoice_count: invoice_count
        }
      end
    end
  end
end
```
