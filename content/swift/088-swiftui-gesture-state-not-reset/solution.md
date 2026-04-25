## Reference solution

```swift
// ------------------------------------------------------------------------
// ANSWER — GestureState Not Reset on Cancel
// ------------------------------------------------------------------------

import SwiftUI

struct DraggableCard: View {
    @State private var finalOffset: CGSize = .zero
    @GestureState private var dragOffset: CGSize = .zero

    var body: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.blue)
            .frame(width: 200, height: 120)
            .offset(
                x: finalOffset.width + dragOffset.width,
                y: finalOffset.height + dragOffset.height
            )
            .gesture(
                DragGesture()
                    .updating($dragOffset) { value, state, _ in
                        state = value.translation
                    }
                    .onEnded { value in
                        finalOffset.width  += value.translation.width
                        finalOffset.height += value.translation.height
                        // CHANGE 1: Removed the erroneous lines that added dragOffset again; by the time onEnded runs, @GestureState has already been reset to .zero, so those additions were either adding zero (normal end) or polluting finalOffset with whatever stale value was captured, causing the jump on the next gesture.
                        // CHANGE 2: Not re-adding dragOffset here also correctly handles cancellation: if the gesture is cancelled (system interrupt), onEnded never fires, @GestureState auto-resets to .zero, and finalOffset is never touched — so the card snaps back cleanly with no accumulated corruption.
                    }
            )
    }
}
```

## Explanation

### Issue 1: Double-counting translation in `onEnded`

**Problem:** After every completed drag, the card ends up displaced by roughly twice the intended amount. Users see the card overshoot its drop position on each release, and the error compounds with every subsequent drag.

**Fix:** Remove the two lines that add `dragOffset.width` and `dragOffset.height` to `finalOffset` inside `onEnded`. Only `value.translation.width` and `value.translation.height` remain, as shown at the CHANGE 1 site.

**Explanation:** `@GestureState` is a SwiftUI-managed property that automatically resets to its initial value (`.zero`) the moment a gesture ends or is cancelled — this reset happens before `onEnded` is invoked. So when `onEnded` runs, `dragOffset` is already `.zero`. Adding it to `finalOffset` adds zero in the normal case, which seems harmless, but the intent was clearly to capture the "in-flight" offset, which is already fully represented by `value.translation`. The real damage surfaces because the developer's mental model was wrong: they believed `dragOffset` still held the final translation at that point, so in any future refactor where `dragOffset` is read before the reset (e.g., inside `updating`), this pattern would silently reintroduce a double-count. The correct single source of truth for the completed translation is `value.translation`, which is what `onEnded` reliably provides.

---

### Issue 2: Corrupted `finalOffset` causes jump after gesture cancellation

**Problem:** When the gesture is interrupted mid-drag (phone call, system alert, Control Center), the card visually snaps back during the interruption (correct behavior), but on the next touch the card jumps to a wrong position rather than starting from where it was last dropped.

**Fix:** Removing the erroneous `dragOffset` additions (CHANGE 2 site) also fixes cancellation. When a gesture is cancelled, `onEnded` never fires and `@GestureState` resets to `.zero` automatically, so `finalOffset` is never modified — the card correctly stays at its last confirmed position.

**Explanation:** The jump-on-next-touch symptom is a downstream effect of the double-add bug in Issue 1. Here is the sequence: the user drags, completes the drag, `onEnded` fires and (with the bug) writes a corrupted `finalOffset`; later, the user is mid-drag and gets a phone call; `dragOffset` resets to `.zero` and `onEnded` is skipped, so `finalOffset` retains its already-corrupted value from the previous drag; the next touch starts from that corrupted base, causing a visible jump. Once the double-add is removed, every successful `onEnded` writes the correct cumulative offset, so cancellations — which leave `finalOffset` untouched — always resume from a valid position. A related pitfall: never read `@GestureState` inside `onEnded` expecting it to hold the in-flight value; always use the `value` parameter passed directly to the closure.
