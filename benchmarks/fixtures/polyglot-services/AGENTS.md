<!-- MIKK-START -->

<repository_context>
  <name>polyglot-services</name>
  <description>A project with code in 22+ programming languages for testing Mikk parser support</description>
  <stats>
    <files>29</files>
    <functions>71</functions>
    <modules>1</modules>
    <language>polyglot</language>
  </stats>
</repository_context>

<modules>
  <module id="benchmarks-fixtures-polyglot-services">
    <name>Authentication & gRPC</name>
    <location>c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/**</location>
    <purpose>6 files, 0 functions</purpose>
    <entry_points>
      <function signature="main() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/calculator.kt:13]" purpose="Main" />
      <function signature="main() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/main.c:23]" purpose="Main" />
      <function signature="main() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/main.rs:43]" purpose="Main" />
      <function signature="refreshToken(token) [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/jwt.ts:32]" purpose="Refresh token (token)" />
      <function signature="<module>() [c:/users/ansh/desktop/web/mesh/benchmarks/fixtures/polyglot-services/src/models.py:1]" purpose="Module-level initialization code" />
    </entry_points>
    <key_internal_functions>
      <function name="signToken" callers="2" purpose="Sign token (payload)" />
      <function name="add" callers="1" purpose="Add (a: Int, b: Int)" />
      <function name="create_user" callers="1" purpose="Create user" />
      <function name="free_user" callers="1" purpose="Free user" />
      <function name="connect_database" callers="1" purpose="Connect database" />
    </key_internal_functions>
  </module>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `src/models.py` (model)

```python
#!/usr/bin/env python3
"""Main entry point for the application."""


def connect_database():
    """Connect to the database."""
    pass


def is_connected():
    """Check if database is connected."""
    pass


def disconnect_database():
    """Disconnect from the database."""
    pass


def authenticate_user(email: str, password: str) -> bool:
    """Authenticate a user with email and password."""
    pass


def hash_password(password: str) -> str:
    """Hash a password."""
    pass


def verify_password(password: str, hash: str) -> bool:
    """Verify a password against a hash."""
    pass


class User:
    def __init__(self, email: str, name: str):
        self.email = email
        self.name = name

    def get_profile(self):
        """Get user profile."""
        pass


def create_invoice(amount: float) -> dict:
    """Create an invoice."""
    pass


def process_payment(invoice_id: str, amount: float) -> bool:
    """Process payment for an invoice."""
    pass


def error_handler(error: Exception):
    """Handle errors."""
    pass


if __name__ == "__main__":
    connect_database()
```

## File Import Graph

Which files import which — useful for understanding data flow.

### Authentication & gRPC
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/main.c` → `<stdio.h>`, `<stdlib.h>`, `<string.h>`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/main.cpp` → `<iostream>`, `<string>`, `<vector>`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/main.rs` → `std::collections::HashMap`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/UserService.swift` → `Foundation`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/jwt.ts` → `jsonwebtoken`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/service.ts` → `./repository`, `../auth/password`, `../auth/jwt`, `../auth/session`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/main.go` → `fmt`, `log`, `net/http`, `github.com/example/go-service/config`, `github.com/example/go-service/handlers`, `github.com/example/go-service/middleware`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/polyglot-services/src/task.go` → `time`

<!-- MIKK-END -->
