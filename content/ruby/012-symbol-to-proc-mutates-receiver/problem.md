---
slug: symbol-to-proc-mutates-receiver
track: ruby
orderIndex: 12
title: Map Bang Mutates Original Array
difficulty: easy
tags:
  - mutability
  - idioms
  - ruby
language: ruby
---

## Context

This utility lives in `lib/formatters/tag_normalizer.rb` and is called from several report-generation jobs. It receives a list of user-supplied tag strings, normalizes them to lowercase, and returns the cleaned list. The original array comes from a cached query result stored in a memoized instance variable.

Operators noticed that after the first report run, subsequent calls that read the memoized tags see them already downcased — which is correct — but also that some conditional logic elsewhere that checks for uppercase letters in the original tags silently stops working after the first invocation.

The team added logging and confirmed that the memoized `@tags` array is different after `normalize_tags` is called. They ruled out any explicit reassignment of `@tags` in the codebase.

## Buggy code

```ruby
class ReportFormatter
  def initialize(tags)
    @tags = tags
  end

  def normalize_tags
    @tags.map!(&:downcase)
  end

  def has_uppercase_tags?
    @tags.any? { |t| t =~ /[A-Z]/ }
  end
end

formatter = ReportFormatter.new(["Events", "Sales", "HR"])
puts formatter.has_uppercase_tags?   # => true
formatter.normalize_tags
puts formatter.has_uppercase_tags?   # => false (expected), but @tags is now permanently mutated
```
