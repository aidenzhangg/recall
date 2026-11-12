package com.recall.backend;

import java.io.IOException;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.*;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Verifies a Google ID token. The OAuth client ID is a public identifier read from the
 * RECALL_GOOGLE_CLIENT_ID environment variable; no client secret or API key is used or stored.
 */
@Component
public class GoogleIdentity {
    public record Identity(String email, String name) {}
    private final String clientId;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public GoogleIdentity(@Value("${recall.google-client-id:}") String clientId) { this.clientId = clientId.trim(); }
    public String clientId() { return clientId; }

    /** Google checks the signature and expiry; Recall then checks the token was issued for this app and this sign-in attempt. */
    public Identity verify(String idToken, String nonce) {
        if (clientId.isEmpty()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Google sign-in is not set up on this backend.");
        Map<String, Object> claims;
        try {
            var request = HttpRequest.newBuilder(URI.create("https://oauth2.googleapis.com/tokeninfo?id_token=" + URLEncoder.encode(idToken, StandardCharsets.UTF_8)))
                .timeout(Duration.ofSeconds(10)).GET().build();
            var response = http.send(request, HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in could not be verified.");
            claims = JsonParserFactory.getJsonParser().parseMap(response.body());
        } catch (IOException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not reach Google to verify the sign-in.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not reach Google to verify the sign-in.");
        }
        return check(claims, clientId, nonce, System.currentTimeMillis() / 1000);
    }

    static Identity check(Map<String, Object> claims, String clientId, String nonce, long nowSeconds) {
        String issuer = text(claims, "iss");
        long expires;
        try { expires = Long.parseLong(text(claims, "exp")); } catch (NumberFormatException e) { expires = 0; }
        String email = text(claims, "email").toLowerCase(java.util.Locale.ROOT);
        boolean valid = !clientId.isEmpty() && clientId.equals(text(claims, "aud"))
            && (issuer.equals("https://accounts.google.com") || issuer.equals("accounts.google.com"))
            && expires > nowSeconds && !nonce.isEmpty() && nonce.equals(text(claims, "nonce"))
            && text(claims, "email_verified").equals("true") && email.contains("@") && email.length() <= 254;
        if (!valid) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Google sign-in could not be verified.");
        String name = text(claims, "name").trim();
        if (name.isEmpty()) name = email.substring(0, email.indexOf('@'));
        return new Identity(email, name.length() > 80 ? name.substring(0, 80) : name);
    }
    private static String text(Map<String, Object> claims, String key) { Object value = claims.get(key); return value == null ? "" : value.toString(); }
}
