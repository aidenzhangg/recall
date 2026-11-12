package com.recall.backend;

import java.nio.file.Path;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class GoogleIdentityTests {
    @TempDir Path directory;
    private static Map<String, Object> claims() {
        var claims = new HashMap<String, Object>();
        claims.put("aud", "client-1"); claims.put("iss", "https://accounts.google.com"); claims.put("exp", "2000");
        claims.put("nonce", "nonce-0123456789abcdef"); claims.put("email", "Student@Example.com"); claims.put("email_verified", "true");
        claims.put("name", "Test Student");
        return claims;
    }
    @Test void acceptsATokenIssuedForThisAppAndThisAttempt() {
        var identity = GoogleIdentity.check(claims(), "client-1", "nonce-0123456789abcdef", 1000);
        assertThat(identity.email()).isEqualTo("student@example.com");
        assertThat(identity.name()).isEqualTo("Test Student");
    }
    @Test void rejectsTokensForAnotherAppExpiredReplayedOrUnverified() {
        for (var change : Map.of("aud", "someone-else", "iss", "https://evil.example", "exp", "999", "nonce", "other-nonce-0123456789", "email_verified", "false").entrySet()) {
            var claims = claims(); claims.put(change.getKey(), change.getValue());
            assertThatThrownBy(() -> GoogleIdentity.check(claims, "client-1", "nonce-0123456789abcdef", 1000)).as(change.getKey()).isInstanceOf(ResponseStatusException.class);
        }
        assertThatThrownBy(() -> new GoogleIdentity("").verify("token", "nonce-0123456789abcdef")).isInstanceOf(ResponseStatusException.class);
    }
    @Test void googleAccountIsCreatedOnceThenReusedAndHasNoUsablePassword() throws Exception {
        var store = new AccountStore(directory.toString());
        var first = store.externalLogin("Test Student", "Student@example.com");
        store.saveProgress(first.token(), "saved notes");
        var second = store.externalLogin("Test Student", "student@example.com");
        assertThat(second.user().id()).isEqualTo(first.user().id());
        assertThat(second.progress()).isEqualTo("saved notes");
        assertThatThrownBy(() -> store.login("student@example.com", "")).isInstanceOf(ResponseStatusException.class);
    }
}
