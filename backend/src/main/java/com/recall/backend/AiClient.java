package com.recall.backend;

import java.io.IOException;
import java.net.URI;
import java.net.http.*;
import java.time.Duration;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.json.JsonParserFactory;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

/**
 * Optional language-model answers through any OpenAI-compatible chat API (Groq, Gemini, OpenRouter, Ollama, OpenAI).
 * The key is read from the environment or the ignored local settings file. It is never sent to the extension,
 * logged, or stored in this repository.
 */
@Component
public class AiClient {
    private static final Map<String, String> PROVIDERS = Map.of(
        "groq", "https://api.groq.com/openai/v1",
        "gemini", "https://generativelanguage.googleapis.com/v1beta/openai",
        "openrouter", "https://openrouter.ai/api/v1",
        "openai", "https://api.openai.com/v1",
        "ollama", "http://localhost:11434/v1");
    static final String SYSTEM = "You are Recall, a study tutor inside a student's notes app. Be accurate, plain and brief: at most four sentences, no markdown, no preamble.";
    private final String baseUrl, model, key;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(8)).build();

    public AiClient(@Value("${recall.ai.provider:}") String provider, @Value("${recall.ai.base-url:}") String baseUrl,
            @Value("${recall.ai.model:}") String model, @Value("${recall.ai.key:}") String key) {
        String chosen = baseUrl.isBlank() ? PROVIDERS.getOrDefault(provider.trim().toLowerCase(Locale.ROOT), "") : baseUrl.trim();
        this.baseUrl = chosen.replaceAll("/+$", ""); this.model = model.trim(); this.key = key.trim();
    }
    private boolean local() { return baseUrl.startsWith("http://localhost") || baseUrl.startsWith("http://127.0.0.1"); }
    /** A remote provider must use HTTPS and have a key; a model running on this computer needs neither. */
    public boolean enabled() { return !model.isEmpty() && (local() || (baseUrl.startsWith("https://") && !key.isEmpty())); }
    public String model() { return enabled() ? model : ""; }

    static String prompt(String message, List<String> sources, String hidden) {
        var text = new StringBuilder();
        if (sources.isEmpty()) text.append("The student's notes do not cover this. Answer from general knowledge, and say \"I am not sure\" rather than guessing.");
        else {
            text.append("Answer using ONLY these lines from the student's notes. If they do not answer the question, say the notes do not cover it.");
            for (String source : sources) text.append("\n- ").append(source);
        }
        if (hidden != null && !hidden.isBlank()) text.append("\nThe student is being quizzed. Never write the term \"").append(hidden.trim()).append("\" or spell it out; guide them toward it instead.");
        return text.append("\n\nStudent: ").append(message).toString();
    }
    static String json(String value) {
        var out = new StringBuilder("\"");
        for (char c : value.toCharArray()) {
            switch (c) {
                case '"' -> out.append("\\\""); case '\\' -> out.append("\\\\");
                case '\n' -> out.append("\\n"); case '\r' -> out.append("\\r"); case '\t' -> out.append("\\t");
                default -> { if (c < 0x20) out.append(String.format("\\u%04x", (int) c)); else out.append(c); }
            }
        }
        return out.append('"').toString();
    }
    static String requestBody(String model, String message, List<String> sources, String hidden) {
        return "{\"model\":" + json(model) + ",\"messages\":[{\"role\":\"system\",\"content\":" + json(SYSTEM) + "},{\"role\":\"user\",\"content\":" + json(prompt(message, sources, hidden)) + "}]}";
    }
    /** Reads choices[0].message.content and refuses a reply that gives away a hidden quiz answer. */
    static String reply(String body, String hidden) {
        try {
            var choices = (List<?>) JsonParserFactory.getJsonParser().parseMap(body).get("choices");
            var message = (Map<?, ?>) ((Map<?, ?>) choices.get(0)).get("message");
            String text = String.valueOf(message.get("content")).trim();
            if (text.isEmpty() || text.equals("null")) throw new IllegalArgumentException();
            if (hidden != null && !hidden.isBlank() && text.toLowerCase(Locale.ROOT).contains(hidden.trim().toLowerCase(Locale.ROOT)))
                throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "The AI reply would have revealed the quiz answer.");
            return text.length() > 2000 ? text.substring(0, 2000) : text;
        } catch (ClassCastException | NullPointerException | IndexOutOfBoundsException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI provider sent an unreadable reply.");
        }
    }
    public String ask(String message, List<String> sources, String hidden) {
        if (!enabled()) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "AI is not set up on this backend.");
        HttpResponse<String> response;
        try {
            var request = HttpRequest.newBuilder(URI.create(baseUrl + "/chat/completions")).timeout(Duration.ofSeconds(40))
                .header("Content-Type", "application/json");
            if (!key.isEmpty()) request.header("Authorization", "Bearer " + key);
            response = http.send(request.POST(HttpRequest.BodyPublishers.ofString(requestBody(model, message, sources, hidden))).build(), HttpResponse.BodyHandlers.ofString());
        } catch (IOException | IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not reach the AI provider.");
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Could not reach the AI provider.");
        }
        if (response.statusCode() == 429) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "The AI provider's free limit was reached. Try again in a minute.");
        if (response.statusCode() == 401 || response.statusCode() == 403) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "The AI provider rejected the key set on this backend.");
        if (response.statusCode() == 404) throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "The AI provider does not know the model set on this backend.");
        if (response.statusCode() != 200) throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "The AI provider returned an error.");
        return reply(response.body(), hidden);
    }
}
