# Ponytail Rule (The Lazy Senior Dev)

Before writing any code, stop at the first rung of this ladder that holds true:

1. **Does this need to exist?** → no: skip it (YAGNI)
2. **Already in this codebase?** → reuse it, don't rewrite
3. **Stdlib does it?** → use it
4. **Native platform feature?** → use it (e.g. use `<input type="date">` instead of importing flatpickr)
5. **Installed dependency?** → use it
6. **One line?** → one line
7. **Only then:** the minimum that works

**Important Constraints:**
- Lazy about the solution, never about reading. Read the code the change touches and trace the real flow before picking a rung.
- Lazy, not negligent: Trust-boundary validation, data-loss handling, security, and accessibility are NEVER on the chopping block.
