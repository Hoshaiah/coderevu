## Reference solution

```java
// ------------------------------------------------------------------------
// ANSWER — Mutation on Singleton List Throws
// ------------------------------------------------------------------------

import java.util.ArrayList;
import java.util.List;

public class DefaultConfigProvider {

    // Returns the default list of allowed country codes.
    // Callers may add additional entries.
    public List<String> getAllowedCountries() {
        // CHANGE 1: replaced Collections.singletonList (immutable) with a mutable ArrayList so callers can add entries without UnsupportedOperationException.
        List<String> defaults = new ArrayList<>();
        defaults.add("US");
        return defaults;
    }

    // Simulates what the rule engine setup does with the returned list
    public void exampleCallerUsage() {
        List<String> countries = getAllowedCountries();
        // CHANGE 2: these lines now succeed because getAllowedCountries() returns a mutable list, matching the documented contract.
        countries.add("CA");
        countries.add("MX");
        System.out.println(countries);
    }
}
```

## Explanation

### Issue 1: `singletonList` Is Structurally Immutable

**Problem:** `Collections.singletonList("US")` returns a list implementation that allows reads and index-based access but throws `UnsupportedOperationException` on any structural change — `add`, `remove`, `set`, etc. The rule engine setup phase calls `countries.add("CA")`, which immediately throws, crashing tenant configuration for anyone relying on the default list.

**Fix:** Replace `Collections.singletonList("US")` with a new `ArrayList<>()` that has `"US"` added to it before returning. The method signature stays `List<String>` — only the concrete type returned changes.

**Explanation:** `Collections.singletonList` is a fixed-capacity wrapper around a single element. Its `add` method is inherited from `AbstractList` and always throws `UnsupportedOperationException` — it is not overridden to support mutation. `ArrayList`, by contrast, grows dynamically and supports all `List` mutating methods. The bug is invisible at compile time because both types satisfy the `List<String>` interface; the failure only surfaces at runtime when a mutating method is called. A related pitfall is `List.of(...)` introduced in Java 9, which is also immutable and trips up developers for the same reason.

---

### Issue 2: Method Contract Contradicts Implementation

**Problem:** The Javadoc comment explicitly states "Callers may add additional entries," but the returned list rejects every `add` call. Any engineer reading the comment and trusting it will write code that compiles cleanly and then crashes at runtime, exactly as `RuleEngineSetup.configureCountries()` did.

**Fix:** After the CHANGE 1 fix, the Javadoc comment at the CHANGE 2 site now accurately describes the behaviour — `add` calls succeed on the returned `ArrayList`. No text change to the comment is needed; the implementation is brought into line with what the comment already promises.

**Explanation:** A method comment is a contract between the implementer and the caller. When the implementation violates that contract, callers bear the cost through runtime failures rather than clear compile-time feedback. Fixing the implementation (CHANGE 1) is the right approach here because the stated contract — a mutable list — is exactly what callers need. Alternatively, if the intent were to return an unmodifiable list, the comment would need to be corrected and all callers would need to copy the list themselves before mutating; that would push complexity onto every caller and is the wrong trade-off for a provider that explicitly advertises mutability.
