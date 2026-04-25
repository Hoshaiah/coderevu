---
slug: completablefuture-exception-ignored
track: java
orderIndex: 85
title: CompletableFuture Exception Silently Dropped
difficulty: medium
tags:
  - exceptions
  - concurrency
  - async
language: java
---

## Context

This background worker lives in `src/main/java/com/acme/notifications/EmailDispatcher.java`. It's called from a Spring `@Scheduled` task every 30 seconds to flush a queue of pending notification emails. The method fires each send asynchronously and is expected to log failures so the ops team can investigate.

Operators notice that some emails are silently never delivered — the queue shrinks but delivery receipts are missing from the downstream email service, and nothing appears in the error log. Enabling verbose logging at the email client level confirms that exceptions are being thrown during SMTP handshake, but the dispatcher never logs them.

The developer already verified that the `emailClient.send()` method does throw a checked `MessagingException` on failure and that the executor is healthy.

## Buggy code

```java
import java.util.List;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.logging.Logger;

public class EmailDispatcher {
    private static final Logger LOG = Logger.getLogger(EmailDispatcher.class.getName());
    private final ExecutorService executor = Executors.newFixedThreadPool(4);
    private final EmailClient emailClient;

    public EmailDispatcher(EmailClient emailClient) {
        this.emailClient = emailClient;
    }

    public void flush(List<EmailMessage> queue) {
        for (EmailMessage msg : queue) {
            CompletableFuture.runAsync(() -> {
                try {
                    emailClient.send(msg);
                } catch (Exception e) {
                    LOG.severe("Failed to send email: " + e.getMessage());
                }
            }, executor);
        }
    }

    interface EmailClient {
        void send(EmailMessage msg) throws Exception;
    }

    static class EmailMessage {
        String to;
        String body;
    }
}
```
