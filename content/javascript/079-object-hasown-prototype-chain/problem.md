---
slug: object-hasown-prototype-chain
track: javascript
orderIndex: 79
title: hasOwnProperty Bypassed via Prototype
difficulty: hard
tags:
  - security
  - prototype-pollution
  - correctness
language: javascript
---

## Context

This middleware in `middleware/permissions.js` checks whether the authenticated user has a required permission before allowing access to a route. Permissions are stored as a plain object keyed by permission name. The `hasPermission` helper is used in dozens of routes across the admin panel.

A penetration tester discovered that sending `{ "permission": "__proto__" }` in a crafted request body grants unauthorized access to protected routes. The developer believed the `in` operator check was sufficient and that only admins could create permission objects.

Git history shows that a previous fix tried using `obj.hasOwnProperty(key)` but was reverted because it failed when the permissions object was created with `Object.create(null)`.

## Buggy code

```javascript
/**
 * Checks whether a user's permission map contains a given permission.
 * @param {object} permissions - e.g. { read: true, write: false }
 * @param {string} permission
 * @returns {boolean}
 */
function hasPermission(permissions, permission) {
  return permission in permissions && permissions[permission] === true;
}

function requirePermission(permission) {
  return (req, res, next) => {
    const userPermissions = req.user.permissions;
    if (!hasPermission(userPermissions, permission)) {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  };
}

module.exports = { hasPermission, requirePermission };
```
