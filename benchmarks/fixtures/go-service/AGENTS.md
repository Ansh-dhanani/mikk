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


