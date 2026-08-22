# Gemini CLI / Claude Code Task Instructions

## Objective

Use **Claude Code** as the primary coding agent to inspect the existing project, understand the requirements, implement the requested task completely, test the implementation, and leave the project in a production-ready state.

The agent must **not blindly modify files**. First understand the existing architecture, conventions, dependencies, and current implementation. Reuse existing patterns wherever possible.

---

## 1. Start by Understanding the Project

Before making changes:

* Inspect the project structure.
* Identify the frontend, backend, database, shared packages, scripts, and configuration.
* Read the relevant `README`, documentation, environment examples, and package manifests.
* Locate the files directly related to the requested task.
* Understand existing APIs, components, services, database models, hooks, utilities, and state-management patterns.
* Check whether the requested functionality already exists partially.
* Avoid duplicating existing functionality.

### Important

Do not immediately start coding.

First create a short internal implementation plan based on the actual repository.

---

## 2. Use Claude Code

The task should be completed using **Claude Code** whenever possible.

Use Claude Code to:

1. Inspect the repository.
2. Understand the existing implementation.
3. Plan the changes.
4. Implement the changes.
5. Review the implementation.
6. Run tests/build/lint/type checks.
7. Fix issues discovered during validation.

Claude Code should work with the repository's existing architecture rather than introducing unnecessary technologies or major structural changes.

---

## 3. Model Selection

Choose the model according to the complexity of the current task.

### Use a stronger/reasoning model when:

* The task requires understanding a large codebase.
* Multiple files or systems are involved.
* Architecture changes are required.
* There are difficult bugs.
* Database/API changes are involved.
* Authentication, payments, security, concurrency, or production infrastructure is involved.
* Existing behavior is unclear.
* A previous implementation failed.
* Significant debugging is required.

### Use a faster/cheaper model when:

* The task is simple.
* The change is isolated.
* The required implementation is obvious.
* Only formatting, small UI changes, simple refactoring, or straightforward code changes are required.

### General rule

**Do not use an expensive model for a trivial task, but do not use a weak model for complex architectural or debugging work.**

If the current model is not suitable for the task, switch to an appropriate Claude Code model before continuing.

---

## 4. Understand Before Changing

Before editing any important file, determine:

* What calls this code?
* What does this code call?
* What data does it receive?
* What data does it return?
* Is it used by multiple features?
* Are there existing abstractions for this functionality?
* Could the change introduce a breaking change?
* Are there database or API compatibility requirements?

Preserve existing behavior unless the task explicitly requires changing it.

---

## 5. Implementation Rules

### Follow the existing project style

Use:

* Existing naming conventions.
* Existing folder structure.
* Existing error-handling patterns.
* Existing API patterns.
* Existing state-management patterns.
* Existing database conventions.
* Existing validation utilities.
* Existing UI components.
* Existing shared utilities.

Do not introduce a new library when an existing dependency already solves the problem.

### Avoid unnecessary changes

Do not:

* Rewrite unrelated files.
* Refactor the entire project unnecessarily.
* Rename unrelated variables/files.
* Change dependencies without a reason.
* Replace working architecture simply because another approach is preferred.
* Remove existing functionality without confirming it is obsolete.

Keep the diff focused on the requested task.

---

## 6. Environment and Secrets

Never hard-code:

* API keys.
* Passwords.
* Tokens.
* Database credentials.
* Private keys.
* Production secrets.

Use the existing environment-variable system.

If an environment variable is required:

* Check whether it already exists.
* Follow the existing `.env.example` convention.
* Add documentation when appropriate.
* Never expose actual secret values.

Do not commit `.env` files or credentials.

---

## 7. Database Changes

If the task requires database changes:

1. Inspect the existing schema.
2. Check existing migrations.
3. Follow the project's migration system.
4. Preserve existing data.
5. Add indexes where appropriate.
6. Consider constraints and foreign keys.
7. Consider backward compatibility.
8. Verify queries against the actual schema.
9. Test the migration when possible.

Do not directly modify production data unless explicitly required.

---

## 8. API Changes

For API changes:

* Inspect existing routes/controllers/services.
* Follow existing request/response formats.
* Validate inputs.
* Handle errors consistently.
* Preserve authentication and authorization.
* Consider rate limiting where relevant.
* Avoid breaking existing clients.
* Update frontend consumers when required.
* Update API documentation when the project has it.

---

## 9. Frontend Changes

For UI/frontend tasks:

* Reuse existing components.
* Follow the existing design system.
* Maintain responsive behavior.
* Handle loading states.
* Handle empty states.
* Handle error states.
* Handle network failures.
* Avoid unnecessary re-renders.
* Preserve accessibility.
* Test the affected user flow.

Do not implement only the happy path.

---

## 10. Backend Changes

For backend tasks:

