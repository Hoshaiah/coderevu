---
slug: comparator-integer-subtraction-overflow
track: java
orderIndex: 48
title: Comparator Subtraction Integer Overflow
difficulty: medium
tags:
  - collections
  - correctness
  - exceptions
language: java
---

## Context

This leaderboard utility lives in `src/main/java/com/example/game/Leaderboard.java`. It sorts player scores to determine ranking for end-of-season rewards. Scores are stored as plain `int` values that can range from `Integer.MIN_VALUE` to `Integer.MAX_VALUE` in tournament modes that apply large penalties.

During the annual tournament, the leaderboard produces wrong rankings — top players appear in the middle of the list and bottom players appear at the top. The issue does not reproduce in normal play because scores stay in a safe range. QA can reproduce it reliably by inserting a player with a very negative penalty score alongside players with large positive scores.

The team inspected the comparator and noticed the subtraction-based shortcut used for integer comparison. They assumed it was a standard optimization they had seen in older textbooks.

## Buggy code

```java
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

public class Leaderboard {

    public static class Player {
        final String name;
        final int score;
        Player(String name, int score) {
            this.name = name;
            this.score = score;
        }
    }

    private final List<Player> players = new ArrayList<>();

    public void addPlayer(Player p) {
        players.add(p);
    }

    // Sort descending: highest score first
    public List<Player> getRankings() {
        players.sort((a, b) -> b.score - a.score);
        return new ArrayList<>(players);
    }
}
```
