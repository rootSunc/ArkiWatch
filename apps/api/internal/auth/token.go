package auth

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/rootSunc/ArkiWatch/apps/api/internal/config"
	"github.com/rootSunc/ArkiWatch/apps/api/internal/users"
)

type Claims struct {
	Subject string
}

func VerifyAdminCredentials(identifier, password string, cfg config.Config) bool {
	normalizedIdentifier := strings.ToLower(strings.TrimSpace(identifier))
	allowedUsername := strings.ToLower(strings.TrimSpace(cfg.AdminUsername))
	allowedEmail := strings.ToLower(strings.TrimSpace(cfg.AdminEmail))
	if normalizedIdentifier != allowedUsername && normalizedIdentifier != allowedEmail {
		return false
	}
	if cfg.AdminPasswordHash != "" {
		return VerifyPassword(password, cfg.AdminPasswordHash)
	}
	return hmac.Equal([]byte(password), []byte(cfg.AdminPassword))
}

func VerifyPassword(password, encodedHash string) bool {
	parts := strings.Split(encodedHash, ".")
	if len(parts) != 4 || parts[0] != "pbkdf2_sha256" {
		return false
	}
	iterations, err := parsePositiveInt(parts[1])
	if err != nil {
		return false
	}
	salt, err := base64.RawURLEncoding.DecodeString(parts[2])
	if err != nil {
		return false
	}
	expectedDigest, err := base64.RawURLEncoding.DecodeString(parts[3])
	if err != nil {
		return false
	}
	actualDigest := pbkdf2SHA256([]byte(password), salt, iterations, len(expectedDigest))
	actual := base64.RawURLEncoding.EncodeToString(actualDigest)
	return hmac.Equal([]byte(actual), []byte(parts[3]))
}

func CreateAccessToken(user users.User, cfg config.Config, issuedAt time.Time) (string, time.Time) {
	issuedAt = issuedAt.UTC()
	expiresAt := issuedAt.Add(time.Duration(cfg.AuthTokenTTLMinutes) * time.Minute)
	var email, name any
	if user.Email != nil {
		email = *user.Email
	}
	if user.Name != nil {
		name = *user.Name
	}
	payload := map[string]any{
		"sub":   user.ID,
		"email": email,
		"name":  name,
		"iss":   cfg.AuthTokenIssuer,
		"aud":   cfg.AuthTokenAudience,
		"iat":   issuedAt.Unix(),
		"exp":   expiresAt.Unix(),
	}
	header := map[string]any{"alg": "HS256", "typ": "JWT"}
	signingInput := base64urlJSON(header) + "." + base64urlJSON(payload)
	return signingInput + "." + sign(signingInput, cfg.AuthTokenSecret), expiresAt
}

func DecodeAccessToken(token string, cfg config.Config, now time.Time) (Claims, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 3 {
		return Claims{}, fmt.Errorf("Malformed access token.")
	}

	var header map[string]any
	if err := decodeJSON(parts[0], &header); err != nil {
		return Claims{}, fmt.Errorf("Invalid access token header.")
	}
	if header["alg"] != "HS256" || header["typ"] != "JWT" {
		return Claims{}, fmt.Errorf("Unsupported access token header.")
	}

	signature := sign(strings.Join(parts[:2], "."), cfg.AuthTokenSecret)
	if !hmac.Equal([]byte(parts[2]), []byte(signature)) {
		return Claims{}, fmt.Errorf("Invalid access token signature.")
	}

	var payload map[string]any
	if err := decodeJSON(parts[1], &payload); err != nil {
		return Claims{}, fmt.Errorf("Invalid access token payload.")
	}
	subject, subjectOK := payload["sub"].(string)
	issuer, issuerOK := payload["iss"].(string)
	audience, audienceOK := payload["aud"].(string)
	expiresAt, expiresOK := payload["exp"].(json.Number)
	if !subjectOK || subject == "" {
		return Claims{}, fmt.Errorf("Access token subject is missing.")
	}
	if !expiresOK {
		return Claims{}, fmt.Errorf("Access token expiration is missing.")
	}
	if !issuerOK || !audienceOK || issuer != cfg.AuthTokenIssuer || audience != cfg.AuthTokenAudience {
		return Claims{}, fmt.Errorf("Access token issuer or audience is invalid.")
	}
	expires, err := expiresAt.Int64()
	if err != nil || expires <= now.Unix() {
		return Claims{}, fmt.Errorf("Access token has expired.")
	}
	return Claims{Subject: subject}, nil
}

func decodeJSON(encoded string, destination any) error {
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(strings.NewReader(string(decoded)))
	decoder.UseNumber()
	return decoder.Decode(destination)
}

func sign(signingInput, secret string) string {
	digest := hmac.New(sha256.New, []byte(secret))
	_, _ = digest.Write([]byte(signingInput))
	return base64.RawURLEncoding.EncodeToString(digest.Sum(nil))
}

func base64urlJSON(value any) string {
	encoded, _ := json.Marshal(value)
	return base64.RawURLEncoding.EncodeToString(encoded)
}

func parsePositiveInt(value string) (int, error) {
	parsed, err := strconv.Atoi(value)
	if err != nil || parsed <= 0 {
		return 0, fmt.Errorf("invalid positive integer")
	}
	return parsed, nil
}

func pbkdf2SHA256(password, salt []byte, iterations, keyLength int) []byte {
	hashLength := sha256.Size
	blocks := (keyLength + hashLength - 1) / hashLength
	result := make([]byte, 0, blocks*hashLength)
	for block := 1; block <= blocks; block++ {
		mac := hmac.New(sha256.New, password)
		_, _ = mac.Write(salt)
		_, _ = mac.Write([]byte{byte(block >> 24), byte(block >> 16), byte(block >> 8), byte(block)})
		u := mac.Sum(nil)
		blockValue := append([]byte(nil), u...)
		for iteration := 1; iteration < iterations; iteration++ {
			mac = hmac.New(sha256.New, password)
			_, _ = mac.Write(u)
			u = mac.Sum(nil)
			for index := range blockValue {
				blockValue[index] ^= u[index]
			}
		}
		result = append(result, blockValue...)
	}
	return result[:keyLength]
}
