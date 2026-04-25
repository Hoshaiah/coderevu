---
slug: unbounded-queue-producer-flood
track: python
orderIndex: 8
title: Unbounded Queue Floods Memory
difficulty: medium
tags:
  - resource-management
  - concurrency
  - queues
language: python
---

## Context

This module is in `workers/event_dispatcher.py`. A producer thread reads events from a Kafka topic and puts them on an in-process queue. A pool of consumer threads reads from that queue and writes events to a downstream database. The setup is intended to decouple fast ingestion from slower DB writes.

Under sustained high-throughput traffic the service process grows without bound until the OOM killer terminates it, typically after 20–30 minutes. Memory profiling shows millions of event dicts accumulating on the queue object. The Kafka consumer is keeping up with the topic just fine; it's the DB write threads that are the bottleneck.

The on-call engineer already tried increasing the number of DB writer threads from 4 to 16, which delayed the OOM crash but did not eliminate it.

## Buggy code

```python
import queue
import threading
from kafka import KafkaConsumer

EVENT_QUEUE: queue.Queue = queue.Queue()   # no maxsize

def producer(bootstrap_servers: str, topic: str) -> None:
    consumer = KafkaConsumer(topic, bootstrap_servers=bootstrap_servers)
    for msg in consumer:
        EVENT_QUEUE.put(msg.value)

def db_writer() -> None:
    while True:
        event = EVENT_QUEUE.get()
        _write_to_db(event)   # slow I/O
        EVENT_QUEUE.task_done()

def start(bootstrap_servers: str, topic: str, num_writers: int = 4) -> None:
    threading.Thread(target=producer, args=(bootstrap_servers, topic),
                     daemon=True).start()
    for _ in range(num_writers):
        threading.Thread(target=db_writer, daemon=True).start()

def _write_to_db(event) -> None:
    pass  # DB write omitted
```
