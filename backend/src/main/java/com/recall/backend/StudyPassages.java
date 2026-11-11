package com.recall.backend;

import java.util.*;

/** Deterministic cleanup of line-wrapped PDF text, not semantic inference. */
final class StudyPassages {
    private StudyPassages() {}
    static List<String> split(String notes) {
        String normalized = notes.replace("\r\n", "\n").replace('\r', '\n').replace("\u00ad", "")
            .replaceAll("(?<=\\p{L})-\n(?=\\p{Ll})", "");
        var paragraphs = new ArrayList<String>();
        var current = new StringBuilder();
        for (String raw : normalized.split("\n", -1)) {
            String line = raw.trim().replaceAll("^[\u2022\u25cf\u25aa]\\s*", "");
            boolean heading = isHeading(line) || line.matches("^#{1,6}\\s+.*") || line.matches("^(?:---+|===+|___+)$");
            if (line.isBlank() || isLogistics(line) || heading || line.matches("(?:Page\\s+)?[0-9]+(?:\\s+(?:of|/)\\s+[0-9]+)?")) {
                if (!current.isEmpty()) { paragraphs.add(current.toString()); current.setLength(0); }
                continue;
            }
            if ((raw.trim().matches("^[\u2022\u25cf\u25aa].*") || StudyContent.startsFact(line)) && !current.isEmpty()) {
                paragraphs.add(current.toString()); current.setLength(0);
            }
            if (!current.isEmpty()) current.append(' ');
            current.append(line);
        }
        if (!current.isEmpty()) paragraphs.add(current.toString());
        var result = new LinkedHashSet<String>();
        for (String paragraph : paragraphs) for (String sentence : paragraph.split("(?<=[.!?])\\s+")) {
            String clean = sentence.trim().replaceAll("\\s+", " ");
            if (clean.split(" ").length >= 5 && clean.length() <= 20000) result.add(clean);
        }
        return new ArrayList<>(result);
    }
    static boolean isLogistics(String line) {
        return line.matches("(?i)^(?:title|topic|section|unit|lecture(?:\\s+[0-9]+)?|chapter(?:\\s+[0-9]+)?)\\s*:.*")
            || line.matches("(?i)^(?:the |an? )?(?:assignment|assessment|exam|midterm|final exam|grading|marks|syllabus|schedule)\\b.*(?:due|worth|percent|%|scheduled|held|room|submit|grade|deadline).*" )
            || line.matches("(?i).*(?:office hours|all rights reserved|copyright|contact (?:me|us|the instructor)|assignment (?:deadline|due)|submission deadline|course (?:code|outline|syllabus)|lecture slides (?:are|will)|slides (?:are|will be) (?:available|posted)|download (?:the|these) slides|next lecture (?:is|will)|attendance (?:is|will)|email (?:me|the instructor)|please (?:submit|upload|bring)|due (?:date|on)|instructor:|professor:|lecturer:).*" )
            || line.matches("(?i)^(?:https?://|www\\.).*") || line.matches(".*[\\w.+-]+@[\\w.-]+\\.[A-Za-z]{2,}.*");
    }
    private static boolean isHeading(String line) {
        if (line.isBlank() || line.matches(".*[.!?:;].*")) return false;
        var words = line.split("\\s+");
        if (words.length < 3 || words.length > 16) return false;
        long capitalized = Arrays.stream(words).filter(word -> word.matches("[A-Z][A-Za-z'-]*")).count();
        return capitalized >= Math.max(1, Math.ceil(words.length * .8));
    }
}
