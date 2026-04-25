---
slug: treemap-wrong-comparator-order
track: java
orderIndex: 35
title: Reversed Comparator Loses Map Entries
difficulty: easy
tags:
  - collections
  - comparator
  - correctness
language: java
---

## Context

This utility lives in `src/main/java/com/acme/analytics/TopScores.java` and is part of a leaderboard service. It maintains the top N player scores using a `TreeMap` keyed by score, so scores can be iterated in ranked order. The method `addScore` inserts a new entry and prunes the map if it grows beyond the configured capacity.

In QA, testers noticed that the leaderboard sometimes shows fewer entries than expected, and occasionally a high-scoring player disappears from the board entirely after a lower-scoring player is added. The map never seems to grow beyond one entry in some test runs.

The team checked the pruning logic and confirmed `maxSize` is set correctly. They also verified that `scores.size()` is being read after the put, not before.

## Buggy code

```java
import java.util.Map;
import java.util.TreeMap;

public class TopScores {
    private final int maxSize;
    private final TreeMap<Integer, String> scores;

    public TopScores(int maxSize) {
        this.maxSize = maxSize;
        // Descending order so the highest score is first
        this.scores = new TreeMap<>((a, b) -> a - b);
    }

    public void addScore(int score, String playerName) {
        scores.put(score, playerName);
        if (scores.size() > maxSize) {
            scores.pollFirstEntry();
        }
    }

    public Map<Integer, String> getTopScores() {
        return scores;
    }
}
```
