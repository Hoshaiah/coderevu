---
slug: optional-dictionary-subscript-silent-default
track: swift
orderIndex: 12
title: Optional Dictionary Subscript Wrong Default
difficulty: easy
tags:
  - optionals
  - dictionary
  - correctness
language: swift
---

## Context

This code lives in `ScoreTracker.swift`, part of a trivia game app. The tracker maintains a dictionary mapping player IDs to scores, and provides a helper that adds bonus points to a player's running total. The function is called from a game session controller whenever a player earns a bonus.

Testers notice that bonus points are sometimes silently lost. A player who has never scored before should start with 0 and have the bonus added, but instead their final score is always exactly the bonus value with no accumulation across multiple calls. Players who already have a score do accumulate correctly.

The team checked the call sites and confirmed `addBonus` is called the correct number of times. The dictionary itself is being read back correctly afterward. The bug was introduced when a developer refactored the nil-coalescing logic to look more concise.

## Buggy code

```swift
class ScoreTracker {
    private var scores: [String: Int] = [:]

    func addBonus(_ bonus: Int, to playerID: String) {
        scores[playerID] = (scores[playerID] ?? bonus) + bonus
    }

    func score(for playerID: String) -> Int {
        return scores[playerID] ?? 0
    }

    func topPlayer() -> String? {
        return scores.max(by: { $0.value < $1.value })?.key
    }
}
```
