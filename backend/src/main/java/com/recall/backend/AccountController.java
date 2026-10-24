package com.recall.backend;

import java.io.IOException;
import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/account")
public class AccountController {
    private final AccountStore store;
    public AccountController(AccountStore store) { this.store = store; }
    @ModelAttribute
    public void preventCaching(jakarta.servlet.http.HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }
    public record Registration(@NotBlank @Size(max=80) String name,
        @NotBlank @Email @Size(max=254) String email, @NotBlank @Size(min=10, max=128) String password) {}
    public record Credentials(@NotBlank @Email @Size(max=254) String email, @NotBlank @Size(max=128) String password) {}
    public record Progress(@NotBlank @Size(max=30000000) String progress) {}
    @PostMapping("/register")
    public AccountStore.Login register(@Valid @RequestBody Registration request) throws IOException {
        return store.register(request.name(), request.email(), request.password());
    }
    @PostMapping("/login")
    public AccountStore.Login login(@Valid @RequestBody Credentials request) throws IOException {
        return store.login(request.email(), request.password());
    }
    @GetMapping("/me")
    public AccountStore.Workspace me(@RequestHeader(value="Authorization", defaultValue="") String authorization) throws IOException {
        return store.workspace(token(authorization));
    }
    @PostMapping("/progress")
    public Map<String, String> progress(@RequestHeader(value="Authorization", defaultValue="") String authorization,
                                      @Valid @RequestBody Progress request) throws IOException {
        store.saveProgress(token(authorization), request.progress());
        return Map.of("status", "saved");
    }
    @PostMapping("/logout")
    public Map<String, String> logout(@RequestHeader(value="Authorization", defaultValue="") String authorization) {
        store.logout(token(authorization)); return Map.of("status", "ok");
    }
    private String token(String header) {
        if (!header.startsWith("Bearer ") || header.length() < 8)
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Please sign in.");
        return header.substring(7);
    }
    @ExceptionHandler(IOException.class)
    @ResponseStatus(HttpStatus.SERVICE_UNAVAILABLE)
    public Map<String, String> storageFailure() { return Map.of("message", "Account storage is unavailable. Please try again."); }
}
