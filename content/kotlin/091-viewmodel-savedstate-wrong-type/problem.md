---
slug: viewmodel-savedstate-wrong-type
track: kotlin
orderIndex: 91
title: SavedStateHandle Wrong Type Crash
difficulty: medium
tags:
  - android
  - viewmodel
  - nullability
language: kotlin
---

## Context

This is in `ui/ProductDetailViewModel.kt` in an Android e-commerce app. The ViewModel receives a product ID from navigation arguments via `SavedStateHandle`. The navigation graph defines `productId` as a `Long` argument. The app targets API 21+ and uses the Jetpack Navigation component with Safe Args.

The app crashes with `ClassCastException: java.lang.Integer cannot be cast to java.lang.Long` on certain devices — specifically older phones running Android 8 or below — but works fine on Android 9+. The crash happens immediately when navigating to the product detail screen.

## Buggy code

```kotlin
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.launch

class ProductDetailViewModel(
    savedStateHandle: SavedStateHandle,
    private val repository: ProductRepository
) : ViewModel() {

    private val productId: Long = savedStateHandle["productId"]!!

    init {
        viewModelScope.launch {
            repository.loadProduct(productId)
        }
    }
}
```
