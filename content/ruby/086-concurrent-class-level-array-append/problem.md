---
slug: concurrent-class-level-array-append
track: ruby
orderIndex: 86
title: Shared Class Array in Workers
difficulty: hard
tags:
  - concurrency
  - ruby
  - mutability
language: ruby
---

## Context

This code lives in `lib/pipeline/event_collector.rb` and is used by a data ingestion pipeline that processes webhook events in parallel using Ruby's `Thread` API. Each worker thread collects events into a shared buffer, which is then flushed to the database in bulk at the end of each batch.

The pipeline runs in production on a 16-core machine with 16 worker threads. Operators noticed that the event count at flush time is consistently lower than expected — events are being silently dropped. Occasionally the process also crashes with a `RuntimeError: can't add a new key into hash during iteration` or a corrupted array error.

The team added counters and confirmed events are being received and passed to the collector, but some never appear in the flushed batch. Adding a `Mutex` around each `<<` append slowed down the pipeline significantly, but they're not sure that's the right fix either.

## Buggy code

```ruby
module Pipeline
  class EventCollector
    BUFFER = []

    def self.collect(event)
      BUFFER << event
    end

    def self.flush!
      events_to_process = BUFFER.dup
      BUFFER.clear
      BulkEventImporter.import(events_to_process)
      events_to_process.size
    end

    def self.size
      BUFFER.size
    end
  end
end

# Called from 16 parallel worker threads:
# Pipeline::EventCollector.collect(event)
```
