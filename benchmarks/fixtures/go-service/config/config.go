package config

import "os"

type Config struct {
	Port      int
	JWTSecret string
	DBUrl     string
}

func Load() *Config {
	port := 8080
	return &Config{
		Port:      port,
		JWTSecret: getEnv("JWT_SECRET", "dev-secret-change-in-prod"),
		DBUrl:     getEnv("DATABASE_URL", "postgres://localhost:5432/goservice"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
