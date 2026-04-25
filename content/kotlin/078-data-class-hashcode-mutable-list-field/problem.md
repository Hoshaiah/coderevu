---
slug: data-class-hashcode-mutable-list-field
track: kotlin
orderIndex: 78
title: "Data Class HashCode Changes After Insert"
difficulty: medium
tags: ["collections", "correctness", "kotlin-idioms"]
language: kotlin
---

## Context

This caching layer lives in `cache/QueryCache.kt` and indexes query results by a `QueryKey` data class that holds the query string and a list of filter tags. The cache uses a `HashMap<QueryKey, List<Result>>` as the backing store. The design was chosen for ergonomics: callers construct a `QueryKey` and use it directly as a map key.

In production, cached results are occasionally not found even when the exact same query was recently executed. The cache hit rate is far below the expected 80%, causing redundant database queries. Metrics show the cache is being populated correctly, but lookups return `null` for keys that should be present.

The team added debug logging and confirmed that the same `QueryKey` object is both inserted and looked up. They ruled out race conditions because the cache is accessed from a single thread. The bug appears specifically when filter tags are added to the key after it has been used to insert into the map.

## Buggy code

```kotlin
data class QueryKey(
    val query: String,
    val filters: MutableList<String>  // mutable list as data class field
)

data class Result(val id: Int, val value: String)

class QueryCache {
    private val cache = HashMap<QueryKey, List<Result>>()

    fun put(key: QueryKey, results: List<Result>) {
        cache[key] = results
    }

    fun get(key: QueryKey): List<Result>? {
        return cache[key]
    }
}

fun main() {
    val cache = QueryCache()
    val key = QueryKey("SELECT *", mutableListOf("active"))
    cache.put(key, listOf(Result(1, "foo")))

    // Caller adds a filter tag after insertion
    key.filters.add("premium")

    // Lookup fails: hashCode changed because filters list changed
    println(cache.get(key))  // prints null
}
```
