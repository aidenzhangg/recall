package com.recall.backend;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.*;
import java.time.Instant;
import java.util.*;
import javax.crypto.SecretKeyFactory;
import javax.crypto.spec.PBEKeySpec;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class AccountStore {
    private final Path directory;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Session> sessions = new HashMap<>();
    private final Map<String, Attempts> attempts = new HashMap<>();
    private record Session(String fileKey, long expires) {}
    private record Attempts(int count, long until) {}
    public record User(String id, String name, String email) {}
    public record Login(String token, User user, String progress) {}
    public record Workspace(User user, String progress) {}

    public AccountStore(@Value("${recall.data-dir:./data/accounts}") String directory) throws IOException {
        this.directory = Path.of(directory).toAbsolutePath().normalize();
        Files.createDirectories(this.directory);
    }
    public synchronized Login register(String name, String email, String password) throws IOException {
        email = email.trim().toLowerCase(Locale.ROOT);
        String key = digest(email);
        if (Files.exists(file(key))) throw new ResponseStatusException(HttpStatus.CONFLICT, "An account already exists for this email.");
        var properties = new Properties();
        byte[] salt = new byte[16]; random.nextBytes(salt);
        properties.setProperty("id", UUID.randomUUID().toString());
        properties.setProperty("name", name.trim());
        properties.setProperty("email", email);
        properties.setProperty("salt", Base64.getEncoder().encodeToString(salt));
        properties.setProperty("password", Base64.getEncoder().encodeToString(hashPassword(password, salt)));
        save(key, properties);
        return loginResult(key, properties);
    }
    public synchronized Login login(String email, String password) throws IOException {
        String key = digest(email.trim().toLowerCase(Locale.ROOT));
        long now = System.currentTimeMillis();
        attempts.entrySet().removeIf(entry -> entry.getValue().until() < now);
        Attempts failures = attempts.get(key);
        if ((failures != null && failures.count() >= 8) || attempts.size() > 10000)
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Please wait a few minutes before trying again.");
        Properties properties = Files.exists(file(key)) ? load(key) : null;
        byte[] salt = properties == null ? new byte[16] : Base64.getDecoder().decode(properties.getProperty("salt"));
        byte[] expected = properties == null ? new byte[32] : Base64.getDecoder().decode(properties.getProperty("password"));
        if (!MessageDigest.isEqual(hashPassword(password, salt), expected) || properties == null) {
            attempts.put(key, new Attempts(failures == null ? 1 : failures.count() + 1, failures == null ? now + 300000 : failures.until()));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Email or password is incorrect.");
        }
        attempts.remove(key);
        return loginResult(key, properties);
    }
    public synchronized Workspace workspace(String token) throws IOException {
        Properties properties = load(requireSession(token).fileKey());
        return new Workspace(user(properties), properties.getProperty("progress"));
    }
    public synchronized void saveProgress(String token, String progress) throws IOException {
        String key = requireSession(token).fileKey();
        Properties properties = load(key);
        properties.setProperty("progress", progress);
        save(key, properties);
    }
    public synchronized void logout(String token) { sessions.remove(digest(token)); }
    private Login loginResult(String key, Properties properties) {
        long now = System.currentTimeMillis();
        sessions.entrySet().removeIf(entry -> entry.getValue().expires() < now);
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(digest(token), new Session(key, now + 12 * 60 * 60 * 1000L));
        return new Login(token, user(properties), properties.getProperty("progress"));
    }
    private Session requireSession(String token) {
        Session session = sessions.get(digest(token));
        if (session == null || session.expires() < System.currentTimeMillis()) {
            sessions.remove(digest(token));
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Sign in again to save progress.");
        }
        return session;
    }
    private User user(Properties p) { return new User(p.getProperty("id"), p.getProperty("name"), p.getProperty("email")); }
    private Path file(String key) { return directory.resolve(key + ".properties"); }
    private Properties load(String key) throws IOException {
        Properties p = new Properties();
        try (InputStream input = Files.newInputStream(file(key))) { p.load(input); }
        return p;
    }
    private void save(String key, Properties p) throws IOException {
        Path temporary = Files.createTempFile(directory, "account-", ".tmp");
        try {
            try (OutputStream output = Files.newOutputStream(temporary)) { p.store(output, "Recall local account"); }
            try { Files.move(temporary, file(key), StandardCopyOption.REPLACE_EXISTING, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException e) { Files.move(temporary, file(key), StandardCopyOption.REPLACE_EXISTING); }
        } finally { Files.deleteIfExists(temporary); }
    }
    private static String digest(String value) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(value.getBytes(StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    private static byte[] hashPassword(String password, byte[] salt) {
        PBEKeySpec spec = new PBEKeySpec(password.toCharArray(), salt, 210000, 256);
        try { return SecretKeyFactory.getInstance("PBKDF2WithHmacSHA256").generateSecret(spec).getEncoded(); }
        catch (GeneralSecurityException e) { throw new IllegalStateException(e); }
        finally { spec.clearPassword(); }
    }
}
