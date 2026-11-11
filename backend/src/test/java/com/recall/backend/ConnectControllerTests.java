package com.recall.backend;

import java.io.*;
import java.nio.file.Path;
import java.time.*;
import java.awt.image.BufferedImage;
import javax.imageio.ImageIO;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.mock.web.MockMultipartFile;
import static org.assertj.core.api.Assertions.*;

class ConnectControllerTests {
    @TempDir Path directory;
    static class TestClock extends Clock {
        Instant now = Instant.parse("2026-01-01T00:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
    }
    MockMultipartFile image() throws Exception {
        var bytes = new ByteArrayOutputStream(); ImageIO.write(new BufferedImage(2, 2, BufferedImage.TYPE_INT_RGB), "png", bytes);
        return new MockMultipartFile("file", "photo.png", "image/png", bytes.toByteArray());
    }
    @Test void pairingIsOneUseAndPhotosAreOwnerScoped() throws Exception {
        var accounts = new AccountStore(directory.toString());
        String first = "Bearer " + accounts.register("One", "one@example.test", "Synthetic-pass-123").token();
        String second = "Bearer " + accounts.register("Two", "two@example.test", "Synthetic-pass-456").token();
        var connect = new ConnectController(accounts);
        assertThatThrownBy(() -> connect.pair("")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var pairing = connect.pair(first);
        connect.upload(pairing.code(), image(), "typed notes");
        assertThatThrownBy(() -> connect.upload(pairing.code(), image(), "again")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        assertThat(connect.inbox(second)).isEmpty();
        var item = connect.inbox(first).getFirst();
        assertThat(item.notes()).isEqualTo("typed notes");
        assertThatThrownBy(() -> connect.image(second, item.id())).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        connect.remove(second, item.id()); assertThat(connect.inbox(first)).hasSize(1);
        assertThat(connect.image(first, item.id()).getHeaders().getFirst("X-Content-Type-Options")).isEqualTo("nosniff");
        connect.remove(first, item.id()); assertThat(connect.inbox(first)).isEmpty();
    }
    @Test void rejectsSpoofedFilesAndExpiresPairingAndInbox() throws Exception {
        var accounts = new AccountStore(directory.toString());
        String auth = "Bearer " + accounts.register("One", "expiry@example.test", "Synthetic-pass-123").token();
        var clock = new TestClock(); var connect = new ConnectController(accounts, clock);
        var pairing = connect.pair(auth);
        assertThatThrownBy(() -> connect.upload(pairing.code(), new MockMultipartFile("file", "fake.png", "image/png", "not-an-image".getBytes()), ""))
            .isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        clock.now = clock.now.plusSeconds(301);
        assertThatThrownBy(() -> connect.upload(pairing.code(), image(), "")).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        var fresh = connect.pair(auth); connect.upload(fresh.code(), image(), "");
        clock.now = clock.now.plusSeconds(3601); assertThat(connect.inbox(auth)).isEmpty();
    }
}
