package auth

import (
	"testing"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

func TestDecodeAccessTokenAcceptsLegacyCompatibleToken(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"

	claims, err := DecodeAccessToken(token, cfg, time.Unix(2000000001, 0).UTC())
	if err != nil {
		t.Fatalf("DecodeAccessToken() error = %v", err)
	}
	if claims.Subject != "user-1" {
		t.Fatalf("subject = %q, want user-1", claims.Subject)
	}
}

func TestDecodeAccessTokenRejectsExpiredToken(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	token := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"

	if _, err := DecodeAccessToken(token, cfg, time.Unix(2000003600, 0).UTC()); err == nil {
		t.Fatal("DecodeAccessToken() accepted an expired token")
	}
}

func TestVerifyPasswordMatchesLegacyPBKDF2Format(t *testing.T) {
	hash := "pbkdf2_sha256.390000.MDEyMzQ1Njc4OWFiY2RlZg._ADW1Z5bEwFPWgld7Ym0qB7A3YkgWt6b4zmKiSVoFm4"
	if !VerifyPassword("secret", hash) {
		t.Fatal("VerifyPassword() rejected a legacy-compatible hash")
	}
	if VerifyPassword("wrong", hash) {
		t.Fatal("VerifyPassword() accepted the wrong password")
	}
}

func TestCreateAccessTokenMatchesLegacyPayloadContract(t *testing.T) {
	cfg := config.DefaultConfig()
	cfg.AuthTokenSecret = "secret-for-tests-0123456789012345"
	cfg.AuthTokenTTLMinutes = 60
	email := "user@example.com"
	name := "User"
	user := users.User{ID: "user-1", Email: &email, Name: &name}

	token, expiresAt := CreateAccessToken(user, cfg, time.Unix(2000000000, 0).UTC())
	want := "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJhdWQiOiJhcmtpd2F0Y2gtd2ViIiwiZW1haWwiOiJ1c2VyQGV4YW1wbGUuY29tIiwiZXhwIjoyMDAwMDAzNjAwLCJpYXQiOjIwMDAwMDAwMDAsImlzcyI6ImFya2l3YXRjaC1hcGkiLCJuYW1lIjoiVXNlciIsInN1YiI6InVzZXItMSJ9.W1S--kx67iWNVewe81OqzOqLbb-aQTO8hB-1cr_T9zI"
	if token != want {
		t.Fatalf("token differs from legacy contract:\n got %s\nwant %s", token, want)
	}
	if !expiresAt.Equal(time.Unix(2000003600, 0).UTC()) {
		t.Fatalf("expiresAt = %s", expiresAt)
	}
}
