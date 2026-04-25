---
slug: requests-session-not-reused
track: python
orderIndex: 91
title: HTTP Session Created Per Request
difficulty: easy
tags:
  - perf
  - http
  - resource-management
language: python
---

## Context

`integrations/weather_client.py` fetches weather data from a third-party REST API. It's called in a tight loop inside a data-enrichment pipeline that processes roughly 50,000 records per hour. Each call fetches a single endpoint with authentication headers. The client was written quickly for a prototype and never revisited.

The pipeline owner noticed that enrichment throughput is about 3× lower than expected, and the third-party API support team reported that they're seeing an unusually high volume of TCP connection establishments from this client's IP — far more than the number of actual API calls would require. Latency is also higher than the API's documented p99.

A network trace confirmed that a new TCP handshake (and TLS handshake) is performed for every single API call. Connection pooling is never used even though the library supports it.

## Buggy code

```python
import requests

API_BASE = "https://api.weather-example.com/v2"
API_KEY = "secret-api-key"

def fetch_weather(lat: float, lon: float) -> dict:
    """
    Fetch current conditions for the given coordinates.
    """
    response = requests.get(
        f"{API_BASE}/current",
        params={"lat": lat, "lon": lon},
        headers={"X-Api-Key": API_KEY},
        timeout=10,
    )
    response.raise_for_status()
    return response.json()

def enrich_records(records: list[dict]) -> list[dict]:
    for record in records:
        weather = fetch_weather(record["lat"], record["lon"])
        record["weather"] = weather
    return records
```
