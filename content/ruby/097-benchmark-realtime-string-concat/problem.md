---
slug: benchmark-realtime-string-concat
track: ruby
orderIndex: 97
title: String Concat in Tight Loop
difficulty: easy
tags:
  - ruby
  - performance
  - idioms
language: ruby
---

## Context

This utility lives in `lib/report/csv_builder.rb` and is called by a nightly Rake task that exports up to 500,000 rows of transaction data to a CSV string, which is then uploaded to S3. The method was written quickly and works correctly for small datasets in development.

In production the Rake task runs fine for small exports but times out and exhausts memory on large datasets. A DataDog trace shows the export step alone taking 40+ minutes and allocating gigabytes of objects before the process is killed by the scheduler.

The team profiled the mailer and S3 upload and ruled those out. They haven't yet profiled the CSV building step itself.

## Buggy code

```ruby
module Report
  class CsvBuilder
    HEADER = "id,amount,currency,created_at\n"

    def self.build(transactions)
      csv = HEADER
      transactions.each do |txn|
        csv += "#{txn.id},#{txn.amount},#{txn.currency},#{txn.created_at}\n"
      end
      csv
    end
  end
end
```
