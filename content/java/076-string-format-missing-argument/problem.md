---
slug: string-format-missing-argument
track: java
orderIndex: 76
title: Format String Argument Count Mismatch
difficulty: easy
tags:
  - exceptions
  - nulls
  - correctness
language: java
---

## Context

This audit logger lives in `src/main/java/com/example/audit/AuditLogger.java` and records every successful payment to a rolling log file. It is invoked after a transaction is committed to the database. The format mirrors what the compliance team reads in daily reports.

In production, payment confirmation emails go out successfully but the audit log is completely silent — no entries appear. Monitoring shows that the logger method is being called (a counter increments) but no log lines are written. The application log shows a suppressed `MissingFormatArgumentException` swallowed somewhere inside the utility.

The team initially suspected a file-permission issue but confirmed the log file is writable. They narrowed it down to the `buildAuditLine` method always throwing before it can return a string.

## Buggy code

```java
import java.util.logging.Logger;

public class AuditLogger {

    private static final Logger log = Logger.getLogger(AuditLogger.class.getName());

    // Format: [txId] userId amount currency
    private static final String AUDIT_FMT = "[%s] user=%s amount=%s currency=%s";

    public void recordPayment(String txId, String userId,
                              String amount, String currency) {
        String line = buildAuditLine(txId, userId, amount, currency);
        log.info(line);
    }

    private String buildAuditLine(String txId, String userId,
                                  String amount, String currency) {
        return String.format(AUDIT_FMT, txId, userId, amount);
    }
}
```
