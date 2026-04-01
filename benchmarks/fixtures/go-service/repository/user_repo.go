package repository

import (
	"errors"
	"sync"
	"time"

	"github.com/example/go-service/models"
	"github.com/google/uuid"
)

type UserRepository struct {
	mu    sync.RWMutex
	users map[string]*models.User
}

func NewUserRepository() *UserRepository {
	return &UserRepository{users: make(map[string]*models.User)}
}

func (r *UserRepository) Create(email, passwordHash string) (*models.User, error) {
	r.mu.Lock()
	defer r.mu.Unlock()

	for _, u := range r.users {
		if u.Email == email {
			return nil, errors.New("email already registered")
		}
	}

	user := &models.User{
		ID:           uuid.NewString(),
		Email:        email,
		PasswordHash: passwordHash,
		Role:         models.RoleUser,
		CreatedAt:    time.Now(),
		UpdatedAt:    time.Now(),
	}
	r.users[user.ID] = user
	return user, nil
}

func (r *UserRepository) FindByEmail(email string) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	for _, u := range r.users {
		if u.Email == email {
			return u, nil
		}
	}
	return nil, errors.New("user not found")
}

func (r *UserRepository) FindByID(id string) (*models.User, error) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	u, ok := r.users[id]
	if !ok {
		return nil, errors.New("user not found")
	}
	return u, nil
}
