package com.recall.backend;

import java.io.IOException;
import java.util.Map;
import java.util.ArrayList;
import org.apache.pdfbox.pdmodel.graphics.image.PDImageXObject;
import java.util.Arrays;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.text.PDFTextStripper;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/material")
public class MaterialController {
    @PostMapping(value="/extract", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public Map<String,Object> extract(@RequestPart("file") MultipartFile file) {
        try {
            if (file.isEmpty() || file.getSize() > 20 * 1024 * 1024) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF up to 20 MB.");
            byte[] bytes = file.getBytes();
            if (bytes.length < 5 || !Arrays.equals(Arrays.copyOf(bytes, 5), new byte[]{37,80,68,70,45})) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Choose a PDF file.");
            try (var document = Loader.loadPDF(bytes)) {
                if (document.getNumberOfPages() > 50) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Use a PDF with at most 50 pages.");
                if (!document.getCurrentAccessPermission().canExtractContent()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This PDF does not allow text extraction.");
                var stripper = new PDFTextStripper();
                stripper.setSortByPosition(true);
                stripper.setShouldSeparateByBeads(false);
                var pages = new ArrayList<Map<String, Object>>();
                var warnings = new ArrayList<String>();
                var combined = new StringBuilder();
                for (int number = 1; number <= document.getNumberOfPages(); number++) {
                    stripper.setStartPage(number); stripper.setEndPage(number);
                    String text = stripper.getText(document).replace("\u00ad", "")
                        .replaceAll("(?<=\\p{L})-\\R(?=\\p{Ll})", "").trim();
                    int words = text.isBlank() ? 0 : text.split("\\s+").length;
                    boolean images = false;
                    var resources = document.getPage(number - 1).getResources();
                    if (resources != null) for (var name : resources.getXObjectNames())
                        if (resources.getXObject(name) instanceof PDImageXObject) { images = true; break; }
                    pages.add(Map.of("number", number, "words", words));
                    if (text.isBlank()) warnings.add("Page " + number + " has no readable text. It may be blank or scanned; image text needs OCR.");
                    else if (images && words < 40) warnings.add("Page " + number + " contains images but little selectable text. Only its text layer was imported; check for missing body text.");
                    if (!text.isBlank()) { if (!combined.isEmpty()) combined.append("\n\n"); combined.append(text); }
                    if (combined.length() > 200000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Use a shorter PDF.");
                }
                if (combined.isEmpty()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "No selectable text found. This PDF may be scanned. Use a PDF with selectable text or paste a transcription; Recall does not currently perform OCR.");
                return Map.of("text", combined.toString(), "pageCount", document.getNumberOfPages(), "pages", pages, "warnings", warnings);

            }
        } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read this PDF. Check that it is valid and not password-protected."); }
    }
}
