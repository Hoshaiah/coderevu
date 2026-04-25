---
slug: map-getordefault-mutable-default
track: java
orderIndex: 50
title: Shared Mutable Default in getOrDefault
difficulty: medium
tags:
  - collections
  - concurrency
  - correctness
language: java
---

## Context

This aggregation helper lives in `src/main/java/com/acme/analytics/TagAggregator.java`. It groups event IDs by tag and is called from a reporting pipeline that processes millions of events per batch. The intent is to return a map from tag name to a list of event IDs.

The reporting team notices that the produced report occasionally shows the same event ID under multiple tags it was never associated with. The corruption is sporadic and seems to affect tags that appear earlier in the alphabet more than later ones. No concurrency is involved — the method is called on a single thread.

A developer added assertions checking that the input list contains no duplicates, and confirmed the inputs are clean. The duplication is introduced by `buildIndex` itself.

## Buggy code

```java
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

public class TagAggregator {

    public Map<String, List<String>> buildIndex(List<Event> events) {
        Map<String, List<String>> index = new HashMap<>();
        List<String> empty = new ArrayList<>();

        for (Event event : events) {
            for (String tag : event.getTags()) {
                List<String> ids = index.getOrDefault(tag, empty);
                ids.add(event.getId());
                index.put(tag, ids);
            }
        }
        return index;
    }

    public static class Event {
        private final String id;
        private final List<String> tags;
        public Event(String id, List<String> tags) {
            this.id = id;
            this.tags = tags;
        }
        public String getId()          { return id; }
        public List<String> getTags()  { return tags; }
    }
}
```
