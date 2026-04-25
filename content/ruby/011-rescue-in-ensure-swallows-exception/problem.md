---
slug: rescue-in-ensure-swallows-exception
track: ruby
orderIndex: 11
title: Rescue in Ensure Swallows Errors
difficulty: hard
tags:
  - idioms
  - error-handling
  - ruby
language: ruby
---

## Context

`lib/batch/csv_importer.rb` processes uploaded CSVs in a background job. The importer opens a tempfile, streams rows through a transformation pipeline, and must always delete the tempfile when finished — even if an error occurs mid-stream. A developer wrapped the cleanup in an `ensure` block and added a `rescue` inside the `ensure` in case the delete itself fails (e.g., the file was already removed by another process).

QA noticed that import jobs occasionally fail silently: the job ends with a success status in Sidekiq, no error is reported to Sentry, but the imported records are not in the database. The issue is non-deterministic and only surfaces when the S3 download of the CSV fails with a network timeout mid-stream.

Logging shows the job enters the `ensure` block but the downstream exception is never re-raised.

## Buggy code

```ruby
class CsvImporter
  def import(s3_key)
    tempfile = Tempfile.new(["import", ".csv"])

    begin
      download_to(s3_key, tempfile)
      process(tempfile)
    ensure
      begin
        tempfile.close
        tempfile.unlink
      rescue => e
        Rails.logger.warn("Tempfile cleanup failed: #{e.message}")
      end
    end
  end

  private

  def download_to(s3_key, file)
    # streams S3 object; raises Net::ReadTimeout on network failure
    S3Client.stream(s3_key, file)
  end

  def process(file)
    CSV.foreach(file.path, headers: true) do |row|
      Record.create!(row.to_h)
    end
  end
end
```
