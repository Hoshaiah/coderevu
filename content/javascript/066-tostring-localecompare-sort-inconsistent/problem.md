---
slug: tostring-localecompare-sort-inconsistent
track: javascript
orderIndex: 66
title: Locale-Sensitive Sort Non-Deterministic
difficulty: easy
tags:
  - state
  - correctness
  - internationalization
language: javascript
---

## Context

The file `src/utils/sortContacts.js` provides a function used throughout a CRM application to sort contact records alphabetically by last name. The sorted list is displayed in the UI and also used to build a paginated query: the server uses the position of the last seen item as a cursor.

Users in Germany and Turkey report that the sort order displayed in their browser is different from the sort order computed by the Node.js API server, causing pagination to skip or duplicate contacts. Users with default English locale settings don't experience the problem.

The team verified the data is identical on both ends and ruled out network issues. They noticed the discrepancy only appears for names containing characters like `ö`, `ü`, `İ`, and `ß`.

## Buggy code

```javascript
/**
 * Sorts an array of contact objects alphabetically by lastName.
 * Returns a new array; does not mutate the input.
 *
 * @param {Array<{id: string, firstName: string, lastName: string}>} contacts
 * @returns {Array}
 */
function sortContacts(contacts) {
  return contacts.slice().sort((a, b) => {
    if (a.lastName.toLocaleLowerCase() < b.lastName.toLocaleLowerCase()) return -1;
    if (a.lastName.toLocaleLowerCase() > b.lastName.toLocaleLowerCase()) return 1;
    return 0;
  });
}

module.exports = { sortContacts };
```
