import { describe, test, expect } from 'bun:test'
import { GoExtractor } from '../src/parser/go/go-extractor'

const SIMPLE_GO = `
package auth
import (
	"context"
	"errors"
	"github.com/golang-jwt/jwt/v5"
)
type UserClaims struct {
	UserID string
}
type AuthService struct {
	secretKey string
}
func (s *AuthService) VerifyToken(tokenStr string) (*UserClaims, error) {
	return nil, nil
}
`

const ROUTES_GO = `
package api
func RegisterRoutes(r *gin.Engine) {
	r.GET("/health", healthCheck)
	r.POST("/api/users", createUser)
}
`

describe('GoExtractor Restoration Verification', () => {
    test('extracts structs and methods correctly', async () => {
        const extractor = new GoExtractor()
        const result = await extractor.extract('auth/service.go', SIMPLE_GO)

        expect(result.classes.length).toBeGreaterThan(0)
        const authService = result.classes.find(c => c.name === 'AuthService')
        expect(authService).toBeDefined()
        // In Go, methods are extracted as functions, not attached to classes
        expect(result.functions.some(f => f.name === 'VerifyToken' && f.isExported)).toBe(true)
    })

    test('extracts routes correctly', async () => {
        const extractor = new GoExtractor()
        const result = await extractor.extract('api/routes.go', ROUTES_GO)

        expect(result.routes.length).toBe(2)
        expect(result.routes.some(r => r.path === '/health')).toBe(true)
        expect(result.routes.some(r => r.method === 'POST')).toBe(true)
    })

    test('calculates deterministic hash', async () => {
        const extractor = new GoExtractor()
        const res1 = await extractor.extract('a.go', 'package a')
        const res2 = await extractor.extract('a.go', 'package a')
        expect(res1.hash).toBe(res2.hash)
    })
})
