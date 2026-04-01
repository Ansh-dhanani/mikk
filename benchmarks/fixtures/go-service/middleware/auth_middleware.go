package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/golang-jwt/jwt/v5"
)

type AuthMiddleware struct {
	secret string
}

type contextKey string

const UserClaimsKey contextKey = "user_claims"

func NewAuthMiddleware(secret string) *AuthMiddleware {
	return &AuthMiddleware{secret: secret}
}

func (m *AuthMiddleware) Protect(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			http.Error(w, "unauthorized", http.StatusUnauthorized)
			return
		}
		tokenStr := strings.TrimPrefix(header, "Bearer ")
		token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
			return []byte(m.secret), nil
		})
		if err != nil || !token.Valid {
			http.Error(w, "invalid token", http.StatusUnauthorized)
			return
		}
		ctx := context.WithValue(r.Context(), UserClaimsKey, token.Claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}
