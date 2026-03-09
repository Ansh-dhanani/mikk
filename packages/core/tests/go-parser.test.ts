import { describe, test, expect } from 'bun:test'
import { GoExtractor } from '../src/parser/go/go-extractor'
import { GoParser } from '../src/parser/go/go-parser'

// ─── Sample Go source files ────────────────────────────────────────────────

const SIMPLE_GO = `
package auth

import (
	"context"
	"errors"
	"github.com/golang-jwt/jwt/v5"
)

// UserClaims holds the JWT payload for authenticated users.
type UserClaims struct {
	UserID string
	Email  string
	Role   string
}

// AuthService handles token validation and user authentication.
type AuthService struct {
	secretKey string
	db        DBClient
}

// VerifyToken validates a JWT string and returns the decoded claims.
func (s *AuthService) VerifyToken(tokenStr string) (*UserClaims, error) {
	if tokenStr == "" {
		return nil, errors.New("empty token")
	}
	token, err := jwt.Parse(tokenStr, keyFunc(s.secretKey))
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*UserClaims)
	if !ok {
		return nil, errors.New("invalid claims")
	}
	return claims, nil
}

// GetUserByID fetches a user from the database by ID.
func (s *AuthService) GetUserByID(ctx context.Context, id string) (*User, error) {
	if id == "" {
		return nil, errors.New("empty id")
	}
	return s.db.FindUser(ctx, id)
}

// hashPassword hashes a plain-text password using bcrypt.
func hashPassword(password string) (string, error) {
	return bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
}

// keyFunc is an internal helper to build a jwt key lookup function.
func keyFunc(secret string) jwt.Keyfunc {
	return func(token *jwt.Token) (interface{}, error) {
		return []byte(secret), nil
	}
}
`

const ROUTES_GO = `
package api

import "github.com/gin-gonic/gin"

func RegisterRoutes(r *gin.Engine) {
	r.GET("/health", healthCheck)
	r.POST("/api/users", createUser)
	r.GET("/api/users/:id", getUserByID)
	r.PUT("/api/users/:id", updateUser)
	r.DELETE("/api/users/:id", deleteUser)
}

func healthCheck(c *gin.Context) {
	c.JSON(200, gin.H{"status": "ok"})
}
`

const TOPLEVEL_GO = `
package utils

import (
	"fmt"
	"strings"
)

// FormatName formats first and last name together.
func FormatName(first, last string) string {
	return fmt.Sprintf("%s %s", strings.TrimSpace(first), strings.TrimSpace(last))
}

// IsEmpty checks if a string has no meaningful content.
func IsEmpty(s string) bool {
	return strings.TrimSpace(s) == ""
}

// internal helper: not exported
func normalize(s string) string {
	return strings.ToLower(strings.TrimSpace(s))
}
`

// ─── GoExtractor tests ─────────────────────────────────────────────────────

