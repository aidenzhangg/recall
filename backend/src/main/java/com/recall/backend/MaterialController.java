package com.recall.backend;

import java.io.IOException;
import java.util.Map;
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
    public Map<String,String> extract(@RequestPart("file") MultipartFile file) {
        try {
            if (file.isEmpty() || file.getSize() > 20 * 1024 * 1024) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Choose a PDF up to 20 MB.");
            byte[] bytes = file.getBytes();
            if (bytes.length < 5 || !Arrays.equals(Arrays.copyOf(bytes, 5), new byte[]{37,80,68,70,45})) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Choose a PDF file.");
            try (var document = Loader.loadPDF(bytes)) {
                if (document.getNumberOfPages() > 50) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "Use a PDF with at most 50 pages.");
                if (!document.getCurrentAccessPermission().canExtractContent()) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "This PDF does not allow text extraction.");
                var stripper = new PDFTextStripper();
                String text = stripper.getText(document).trim();
                if (text.isBlank()) throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY, "No selectable text found. Scanned PDFs need OCR, which is not available yet.");
                if (text.length() > 200000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Use a shorter PDF.");
                return Map.of("text", text);
            }
        } catch (IOException e) { throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Could not read this PDF. Check that it is valid and not password-protected."); }
    }
}
