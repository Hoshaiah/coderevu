---
slug: arc-escaping-closure-self-cycle
track: swift
orderIndex: 33
title: Escaping Closure Captures Self Strongly
difficulty: easy
tags:
  - memory
  - retain-cycle
  - closures
  - arc
language: swift
---

## Context

`Networking/ProfileLoader.swift` is a service class used by `ProfileViewController` to fetch and cache user profile data over the network. Each `ProfileLoader` instance is owned exclusively by its view controller and should be released when the view controller is dismissed. The project uses Instruments periodically to track memory.

QA reported that after navigating away from the Profile screen dozens of times the app's memory footprint keeps climbing. Instruments shows `ProfileLoader` and `ProfileViewController` instances accumulating in the heap and never appearing in the deallocation track.

The networking layer itself (`URLSession`) was ruled out — replacing it with a stub that calls the completion handler synchronously reproduces the leak in a unit test.

## Buggy code

```swift
class ProfileLoader {
    private var cachedProfile: Profile?
    private let session: URLSession
    private var completionHandler: ((Profile?) -> Void)?

    init(session: URLSession = .shared) {
        self.session = session
    }

    func load(url: URL, completion: @escaping (Profile?) -> Void) {
        self.completionHandler = completion
        session.dataTask(with: url) { data, _, _ in
            guard let data = data else {
                self.completionHandler?(nil)
                return
            }
            let profile = try? JSONDecoder().decode(Profile.self, from: data)
            self.cachedProfile = profile
            self.completionHandler?(profile)
        }.resume()
    }
}
```
