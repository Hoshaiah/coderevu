## Reference solution

```csharp
// ------------------------------------------------------------------------
// ANSWER — Creating a new HttpClient per request exhausts socket connections under load
// ------------------------------------------------------------------------
public class PricingService
{
    private readonly string _baseUrl;

    // CHANGE 3: Accept IHttpClientFactory instead of constructing HttpClient directly; the factory manages a pool of HttpMessageHandler instances with controlled lifetimes, so DNS changes are respected and sockets are reused safely across requests.
    private readonly IHttpClientFactory _httpClientFactory;

    public PricingService(string baseUrl, IHttpClientFactory httpClientFactory)
    {
        _baseUrl = baseUrl;
        _httpClientFactory = httpClientFactory;
    }

    public async Task<decimal> GetPriceAsync(string sku)
    {
        // CHANGE 1: Create the client via the factory rather than `new HttpClient()`. The factory reuses pooled HttpMessageHandler instances, so sockets enter TIME_WAIT far less frequently and the OS port pool is not exhausted under load.
        var client = _httpClientFactory.CreateClient();

        // CHANGE 1 (continued): Do NOT dispose the factory-created client in a `using` block;
        // disposing it does not dispose the underlying handler, but wrapping in `using` is
        // misleading and can mask lifecycle issues — leave lifetime to the factory.
        client.BaseAddress = new Uri(_baseUrl);

        // CHANGE 2: Use TryAddWithoutValidation (or set the header once at named-client registration time) so repeated calls do not throw InvalidOperationException when the "Accept" header is already present on a reused or pre-configured client.
        client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json");

        var response = await client.GetAsync($"/prices/{sku}");
        response.EnsureSuccessStatusCode();

        var json = await response.Content.ReadAsStringAsync();
        return JsonSerializer.Deserialize<PriceResponse>(json).Amount;
    }
}
```

## Explanation

### Issue 1: Per-request HttpClient socket exhaustion

**Problem:** Every call to `GetPriceAsync` constructs and disposes a fresh `HttpClient`. Under moderate load this creates hundreds of TCP connections per second. Each disposed connection enters the OS TIME_WAIT state for up to 4 minutes, holding a local port. When the ephemeral port range (~16 000–65 535) is exhausted, the OS throws `SocketException: Only one usage of each socket address is normally permitted`. Restarting the service clears the held ports temporarily.

**Fix:** Replace `new HttpClient()` with `_httpClientFactory.CreateClient()` (injected `IHttpClientFactory`). Remove the `using` wrapper so the client object is not explicitly disposed inside the method.

**Explanation:** `HttpClient` is designed to be long-lived. The expensive resource is the underlying `HttpMessageHandler`, not the `HttpClient` wrapper itself. `IHttpClientFactory` maintains a pool of handlers with a configurable lifetime (default 2 minutes). Multiple `HttpClient` instances created via the factory share pooled handlers, so open sockets are reused across requests rather than torn down after each one. Disposing the `HttpClient` returned by the factory does not dispose its pooled handler, so the `using` block is not harmful per se, but it is misleading — the factory recycles the handler on its own schedule regardless.

---

### Issue 2: Duplicate Accept header on shared client

**Problem:** `DefaultRequestHeaders.Add("Accept", "application/json")` is called on every request. If the same `HttpClient` instance is reused (as it will be with the factory or any singleton approach), the second call throws `InvalidOperationException: Misused header name` or silently adds a duplicate `Accept` value depending on the .NET version, corrupting subsequent requests.

**Fix:** Replace `client.DefaultRequestHeaders.Add(...)` with `client.DefaultRequestHeaders.TryAddWithoutValidation("Accept", "application/json")`. Alternatively, configure the header once at named-client registration time in `AddHttpClient<PricingService>()`.

**Explanation:** `DefaultRequestHeaders.Add` does not check for existing values before inserting. On a newly constructed client it works fine, which is why staging tests pass. On a reused or pre-configured client the header is already present, and `Add` appends a second value, producing a malformed `Accept: application/json, application/json` header or throwing. `TryAddWithoutValidation` skips the insert when the header already exists, making the call idempotent. The cleanest long-term fix is to register the header in the DI configuration (`services.AddHttpClient(...)`) so it is set exactly once at startup.

---

### Issue 3: No IHttpClientFactory means DNS changes are ignored

**Problem:** Without `IHttpClientFactory`, any long-lived `HttpClient` singleton holds a `HttpMessageHandler` that caches the DNS resolution for `_baseUrl`. If the downstream pricing service's IP address changes (e.g., a Kubernetes pod restart or a load-balancer failover), the cached handler keeps sending traffic to the old IP until the process restarts.

**Fix:** Inject `IHttpClientFactory` via the constructor and call `_httpClientFactory.CreateClient()`. Register it in the DI container with `services.AddHttpClient()` (or a named/typed variant).

**Explanation:** `IHttpClientFactory` rotates its pooled `HttpMessageHandler` instances on a configurable interval (default 2 minutes). Each new handler performs a fresh DNS lookup when it first connects. This means the service automatically starts routing to updated IPs within a few minutes of a DNS change, with no restart required. The factory also integrates with `ILogger` and Polly middleware, which are useful for retry and circuit-breaker policies on downstream HTTP calls.
