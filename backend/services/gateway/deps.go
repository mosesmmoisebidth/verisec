// deps.go keeps the adopted-tool SDKs in go.mod so `go mod tidy` installs them
// now, before any of them are wired. Remove a blank import once its real
// integration lands and imports it directly.
package main

import (
	_ "github.com/golang-jwt/jwt/v5"     // token validation
	_ "github.com/jackc/pgx/v5"          // Postgres
	_ "github.com/openfga/go-sdk/client" // authorization (OpenFGA)
	_ "github.com/redis/go-redis/v9"     // Valkey
	_ "github.com/svix/svix-webhooks/go" // webhooks (Svix)
	_ "go.temporal.io/sdk/client"        // orchestration (Temporal)
)
