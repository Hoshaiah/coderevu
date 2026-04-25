---
slug: inject-with-no-initial-value
track: ruby
orderIndex: 98
title: inject Missing Initial Accumulator
difficulty: easy
tags:
  - ruby
  - idioms
  - correctness
language: ruby
---

## Context

This code lives in `lib/billing/invoice_calculator.rb`. The calculator takes a list of `LineItem` structs (each with a `unit_price` and `quantity`) and computes the invoice subtotal. It is used in both the web checkout flow and a batch billing script that runs monthly for subscription customers.

The billing team reported that single-item invoices occasionally produce the wrong total. Specifically, when an invoice contains exactly one line item, the returned value is the `LineItem` struct itself rather than a numeric total. Downstream code that tries to format the total as currency crashes with a `NoMethodError`.

The bug does not appear in the common case (2+ items) and passes all existing tests because every test fixture has at least two line items.

## Buggy code

```ruby
LineItem = Struct.new(:description, :unit_price, :quantity)

module Billing
  class InvoiceCalculator
    def self.subtotal(line_items)
      line_items.inject do |sum, item|
        sum + (item.unit_price * item.quantity)
      end
    end

    def self.total_with_tax(line_items, tax_rate:)
      sub = subtotal(line_items)
      sub + (sub * tax_rate)
    end
  end
end

items = [LineItem.new("Widget", 9.99, 3)]
puts Billing::InvoiceCalculator.subtotal(items) # => returns the LineItem struct, not 29.97
```
