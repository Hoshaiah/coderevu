---
slug: deque-peek-null-on-empty
track: java
orderIndex: 57
title: Null Peek on Empty Deque
difficulty: easy
tags:
  - nulls
  - collections
  - api-misuse
language: java
---

## Context

`src/main/java/com/acme/parser/TokenStream.java` is part of an in-house expression parser. The stream wraps a `ArrayDeque<Token>` and offers a `current()` method that is supposed to return the next token without consuming it. Callers check `current().type()` before deciding whether to call `consume()`.

The parser crashes with a `NullPointerException` on certain valid inputs where the token stream is legitimately exhausted before all parse branches have run. The NPE has no useful stack frame pointing at the obvious null dereference because the crash happens inside a chain like `stream.current().type() == TokenType.EOF`.

The team verified the crash is not caused by a missing EOF token at the end of input — the tokenizer always appends one. The problem appears only when the deque has been fully consumed before the EOF token is processed.

## Buggy code

```java
import java.util.ArrayDeque;
import java.util.Deque;

public class TokenStream {
    private final Deque<Token> tokens;

    public TokenStream(Iterable<Token> source) {
        this.tokens = new ArrayDeque<>();
        for (Token t : source) {
            tokens.addLast(t);
        }
    }

    public Token current() {
        return tokens.peek();
    }

    public Token consume() {
        return tokens.poll();
    }

    public boolean hasMore() {
        return !tokens.isEmpty();
    }
}
```
