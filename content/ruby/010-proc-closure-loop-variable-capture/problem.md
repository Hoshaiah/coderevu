---
slug: proc-closure-loop-variable-capture
track: ruby
orderIndex: 10
title: Closure Captures Loop Variable By Reference
difficulty: medium
tags:
  - idioms
  - mutability
  - ruby
language: ruby
---

## Context

`lib/notification/dispatcher.rb` builds a list of deferred notification lambdas during a loop and then invokes them all at the end of a batch job. The intent is that each lambda closes over the `channel` value for that iteration so each notification goes to the right place. This is a pure Ruby library with no Rails dependency.

In production, all notifications in a batch are consistently delivered to only the *last* channel in the list — regardless of how many channels were in the batch. During debugging, printing the lambdas before invocation shows each lambda references the same channel object.

## Buggy code

```ruby
module Notification
  class Dispatcher
    CHANNELS = [
      { name: "email",   adapter: EmailAdapter },
      { name: "sms",     adapter: SmsAdapter },
      { name: "push",    adapter: PushAdapter }
    ]

    def self.build_senders(message)
      senders = []

      CHANNELS.each do |channel|
        senders << lambda { channel[:adapter].deliver(message) }
      end

      senders
    end

    def self.dispatch(message)
      build_senders(message).each(&:call)
    end
  end
end
```
