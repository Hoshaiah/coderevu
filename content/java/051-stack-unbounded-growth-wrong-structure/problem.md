---
slug: stack-unbounded-growth-wrong-structure
track: java
orderIndex: 51
title: Deque Used as Stack Pops Wrong End
difficulty: medium
tags:
  - collections
  - exceptions
  - correctness
language: java
---

## Context

This expression evaluator lives in `src/main/java/com/acme/formula/ExpressionEvaluator.java`. It implements a simple reverse-Polish notation (RPN) calculator used by a spreadsheet-like formula engine. Operands are pushed as they are encountered and popped when an operator is processed.

Formula results are silently incorrect for any expression longer than two operands. For example, `3 4 5 + *` should yield `27` (4+5=9, 3*9=27) but returns `15` (3+4=7? No — it returns results that don't match any valid interpretation). No exception is thrown; the engine just returns wrong numbers.

A developer added logging of every push and pop and confirmed the pushes are in the right order, but the pops are retrieving operands in the wrong order relative to what was pushed.

## Buggy code

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class ExpressionEvaluator {

    public double evaluate(String[] tokens) {
        Deque<Double> stack = new ArrayDeque<>();

        for (String token : tokens) {
            switch (token) {
                case "+": {
                    double b = stack.removeFirst();
                    double a = stack.removeFirst();
                    stack.addLast(a + b);
                    break;
                }
                case "*": {
                    double b = stack.removeFirst();
                    double a = stack.removeFirst();
                    stack.addLast(a * b);
                    break;
                }
                default:
                    stack.addLast(Double.parseDouble(token));
            }
        }
        return stack.removeFirst();
    }
}
```
