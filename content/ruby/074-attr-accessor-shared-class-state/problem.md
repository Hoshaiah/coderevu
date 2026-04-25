---
slug: attr-accessor-shared-class-state
track: ruby
orderIndex: 74
title: Class-Level Accessor Shared State
difficulty: easy
tags:
  - concurrency
  - mutability
  - ruby
language: ruby
---

## Context

`lib/export/report_builder.rb` is a small utility class used by several background jobs to assemble CSV reports. To avoid passing a `config` object down through every private method, an engineer stored the current job's configuration in a class-level attribute using `attr_accessor` at the class level (not the instance level). The class is never instantiated — all methods are `self.*`.

On a single-threaded staging environment the reports look fine. In production, where Sidekiq runs with 10 threads, operators started seeing rows from one tenant's report bleeding into a completely different tenant's export file. The bug is intermittent and impossible to reproduce locally.

Thread sanitizer logs show writes and reads to the same memory location from different threads. The class itself has no explicit mutex.

## Buggy code

```ruby
module Export
  class ReportBuilder
    class << self
      attr_accessor :current_config
    end

    def self.build(config)
      self.current_config = config
      rows = fetch_records.map { |r| format_row(r) }
      write_csv(rows)
    end

    def self.fetch_records
      Account.where(plan: current_config[:plan]).limit(1000)
    end

    def self.format_row(record)
      [record.id, record.name, current_config[:currency]]
    end

    def self.write_csv(rows)
      CSV.generate { |csv| rows.each { |r| csv << r } }
    end
  end
end
```
