## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Stale State Capture in Button Action
// ------------------------------------------------------------------------

struct CartView: View {
    @State private var promoCode: String = ""
    let onCheckout: (String) -> Void

    var body: some View {
        VStack {
            // CHANGE 2: Disable autocorrection so the system never holds back uncommitted suggestions that would be missing from promoCode when the button fires.
            TextField("Promo code", text: $promoCode)
                .textFieldStyle(.roundedBorder)
                .autocorrectionDisabled(true)
                .textInputAutocapitalization(.never)

            Button("Checkout") {
                // CHANGE 1: Read promoCode through the projected @State binding's wrappedValue at call time rather than capturing the value from the last render, ensuring we always get the latest committed text.
                let code = _promoCode.wrappedValue
                onCheckout(code)
            }
        }
        .padding()
    }
}
```

## Explanation

### Issue 1: Stale Value Captured in Button Closure

**Problem:** Users tap Checkout immediately after typing a promo code and the server receives `promoCode: ""`. The promo code is visible in the text field but does not appear in the POST body. The bug is intermittent and harder to hit on fast devices because rendering catches up sooner.

**Fix:** Replace `let code = promoCode` with `let code = _promoCode.wrappedValue` inside the button action. `_promoCode` is the `State<String>` storage property synthesized by the `@State` macro; reading `.wrappedValue` on it at call time fetches the authoritative current value from SwiftUI's state graph rather than whatever copy was captured during the last render pass.

**Explanation:** `@State` in SwiftUI works by storing the real value in an internal node in the framework's state graph. When Swift evaluates `body`, it dereferences the wrapper and hands the current `String` value to every expression in that `body` call — including the closure literal you write for `Button`'s `action` parameter. That closure captures the `String` value (a value type) at the moment `body` runs, not at the moment the user taps. If the user types a character and taps the button before the next render cycle completes, `body` has not run again yet, so the captured `String` is still the older value — potentially the empty initial value. Reading `_promoCode.wrappedValue` bypasses the captured copy and goes directly to the state node, which is always up to date the instant `TextField` commits a change. A related pitfall: the same stale-capture issue can occur with any value-type `@State` or `@Binding` inside long-lived closures such as `Task { }` blocks, so the same `_property.wrappedValue` pattern applies there too.

---

### Issue 2: Autocorrection Holds Uncommitted Text Outside `promoCode`

**Problem:** When the user types a promo code like `SAVE20`, the iOS autocorrection engine can temporarily hold the text in an in-flight suggestion buffer that has not yet been committed to the `$promoCode` binding. If the button fires at that instant, `promoCode` still contains whatever was last committed — sometimes the empty string from the initial state.

**Fix:** Add `.autocorrectionDisabled(true)` and `.textInputAutocapitalization(.never)` to the `TextField`. These modifiers tell UIKit's text input system to bypass the suggestion pipeline entirely, so every keystroke is committed to the `$promoCode` binding immediately rather than sitting in the autocorrection buffer.

**Explanation:** UIKit's text input system processes keystrokes in two phases: it first stores the raw input in a composing/suggestion buffer, then commits it to the bound value once the user accepts or dismisses the suggestion. SwiftUI's `TextField` with `$promoCode` only receives the value after that commit step. For prose text fields this delay is imperceptible, but for short codes typed quickly the commit may not have happened yet when the button action runs. Disabling autocorrection collapses the two phases into one: every character is committed directly, so `promoCode` (and therefore `_promoCode.wrappedValue`) is always in sync with what the user typed. The same latency can appear when the software keyboard is mid-gesture on a physical device, which is why the bug reproduces more reliably on slower hardware where the render and input pipelines fall further out of step.
