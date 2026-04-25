## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — Animation Applied Outside withAnimation Block
// ------------------------------------------------------------------------

struct OnboardingView: View {
    @State private var currentIndex: Int = 0
    private let cards: [OnboardingCard]

    init(cards: [OnboardingCard]) {
        self.cards = cards
    }

    var body: some View {
        ZStack {
            // CHANGE 2: Removed the explicit .animation modifier so the gradient animates through withAnimation like everything else, eliminating the misleading independent animation.
            Color.blue.opacity(Double(currentIndex) * 0.1)

            // CHANGE 1: Use `.id(currentIndex)` to give each card a unique identity so SwiftUI destroys the old view and inserts the new one, allowing the .transition slide animation to fire.
            if currentIndex < cards.count {
                CardView(card: cards[currentIndex])
                    .id(currentIndex)
                    .transition(.asymmetric(
                        insertion: .move(edge: .trailing),
                        removal: .move(edge: .leading)
                    ))
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        Button("Next") {
            withAnimation(.spring()) {
                if currentIndex < cards.count - 1 {
                    currentIndex += 1
                }
            }
        }
    }
}
```

## Explanation

### Issue 1: Card View Identity Prevents Transition

**Problem:** Tapping 'Next' instantly swaps the card content with no slide animation. The card text and image update in place as if there is no transition at all.

**Fix:** Add `.id(currentIndex)` to `CardView` and attach an `.asymmetric` `.transition` using `.move(edge:)` for insertion from the trailing edge and removal to the leading edge. This replaces the missing identity tag and the missing transition declaration at the `CHANGE 1` site.

**Explanation:** SwiftUI decides whether to animate a view swap by checking view identity. When the same `if` branch produces a `CardView` on every render, SwiftUI considers it the same view and just updates its content in place — no insertion or removal occurs, so `.transition` never runs. Attaching `.id(currentIndex)` tells SwiftUI that each index value represents a distinct view: when `currentIndex` changes, the old `CardView` is removed and a new one is inserted, which triggers the transition. Without the `.transition` modifier, SwiftUI would still animate but would use the default fade. A related pitfall is using `ForEach` without a stable `id` parameter — the same identity-collapse problem occurs there and kills transitions in list reordering.

---

### Issue 2: Explicit `.animation` Modifier Masks the Real Problem

**Problem:** The background gradient does animate when `currentIndex` changes, which makes the developer believe `withAnimation` is working. This hides the fact that the card itself is broken, delaying diagnosis.

**Fix:** Remove the `.animation(.easeInOut, value: currentIndex)` call from the `Color.blue` modifier at the `CHANGE 2` site, letting the gradient participate in the `withAnimation(.spring())` block instead.

**Explanation:** `.animation(_:value:)` attached directly to a view creates a self-contained animation scope for that view. It watches `currentIndex` for changes and animates the gradient's opacity independently of any `withAnimation` call. So even when `withAnimation` does nothing useful for the card, the gradient still slides its opacity, giving a false signal that animations are functioning. Removing the explicit modifier means all animated state changes in this view flow through the single `withAnimation(.spring())` call, which is easier to reason about and keeps the spring curve consistent across the whole screen. A leftover `.animation` modifier can also override the curve you pass to `withAnimation`, so keeping both on the same property leads to unpredictable results.
