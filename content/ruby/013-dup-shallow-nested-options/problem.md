---
slug: dup-shallow-nested-options
track: ruby
orderIndex: 13
title: Shallow Dup Leaks Nested Config
difficulty: easy
tags:
  - mutability
  - ruby
  - idioms
language: ruby
---

## Context

A small configuration builder lives in `lib/report/options.rb`. It's used across several background jobs to construct per-tenant report options by merging a tenant-specific override hash on top of a shared default. The builder is tested in isolation and has been in production for two years.

Several tenants started reporting that their report filters occasionally contain filter values from other tenants — specifically the `filters` sub-hash. The issue is intermittent and only appears under load, which led the team to assume a concurrency problem. Thread safety was audited and ruled out; the jobs run in separate processes.

A careful read of the code shows the bug is not concurrency-related at all. It reproduces reliably in a single-threaded script if the same `DEFAULTS` constant is used across multiple build calls.

## Buggy code

```ruby
module Report
  DEFAULTS = {
    format: :pdf,
    filters: { active: true, archived: false },
    page_size: 50
  }

  def self.build_options(overrides = {})
    options = DEFAULTS.dup
    options.merge!(overrides)
    options
  end
end

# Tenant A
opts_a = Report.build_options(tenant_id: 1)
opts_a[:filters][:region] = "eu"

# Tenant B — unexpectedly sees region: "eu"
opts_b = Report.build_options(tenant_id: 2)
puts opts_b[:filters].inspect
```
