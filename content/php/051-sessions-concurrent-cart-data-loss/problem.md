---
slug: sessions-concurrent-cart-data-loss
track: php
orderIndex: 51
title: Concurrent Writes Corrupt Session Cart
difficulty: hard
tags:
  - sessions
  - concurrency
  - correctness
language: php
---

## Context

This class is `src/Cart/CartService.php` in a PHP e-commerce application using file-based sessions (the PHP default). The `addItem` method is called by an AJAX endpoint that fires when a user clicks 'Add to Cart'. Modern product pages fire multiple simultaneous AJAX requests — one per recommended item row — to provide a responsive UI.

Customers periodically reported that after clicking several 'Add to Cart' buttons in quick succession, only one item appeared in their cart rather than all of them. Support reproduced it reliably by using the browser's dev tools to fire three requests simultaneously. Strangely, refreshing the page sometimes showed different cart contents on successive loads.

The engineering team looked at the database (no issues), the load balancer (sticky sessions configured correctly), and the Redis cache (not used for sessions — still on files). The intermittent nature pointed to a race condition but they were unsure where.

## Buggy code

```php
<?php
// src/Cart/CartService.php

class CartService
{
    public function addItem(int $productId, int $qty): void
    {
        session_start();

        $cart = $_SESSION['cart'] ?? [];
        $cart[$productId] = ($cart[$productId] ?? 0) + $qty;
        $_SESSION['cart'] = $cart;

        session_write_close();
    }

    public function getCart(): array
    {
        session_start();
        $cart = $_SESSION['cart'] ?? [];
        session_write_close();
        return $cart;
    }

    public function removeItem(int $productId): void
    {
        session_start();
        $cart = $_SESSION['cart'] ?? [];
        unset($cart[$productId]);
        $_SESSION['cart'] = $cart;
        session_write_close();
    }
}
```
