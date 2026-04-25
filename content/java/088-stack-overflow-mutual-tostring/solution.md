## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Mutual toString Causes Stack Overflow
// ------------------------------------------------------------------------

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
        // CHANGE 1: Reference only customer.id instead of the full customer object to break the mutual recursion between Order.toString and Customer.toString.
        return "Order{id=" + id + ", customerId=" + (customer != null ? customer.getId() : "null") + ", amount=" + amount + "}";
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

        public long getId() {
            return id;
        }

        @Override
        public String toString() {
            // CHANGE 2: Replace orders list expansion with just the count of orders to prevent each Order's toString from calling back into Customer.toString.
            return "Customer{id=" + id + ", name=" + name + ", orderCount=" + (orders != null ? orders.size() : 0) + "}";
        }
    }
}
```

## Explanation

### Issue 1: Mutual Recursion Between toString Methods

**Problem:** Calling `toString` on an `Order` object triggers `Customer.toString` (because the `customer` field is concatenated directly into the string). `Customer.toString` then concatenates the `orders` list, which triggers `toString` on each `Order` in that list, which calls `Customer.toString` again. The JVM stack grows until it throws `StackOverflowError`, which kills the logging thread and swallows the original exception.

**Fix:** In `Order.toString`, replace `", customer=" + customer` with `", customerId=" + customer.getId()`. This calls only the primitive `long` getter and never invokes `Customer.toString`.

**Explanation:** Java's string concatenation operator (`+`) calls `toString()` on any non-primitive object automatically. So writing `"..." + customer` is exactly the same as writing `"..." + customer.toString()`. When `Order.toString` does this, it enters `Customer.toString`. Inside `Customer.toString`, iterating the orders list (via `List.toString`) again calls `Order.toString` on each element. Each of those calls re-enters `Customer.toString`, and so on until the stack is exhausted. Substituting `customer.getId()` returns a `long`, which Java converts to a string directly without any method dispatch on the `Customer` object, so the cycle is broken at its source.

---

### Issue 2: Customer.toString Expands the Orders Collection

**Problem:** Even if `Order.toString` were fixed in isolation, `Customer.toString` still passes the full `orders` list to string concatenation. This calls `List.toString`, which calls `toString` on every `Order` in the list. Any code that logs a `Customer` directly hits the same recursive chain.

**Fix:** In `Customer.toString`, replace `", orders=" + orders` with `", orderCount=" + orders.size()`. This reads a single integer from the list without iterating element `toString` calls.

**Explanation:** `List.toString` is implemented by `AbstractCollection.toString`, which iterates every element and calls `toString` on each one. If those elements are `Order` objects that reference back to this `Customer`, the mutual call chain starts again. Using `orders.size()` never touches element `toString` at all, so there is no re-entry into `Order.toString`. A related pitfall to keep in mind: Lombok's `@Data` or `@ToString` annotations auto-generate `toString` methods that include all fields by default, and bidirectional JPA relationships annotated with those will reproduce this exact bug unless you annotate one side with `@ToString.Exclude`.