* Validate input.
* Handle expected failures.
* Return appropriate HTTP status codes.
* Keep business logic in the appropriate service/module.
* Avoid putting large business logic directly inside controllers/routes.
* Consider concurrency and race conditions.
* Consider idempotency for operations that can be retried.
* Preserve existing authentication/authorization behavior.
* Add logging where useful.

---

## 11. Security

Treat security as part of the implementation.

Check for:

* Authentication bypass.
* Authorization issues.
* SQL/NoSQL injection.
* XSS.
* CSRF where applicable.
* Sensitive information leakage.
* Unsafe file uploads.
* Missing input validation.
* Broken access control.
* Insecure direct object references.
* Hard-coded secrets.
* Excessive permissions.
* Rate-limit requirements.

Do not weaken existing security controls just to make the implementation easier.

---

## 12. Testing

After implementation, do not assume the task is complete.

Run the project's available validation commands, such as:

* Unit tests.
* Integration tests.
* End-to-end tests.
* Type checking.
* Linting.
* Formatting checks.
* Build.
* Relevant scripts.

Use the actual commands defined by the repository.

If a test fails:

1. Understand the failure.
2. Determine whether it is caused by your changes.
3. Fix the implementation.
4. Run the test again.
5. Continue until the relevant checks pass.

Do not hide or ignore failures.

---

## 13. Manual Verification

For user-facing functionality, manually verify the affected flow when possible.

Check:

* Normal usage.
* Invalid input.
* Empty state.
* Loading state.
* Error state.
* Authentication state.
* Mobile/responsive behavior when relevant.
* Refresh/reload behavior.
* Repeated actions.
* Network/API failure behavior.

---

## 14. Review the Final Diff

Before declaring the task complete:

Review the complete Git diff.

Look for:

* Accidental changes.
* Debugging code.
* Console logs that should not remain.
* Unused imports.
* Dead code.
* Temporary workarounds.
* Hard-coded values.
* Secrets.
* Incorrect types.
* Broken formatting.
* Unrelated modifications.
* Missing error handling.

Clean everything unnecessary.

---

## 15. Do Not Stop at the First Working Version

The first implementation is not automatically the final implementation.

After the feature works:

* Review the code.
* Simplify where appropriate.
* Check edge cases.
* Check performance.
* Check security.
* Check compatibility.
* Check whether existing functionality was accidentally affected.

The goal is a **complete implementation**, not merely code that appears to work.

---

## 16. If Requirements Are Ambiguous

Do not invent major requirements.

First inspect the repository for clues.

Use:

* Existing code.
* Existing documentation.
* Existing API contracts.
* Existing UI patterns.
* Existing database schema.
* Existing tests.

If ambiguity remains and it materially affects the implementation, ask for clarification.

For minor implementation details, choose the approach that best matches the existing architecture.

---

## 17. If Something Is Already Implemented

Do not rebuild it.

Instead:

1. Locate the existing implementation.
2. Determine what is missing or incorrect.
3. Modify only what is necessary.
4. Preserve working behavior.

---

## 18. Dependency Changes

Before adding a package:

* Check whether the functionality already exists in the project.
* Check whether the standard library can solve it.
* Check existing dependencies.
* Avoid unnecessary package bloat.

If a new dependency is genuinely required, install it using the project's package manager and verify the lockfile changes.

---

## 19. Git Safety

Do not:

* Delete unrelated work.
* Reset unrelated changes.
* Force-reset the repository.
* Overwrite user modifications.
* Commit secrets.

If the working tree already contains user changes, preserve them.

Only modify files necessary for the requested task.

---

## 20. Completion Criteria

The task is complete only when:

* The requested functionality is implemented.
* Existing functionality remains intact.
* Relevant tests pass.
* Type checking passes when applicable.
* Lint/build passes when applicable.
* Errors are handled.
* Edge cases are considered.
* Security implications are considered.
* The final diff has been reviewed.
* No temporary/debug code remains.
* The implementation follows the repository's existing architecture.

---

## 21. Final Response

After completing the task, provide a concise report containing:

### What Changed

List the major changes made.

### Files Changed

List the important files modified or created.

### Validation

Report:

* Tests run.
* Build status.
* Type-check status.
* Lint status.
* Any manual verification performed.

### Issues

If something could not be verified because of environment limitations, clearly state it.

Do not claim a test passed if it was not actually run.

---

## 22. Important Agent Behavior

Always follow this sequence:

```text
Understand
    ↓
Inspect
    ↓
Plan
    ↓
Implement
    ↓
Test
    ↓
Debug
    ↓
Review
    ↓
Validate
    ↓
Report
```

Do not skip directly from the task description to coding.

### Primary principle

**Use the best available model for the complexity of the task, use Claude Code for implementation, make the smallest correct changes, and verify everything before declaring completion.**
