---
slug: stack-overflow-mutual-tostring
track: java
orderIndex: 88
title: Mutual toString Causes Stack Overflow
difficulty: medium
tags:
  - exceptions
  - nulls
  - correctness
language: java
---

## Context

These two classes live in `src/main/java/com/example/model/Order.java` and `src/main/java/com/example/model/Customer.java`. They are JPA entities that also need human-readable string representations for logging. The relationship is bidirectional: an `Order` holds a reference to its `Customer`, and a `Customer` holds a list of their `Order`s.

In production, any log statement that touches an `Order` or `Customer` object causes a `StackOverflowError`. The JVM crashes the logging thread. Because logging is used in exception handlers, the original exception is lost and the incident is nearly invisible in the monitoring dashboard.

The team has ruled out infinite loops in business logic. The stack trace in the crash shows alternating frames of `Order.toString` and `Customer.toString` repeating thousands of times.

## Buggy code

```java
import java.util.List;

public class Order {
    private final long id;
    private final Customer customer;
    private final double amount;

    public Order(long id, Customer customer, double amount) {
        this.id = id;
        this.customer = customer;
        this.amount = amount;
    }

    @Override
    public String toString() {
        return "Order{id=" + id + ", customer=" + customer + ", amount=" + amount + "}";
    }

    // Customer class embedded for self-contained snippet
    static class Customer {
        private final long id;
        private final String name;
        private final List<Order> orders;

        public Customer(long id, String name, List<Order> orders) {
            this.id = id;
            this.name = name;
            this.orders = orders;
        }

        @Override
        public String toString() {
            return "Customer{id=" + id + ", name=" + name + ", orders=" + orders + "}";
        }
    }
}
```
