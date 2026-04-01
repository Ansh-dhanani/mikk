package service

import (
	"errors"
	"time"

	"github.com/example/go-service/models"
	"github.com/example/go-service/repository"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

type AuthService struct {
	userRepo  *repository.UserRepository
	jwtSecret string
}

func NewAuthService(repo *repository.UserRepository, secret string) *AuthService {
	return &AuthService{userRepo: repo, jwtSecret: secret}
}

func (s *AuthService) Register(email, password string) (*models.UserPublic, error) {
	if len(password) < 8 {
		return nil, errors.New("password must be at least 8 characters")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		return nil, err
	}
	user, err := s.userRepo.Create(email, string(hash))
	if err != nil {
		return nil, err
	}
	return &models.UserPublic{ID: user.ID, Email: user.Email, Role: user.Role, CreatedAt: user.CreatedAt}, nil
}

func (s *AuthService) Login(email, password string) (*models.LoginResponse, error) {
	user, err := s.userRepo.FindByEmail(email)
	if err != nil {
		return nil, errors.New("invalid credentials")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)); err != nil {
		return nil, errors.New("invalid credentials")
	}
	token, err := s.generateToken(user)
	if err != nil {
		return nil, err
	}
	return &models.LoginResponse{
		User:  models.UserPublic{ID: user.ID, Email: user.Email, Role: user.Role, CreatedAt: user.CreatedAt},
		Token: token,
	}, nil
}

func (s *AuthService) generateToken(user *models.User) (string, error) {
	claims := jwt.MapClaims{
		"sub":   user.ID,
		"email": user.Email,
		"role":  user.Role,
		"exp":   time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(s.jwtSecret))
}

func (s *AuthService) ValidateToken(tokenStr string) (jwt.MapClaims, error) {
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(s.jwtSecret), nil
	})
	if err != nil || !token.Valid {
		return nil, errors.New("invalid token")
	}
	return token.Claims.(jwt.MapClaims), nil
}
