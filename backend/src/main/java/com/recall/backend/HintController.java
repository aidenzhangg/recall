package com.recall.backend;

import java.util.Map;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class HintController {
    static final Map<String, String> HINTS = Map.of(
        "RECALL", "Read the sentence around the blank. What role does the missing term play? Describe that role in your own words first.",
        "BREAK_DOWN", "Break the sentence into what happens, where it happens, and why. Which part does the blank describe?",
        "COMPARE", "Think of two possible terms from memory. What difference between them would help you choose?",
        "REVIEW", "Pause and review the relevant section of your notes. Then close it and explain the idea from memory before trying again.");

    public record HintRequest(@NotBlank @Size(max = 4000) String question,
                              @NotBlank @Size(max = 1000) String message) {}

    @PostMapping("/hints")
    public Map<String, String> hint(@Valid @RequestBody HintRequest request) {
        return fallback();
    }

    private Map<String, String> fallback() {
        return Map.of("hint", HINTS.get("RECALL"), "mode", "local");
    }
}
