---
slug: file-handle-leak-in-rescue
track: ruby
orderIndex: 96
title: File handles leak when an exception is raised during processing
difficulty: easy
tags:
  - resource-management
  - file-handles
  - ensure
language: ruby
---

## Context

An ETL pipeline reads CSV exports dropped into an S3-mounted directory and loads them into a data warehouse. After running for a few days, worker processes start failing with `Errno::EMFILE: Too many open files`. The error only occurs after the pipeline has processed some malformed files, which is a clue the on-call engineer overlooked at first.

## Buggy code

```ruby
class CsvLoader
  def load_file(path)
    file = File.open(path)
    rows = []

    file.each_line do |line|
      rows << parse_line(line)
    end

    import_rows(rows)
    file.close
  rescue CSV::MalformedCSVError => e
    Rails.logger.warn("Skipping malformed file #{path}: #{e.message}")
  end

  private

  def parse_line(line)
    CSV.parse_line(line)
  end
end
```
