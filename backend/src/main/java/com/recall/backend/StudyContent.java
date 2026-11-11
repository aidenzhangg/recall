package com.recall.backend;

import java.util.*;
import java.util.regex.Pattern;

/** Conservative, explainable content selection without a model or API. */
final class StudyContent {
    record Item(String source, String term, int score) {}
    private static final String VERBS = "is defined as|refers to|consists of|is|are|means|describes|includes|contains|converts|convert|releases|release|absorbs|absorb|stores|store|carries|carry|produces|produce|uses|use|requires|require|causes|cause|increases|increase|decreases|decrease|prevents|prevent|occurs|occur|controls|control|transports|transport|binds|bind|measures|measure|represents|represent|differs from|results in|allows|allow";
    private static final Pattern SUBJECT = Pattern.compile("^(?:[Tt]he |[Aa]n? )?([A-Za-z][A-Za-z0-9'() /-]{0,85}?)\\s+(" + VERBS + ")\\b", Pattern.CASE_INSENSITIVE);
    private static final Pattern DEFINITION = Pattern.compile("^([A-Za-z][A-Za-z0-9'() /-]{0,85}?):\\s+\\S");
    private static final Pattern GENERIC = Pattern.compile("(?i)^(?:this|that|these|those|it|they|we|you|there|here|what|which|how|why|students|everyone|today|tomorrow|lecture|chapter|slide|course|introduction|overview|learning objectives?|by the end|remember|note|example|for example|in summary|first|next|finally)\\b.*");
    static List<Item> candidates(String notes, String focus) {
        var result = new ArrayList<Item>();
        for (String source : StudyPassages.split(notes)) {
            if (StudyPassages.isLogistics(source) || source.length() > 1200) continue;
            var definition = DEFINITION.matcher(source);
            var subject = SUBJECT.matcher(source);
            String term; int score;
            if (definition.find()) { term = definition.group(1).trim(); score = 6; }
            else if (subject.find()) { term = subject.group(1).trim(); score = Set.of("is", "are", "means", "refers to", "is defined as").contains(subject.group(2).toLowerCase(Locale.ROOT)) ? 6 : 4; }
            else continue;
            if (term.split("\\s+").length > 7 || GENERIC.matcher(term).matches()) continue;
            result.add(new Item(source, term, score));
        }
        String lower = notes.toLowerCase(Locale.ROOT);
        var tokens = focus == null ? List.<String>of() : Arrays.stream(focus.toLowerCase(Locale.ROOT).split("[^a-z0-9]+"))
            .filter(token -> token.length() >= 2).distinct().toList();
        var scored = new ArrayList<Item>();
        for (var item : result) {
            String text = item.source().toLowerCase(Locale.ROOT);
            if (!tokens.isEmpty() && tokens.stream().noneMatch(text::contains)) continue;
            // Recurring named concepts get a small boost, never a longest-word bonus.
            long occurrences = Pattern.compile("(?<![A-Za-z])" + Pattern.quote(item.term().toLowerCase(Locale.ROOT)) + "(?![A-Za-z])").matcher(lower).results().count();
            scored.add(new Item(item.source(), item.term(), item.score() + (int) Math.min(2, Math.max(0, occurrences - 1))));
        }
        return scored;
    }
    static List<Item> select(List<Item> items, int count, Map<String, Long> priorities) {
        var sorted = new ArrayList<>(items);
        sorted.sort(Comparator.comparingLong((Item item) -> priorities.getOrDefault(item.source(), 0L)).reversed()
            .thenComparing(Comparator.comparingInt(Item::score).reversed()));
        if (sorted.stream().anyMatch(item -> priorities.getOrDefault(item.source(), 0L) > 0)) return sorted.subList(0, Math.min(count, sorted.size()));
        var selected = new ArrayList<Item>();
        for (int start = 0; start < sorted.size() && selected.size() < count;) {
            int end = start + 1;
            while (end < sorted.size() && sorted.get(end).score() == sorted.get(start).score()) end++;
            int take = Math.min(count - selected.size(), end - start);
            for (int i = 0; i < take; i++) selected.add(sorted.get(start + (int) Math.floor(i * (end - start - 1.0) / Math.max(1, take - 1))));
            start = end;
        }
        return selected;
    }
}
