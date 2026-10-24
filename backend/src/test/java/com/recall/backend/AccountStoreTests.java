package com.recall.backend;

import java.nio.file.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import static org.assertj.core.api.Assertions.*;

class AccountStoreTests {
    @TempDir Path directory;
    @Test void registrationStoresHashAndReturnsOnlyPublicProfile() throws Exception {
        var store = new AccountStore(directory.toString());
        var account = store.register("Student", "STUDENT@example.com", "A-real-test-password");
        assertThat(account.user().email()).isEqualTo("student@example.com");
        assertThat(account.token()).hasSizeGreaterThanOrEqualTo(40);
        try (var files = Files.list(directory)) {
            String stored = Files.readString(files.findFirst().orElseThrow());
            assertThat(stored).contains("salt=", "password=").doesNotContain("A-real-test-password", account.token());
        }
    }
    @Test void progressIsIsolatedAndLogoutRevokesAccess() throws Exception {
        var store = new AccountStore(directory.toString());
        var first = store.register("First", "first@example.com", "First-password-123");
        var second = store.register("Second", "second@example.com", "Second-password-123");
        store.saveProgress(first.token(), "{\"notes\":\"private course notes\"}");
        assertThat(store.workspace(first.token()).progress()).contains("private course notes");
        assertThat(store.workspace(second.token()).progress()).isNull();
        store.logout(first.token());
        assertThatThrownBy(() -> store.workspace(first.token())).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> store.saveProgress("invalid-token", "stolen")).isInstanceOf(ResponseStatusException.class);
    }
    @Test void progressSurvivesRestartButOldSessionDoesNot() throws Exception {
        var store = new AccountStore(directory.toString());
        var account = store.register("Student", "student@example.com", "Valid-password-123");
        store.saveProgress(account.token(), "saved quiz answers");
        var restarted = new AccountStore(directory.toString());
        assertThatThrownBy(() -> restarted.workspace(account.token())).isInstanceOf(ResponseStatusException.class);
        var login = restarted.login("STUDENT@example.com", "Valid-password-123");
        assertThat(login.progress()).isEqualTo("saved quiz answers");
        assertThat(login.user().id()).isEqualTo(account.user().id());
        assertThatThrownBy(() -> restarted.login("student@example.com", "wrong-password")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> restarted.register("Duplicate", "student@example.com", "Another-password-123")).isInstanceOf(ResponseStatusException.class);
    }
    @Test void repeatedWrongPasswordsAreRateLimited() throws Exception {
        var store = new AccountStore(directory.toString());
        for (int i = 0; i < 8; i++) assertThatThrownBy(() -> store.login("absent@example.com", "bad-password")).isInstanceOf(ResponseStatusException.class);
        assertThatThrownBy(() -> store.login("absent@example.com", "bad-password"))
            .isInstanceOfSatisfying(ResponseStatusException.class, e -> assertThat(e.getStatusCode()).isEqualTo(HttpStatus.TOO_MANY_REQUESTS));
    }
}
