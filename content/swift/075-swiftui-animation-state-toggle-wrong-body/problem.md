---
slug: swiftui-animation-state-toggle-wrong-body
track: swift
orderIndex: 75
title: Animation Applied Outside withAnimation Block
difficulty: easy
tags:
  - swiftui
  - animation
  - state
  - correctness
language: swift
---

## Context

`Views/OnboardingView.swift` shows a series of onboarding cards. When the user taps 'Next', the current card should slide out to the left and the next card slide in from the right using a Spring animation. The developer reads `currentIndex` from `@State` and wraps its mutation in an animation block.

During QA, the animator noticed that the card content updates instantly with no animation, while an unrelated opacity modifier on a background gradient does animate. Removing the gradient entirely does not fix the card transition. The view hierarchy was audited and the animation modifier is present.

The developer already confirmed that `withAnimation` is being called and the state mutation is inside the trailing closure, so they are puzzled why the main content is not animating.

## Buggy code

```swift
struct OnboardingView: View {
    @State private var currentIndex: Int = 0
    private let cards: [OnboardingCard]

    init(cards: [OnboardingCard]) {
        self.cards = cards
    }

    var body: some View {
        ZStack {
            Color.blue.opacity(Double(currentIndex) * 0.1)
                .animation(.easeInOut, value: currentIndex)

            if currentIndex < cards.count {
                CardView(card: cards[currentIndex])
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
