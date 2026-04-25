---
slug: observed-object-in-subview-leaked
track: swift
orderIndex: 41
title: ObservableObject Retain Cycle in Closure
difficulty: hard
tags:
  - memory
  - swiftui
  - arc
  - closures
language: swift
---

## Context

This code is in `VideoPlayerViewModel.swift` and `VideoPlayerView.swift`. The view model manages a long-running AVPlayer session including a periodic time observer. The view is presented modally and dismissed when playback ends or the user taps close.

Memory instruments show that after dismissing the video player, the `VideoPlayerViewModel` instance is never deallocated. The AVPlayer and its associated buffers remain in memory. On devices with limited RAM this causes the app to be jetsam-killed when opening more videos in sequence.

The team confirmed that the SwiftUI view itself is being released. The leak is specifically the view model. Adding `print` to `deinit` of `VideoPlayerViewModel` confirmed it is never called.

## Buggy code

```swift
import AVFoundation
import SwiftUI
import Combine

class VideoPlayerViewModel: ObservableObject {
    @Published var currentTime: Double = 0
    let player: AVPlayer
    private var timeObserver: Any?

    init(url: URL) {
        self.player = AVPlayer(url: url)
        setupTimeObserver()
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player.addPeriodicTimeObserver(
            forInterval: interval,
            queue: .main
        ) { [self] time in
            self.currentTime = time.seconds
        }
    }

    deinit {
        if let observer = timeObserver {
            player.removeTimeObserver(observer)
        }
    }
}

struct VideoPlayerView: View {
    @StateObject var viewModel: VideoPlayerViewModel

    var body: some View {
        VideoPlayer(player: viewModel.player)
            .overlay(alignment: .bottom) {
                Text(String(format: "%.1f", viewModel.currentTime))
            }
    }
}
```
