---
slug: string-freeze-concat-loop
track: ruby
orderIndex: 1
title: Frozen String Concat in Loop
difficulty: easy
tags:
  - idioms
  - mutability
  - performance
language: ruby
---

## Context

This helper lives in `lib/report_builder.rb` and is invoked during nightly ETL jobs to assemble CSV-style output for large datasets (up to 500k rows). The method is pure Ruby with no external dependencies — it reads pre-fetched row arrays and concatenates them into a single string for writing to S3.

In production, operators started seeing `FrozenError: can't modify frozen String` in the job logs around the time the team added `# frozen_string_literal: true` to the top of every new file to comply with the style guide. The job now crashes partway through for any file that has the magic comment.

The team suspected an encoding issue and spent time investigating that angle, but encoding is fine. The crash trace consistently points to the `<<` inside the loop.

## Buggy code

```ruby
# frozen_string_literal: true

module ReportBuilder
  def self.build_csv(rows, separator: ",")
    output = ""

    rows.each_with_index do |row, idx|
      line = row.join(separator)
      output << line
      output << "\n" unless idx == rows.size - 1
    end

    output
  end
end
```
