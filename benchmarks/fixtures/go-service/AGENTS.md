<repository_context>
  <name>go-service</name>
  <description>Go REST API with auth and task management</description>
  <stats>
    <files>9</files>
    <functions>22</functions>
    <modules>0</modules>
    <language>go</language>
  </stats>
</repository_context>

<modules>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `models/task.go` (config)

```go
﻿package models

import "time"

type TaskStatus string

const (
	TaskPending    TaskStatus = "pending"
	TaskInProgress TaskStatus = "in_progress"
	TaskDone       TaskStatus = "done"
)

type Task struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      TaskStatus `json:"status"`
	OwnerID     string     `json:"owner_id"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateTaskRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}
```

### `models/user.go` (config)

```go
﻿package models

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	User  UserPublic `json:"user"`
	Token string     `json:"token"`
}

type UserPublic struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}
```

## HTTP Routes

- **ANY** `/health` → `handlers.HealthCheck` *(main.go:21)*
- **ANY** `/users/register` → `userHandler.Register` *(main.go:22)*
- **ANY** `/users/login` → `userHandler.Login` *(main.go:23)*

<!-- MIKK-START -->

<repository_context>
  <name>go-service</name>
  <description>Go REST API with auth and task management</description>
  <stats>
    <files>9</files>
    <functions>22</functions>
    <modules>0</modules>
    <language>go</language>
  </stats>
</repository_context>

<modules>
</modules>

## Data Models & Schemas

These files define the project's data structures, schemas, and configuration.
They are auto-discovered and included verbatim from the source.

### `models/task.go` (config)

```go
﻿package models

import "time"

type TaskStatus string

const (
	TaskPending    TaskStatus = "pending"
	TaskInProgress TaskStatus = "in_progress"
	TaskDone       TaskStatus = "done"
)

type Task struct {
	ID          string     `json:"id"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Status      TaskStatus `json:"status"`
	OwnerID     string     `json:"owner_id"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}

type CreateTaskRequest struct {
	Title       string `json:"title"`
	Description string `json:"description"`
}
```

### `models/user.go` (config)

```go
﻿package models

import "time"

type Role string

const (
	RoleAdmin Role = "admin"
	RoleUser  Role = "user"
)

type User struct {
	ID           string    `json:"id"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"`
	Role         Role      `json:"role"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

type CreateUserRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type LoginResponse struct {
	User  UserPublic `json:"user"`
	Token string     `json:"token"`
}

type UserPublic struct {
	ID        string    `json:"id"`
	Email     string    `json:"email"`
	Role      Role      `json:"role"`
	CreatedAt time.Time `json:"created_at"`
}
```

## File Import Graph

Which files import which — useful for understanding data flow.

### unknown
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/main.go` → `fmt`, `log`, `net/http`, `github.com/example/go-service/config`, `github.com/example/go-service/handlers`, `github.com/example/go-service/middleware`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/config/config.go` → `os`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/handlers/task_handler.go` → `encoding/json`, `net/http`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/handlers/user_handler.go` → `encoding/json`, `net/http`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/middleware/auth_middleware.go` → `context`, `net/http`, `strings`, `github.com/golang-jwt/jwt/v5`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/models/task.go` → `time`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/models/user.go` → `time`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/repository/user_repo.go` → `errors`, `sync`, `time`, `github.com/example/go-service/models`, `github.com/google/uuid`
- `C:/Users/Ansh/Desktop/web/Mesh/benchmarks/fixtures/go-service/service/auth_service.go` → `errors`, `time`, `github.com/example/go-service/models`, `github.com/example/go-service/repository`, `github.com/golang-jwt/jwt/v5`, `golang.org/x/crypto/bcrypt`

<!-- MIKK-END -->