describe('GoExtractor', () => {
    describe('function extraction', () => {
        test('extracts top-level exported functions', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const names = fns.map(f => f.name)
            expect(names).toContain('FormatName')
            expect(names).toContain('IsEmpty')
        })

        test('extracts unexported top-level functions', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const names = fns.map(f => f.name)
            expect(names).toContain('normalize')
        })

        test('marks exported functions correctly', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            const normalizeF = fns.find(f => f.name === 'normalize')
            expect(formatName?.isExported).toBe(true)
            expect(normalizeF?.isExported).toBe(false)
        })

        test('does NOT include methods in extractFunctions()', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const fns = ext.extractFunctions()
            const names = fns.map(f => f.name)
            // Methods have receiver — should not appear in top-level functions
            expect(names).not.toContain('VerifyToken')
            expect(names).not.toContain('GetUserByID')
        })

        test('extracts purpose from leading comment', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            expect(formatName?.purpose).toContain('formats')
        })

        test('extracts params with name and type', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            expect(formatName?.params.length).toBeGreaterThan(0)
            const paramNames = formatName!.params.map(p => p.name)
            expect(paramNames).toContain('first')
        })

        test('extracts return type', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            expect(formatName?.returnType).toBeTruthy()
        })

        test('extracts function ID with correct format', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            expect(formatName?.id).toBe('fn:utils/format.go:FormatName')
        })

        test('populates startLine and endLine', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            for (const fn of fns) {
                expect(fn.startLine).toBeGreaterThan(0)
                expect(fn.endLine).toBeGreaterThanOrEqual(fn.startLine)
            }
        })

        test('extracts calls within function body', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const fns = ext.extractFunctions()
            const formatName = fns.find(f => f.name === 'FormatName')
            // Should detect calls to Sprintf, TrimSpace
            expect(formatName?.calls.length).toBeGreaterThan(0)
        })
    })

    describe('class extraction (structs)', () => {
        test('extracts struct types as classes', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const names = classes.map(c => c.name)
            expect(names).toContain('AuthService')
            expect(names).toContain('UserClaims')
        })

        test('groups receiver methods into struct classes', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const authService = classes.find(c => c.name === 'AuthService')
            expect(authService).toBeDefined()
            const methodNames = authService!.methods.map(m => m.name)
            expect(methodNames.some(n => n.includes('VerifyToken'))).toBe(true)
            expect(methodNames.some(n => n.includes('GetUserByID'))).toBe(true)
        })

        test('marks exported structs correctly', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const authService = classes.find(c => c.name === 'AuthService')
            expect(authService?.isExported).toBe(true)
        })

        test('method IDs use Receiver.Method format', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const authService = classes.find(c => c.name === 'AuthService')
            const verifyToken = authService?.methods.find(m => m.name.includes('VerifyToken'))
            expect(verifyToken?.id).toBe('fn:auth/service.go:AuthService.VerifyToken')
        })

        test('extracts purpose for structs', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const authService = classes.find(c => c.name === 'AuthService')
            expect(authService?.purpose).toContain('authentication')
        })
    })

    describe('import extraction', () => {
        test('extracts block imports', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const imports = ext.extractImports()
            const sources = imports.map(i => i.source)
            expect(sources).toContain('context')
            expect(sources).toContain('errors')
            expect(sources).toContain('github.com/golang-jwt/jwt/v5')
        })

        test('extracts single-line imports', () => {
            const src = `package main\nimport "fmt"\nimport "os"\n`
            const ext = new GoExtractor('main.go', src)
            const imports = ext.extractImports()
            const sources = imports.map(i => i.source)
            expect(sources).toContain('fmt')
            expect(sources).toContain('os')
        })

        test('uses last path segment as import name', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const imports = ext.extractImports()
            const jwtImport = imports.find(i => i.source.includes('jwt'))
            expect(jwtImport?.names[0]).toBe('v5')
        })
    })

    describe('export extraction', () => {
        test('only exports uppercase identifiers', () => {
            const ext = new GoExtractor('utils/format.go', TOPLEVEL_GO)
            const exports = ext.extractExports()
            const names = exports.map(e => e.name)
            expect(names).toContain('FormatName')
            expect(names).toContain('IsEmpty')
            expect(names).not.toContain('normalize')
        })
    })

    describe('route detection', () => {
        test('detects Gin routes with correct methods', () => {
            const ext = new GoExtractor('api/routes.go', ROUTES_GO)
            const routes = ext.extractRoutes()
            expect(routes.length).toBeGreaterThanOrEqual(4)
            const methods = routes.map(r => r.method)
            expect(methods).toContain('GET')
            expect(methods).toContain('POST')
            expect(methods).toContain('PUT')
            expect(methods).toContain('DELETE')
        })

        test('extracts route paths correctly', () => {
            const ext = new GoExtractor('api/routes.go', ROUTES_GO)
            const routes = ext.extractRoutes()
            const paths = routes.map(r => r.path)
            expect(paths).toContain('/health')
            expect(paths).toContain('/api/users')
        })

        test('routes have correct file and line', () => {
            const ext = new GoExtractor('api/routes.go', ROUTES_GO)
            const routes = ext.extractRoutes()
            for (const route of routes) {
                expect(route.file).toBe('api/routes.go')
                expect(route.line).toBeGreaterThan(0)
            }
        })
    })

    describe('error handling extraction', () => {
        test('detects "if err != nil" patterns', () => {
            const ext = new GoExtractor('auth/service.go', SIMPLE_GO)
            const classes = ext.extractClasses()
            const authService = classes.find(c => c.name === 'AuthService')
            const verifyToken = authService?.methods.find(m => m.name.includes('VerifyToken'))
            expect(verifyToken?.errorHandling.length).toBeGreaterThan(0)
            expect(verifyToken?.errorHandling[0].type).toBe('try-catch')
        })
    })
})

// ─── GoParser integration tests ────────────────────────────────────────────

describe('GoParser', () => {
    test('getSupportedExtensions returns .go', () => {
        const parser = new GoParser()
        expect(parser.getSupportedExtensions()).toContain('.go')
    })

    test('parse returns a well-formed ParsedFile', () => {
        const parser = new GoParser()
        const result = parser.parse('auth/service.go', SIMPLE_GO)
        expect(result.path).toBe('auth/service.go')
        expect(result.language).toBe('go')
        expect(Array.isArray(result.functions)).toBe(true)
        expect(Array.isArray(result.classes)).toBe(true)
        expect(Array.isArray(result.imports)).toBe(true)
        expect(Array.isArray(result.exports)).toBe(true)
        expect(Array.isArray(result.routes)).toBe(true)
        expect(typeof result.hash).toBe('string')
        expect(result.hash.length).toBeGreaterThan(0)
    })

    test('parse populates functions from a real Go service', () => {
        const parser = new GoParser()
        const result = parser.parse('auth/service.go', SIMPLE_GO)
        // Top-level funcs: hashPassword, keyFunc
        expect(result.functions.some(f => f.name === 'hashPassword')).toBe(true)
        expect(result.functions.some(f => f.name === 'keyFunc')).toBe(true)
    })

    test('parse populates classes for structs with methods', () => {
        const parser = new GoParser()
        const result = parser.parse('auth/service.go', SIMPLE_GO)
        const authService = result.classes.find(c => c.name === 'AuthService')
        expect(authService).toBeDefined()
        expect(authService!.methods.length).toBeGreaterThan(0)
    })

    test('parse detects routes in a Gin router file', () => {
        const parser = new GoParser()
        const result = parser.parse('api/routes.go', ROUTES_GO)
        expect(result.routes.length).toBeGreaterThanOrEqual(4)
    })

    test('resolveImports passes through without crashing on no go.mod', () => {
        const parser = new GoParser()
        const files = [parser.parse('utils/format.go', TOPLEVEL_GO)]
        // Should not throw even without go.mod
        const resolved = parser.resolveImports(files, '/tmp/no-gomod-' + Date.now())
        expect(resolved.length).toBe(1)
    })
})
