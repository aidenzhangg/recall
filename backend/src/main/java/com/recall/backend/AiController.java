package com.recall.backend;

import java.util.*;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/ai")
public class AiController {
    static final int LIMIT = 20;
    static final long WINDOW = 5 * 60 * 1000L;
    private final AiClient ai;
    private final AccountStore accounts;
    private final Map<String, Deque<Long>> recent = new HashMap<>();
    public AiController(AiClient ai, AccountStore accounts) { this.ai = ai; this.accounts = accounts; }

    public record Ask(@NotBlank @Size(max=1000) String message, @NotNull @Size(max=6) List<@NotBlank @Size(max=1200) String> sources, @Size(max=200) String hidden) {}

    /** Tells the extension whether AI is available. Never includes the key. */
    @GetMapping
    public Map<String, Object> status() { return Map.of("enabled", ai.enabled(), "model", ai.model()); }

    /** Signed-in users only, with a per-user limit, so a hosted backend cannot be used as an open proxy for its key. */
    @PostMapping("/ask")
    public Map<String, String> ask(@RequestHeader(value="Authorization", defaultValue="") String authorization, @Valid @RequestBody Ask request) {
        String user = accounts.sessionOwner(AccountController.token(authorization));
        allow(user, System.currentTimeMillis());
        return Map.of("text", ai.ask(request.message(), request.sources(), request.hidden()));
    }
    synchronized void allow(String user, long now) {
        recent.values().removeIf(times -> times.isEmpty() || times.peekLast() < now - WINDOW);
        var times = recent.computeIfAbsent(user, ignored -> new ArrayDeque<>());
        while (!times.isEmpty() && times.peekFirst() < now - WINDOW) times.removeFirst();
        if (times.size() >= LIMIT) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "You have asked a lot in a short time. Try again in a few minutes.");
        times.addLast(now);
    }
}
