package com.recall.backend;

import java.io.*;
import java.security.*;
import java.time.*;
import java.util.*;
import javax.imageio.ImageIO;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/connect")
public class ConnectController {
    private final AccountStore accounts;
    private final Clock clock;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Pair> pairs = new HashMap<>();
    private final Map<String, Photo> photos = new LinkedHashMap<>();
    private record Pair(String owner, String sessionHash, Instant expires) {}
    private record Photo(String id, String owner, byte[] bytes, String type, String notes, Instant expires) {}
    public record Pairing(String code, Instant expiresAt) {}
    public record Item(String id, String mediaType, String notes, Instant expiresAt) {}
    @org.springframework.beans.factory.annotation.Autowired
    public ConnectController(AccountStore accounts) { this(accounts, Clock.systemUTC()); }
    ConnectController(AccountStore accounts, Clock clock) { this.accounts = accounts; this.clock = clock; }
    @ModelAttribute void noCache(jakarta.servlet.http.HttpServletResponse response) { response.setHeader("Cache-Control", "no-store"); }
    private String owner(String authorization) throws IOException { return accounts.sessionOwner(AccountController.token(authorization)); }
    private void clean() {
        var now = clock.instant();
        pairs.values().removeIf(p -> !p.expires().isAfter(now) || !accounts.sessionActive(p.sessionHash()));
        photos.values().removeIf(p -> !p.expires().isAfter(now));
    }
    private String hash(String code) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(code.getBytes(java.nio.charset.StandardCharsets.UTF_8))); }
        catch (NoSuchAlgorithmException e) { throw new IllegalStateException(e); }
    }
    @PostMapping("/pair")
    public synchronized Pairing pair(@RequestHeader(value="Authorization", defaultValue="") String auth) throws IOException {
        clean(); String owner = owner(auth);
        pairs.values().removeIf(p -> p.owner().equals(owner));
        if (pairs.size() >= 100) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Try again later.");
        byte[] bytes = new byte[18]; random.nextBytes(bytes);
        String code = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        var expiry = clock.instant().plusSeconds(300);
        pairs.put(hash(code), new Pair(owner, hash(AccountController.token(auth)), expiry));
        return new Pairing(code, expiry);
    }
    @DeleteMapping("/pair")
    public synchronized void cancel(@RequestHeader(value="Authorization", defaultValue="") String auth) throws IOException {
        String owner = owner(auth);
        pairs.values().removeIf(p -> p.owner().equals(owner));
    }
    @PostMapping(value="/upload", consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    public synchronized Map<String, String> upload(@RequestHeader(value="X-Recall-Pair", defaultValue="") String code,
            @RequestPart("file") MultipartFile file, @RequestParam(defaultValue="") String notes) throws IOException {
        clean(); Pair pair = pairs.get(hash(code));
        if (pair == null) throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "Pairing expired or already used.");
        if (file.isEmpty() || file.getSize() > 20 * 1024 * 1024 || notes.length() > 20000)
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Use a JPEG or PNG up to 20 MB and notes under 20,000 characters.");
        byte[] bytes = file.getBytes();
        boolean png = bytes.length > 8 && bytes[0] == (byte)137 && bytes[1] == 80 && bytes[2] == 78 && bytes[3] == 71;
        boolean jpeg = bytes.length > 3 && bytes[0] == (byte)255 && bytes[1] == (byte)216 && bytes[2] == (byte)255;
        if (!png && !jpeg) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Use a JPEG or PNG image.");
        try (var input = ImageIO.createImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Invalid image.");
            var reader = readers.next();
            try { reader.setInput(input); if ((long)reader.getWidth(0) * reader.getHeight(0) > 25000000) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Image resolution is too large."); }
            finally { reader.dispose(); }
        }
        // Re-encode pixel data: do not retain EXIF/location metadata or trailing content.
        var decoded = ImageIO.read(new ByteArrayInputStream(bytes));
        if (decoded == null) throw new ResponseStatusException(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "Invalid image.");
        var sanitized = new ByteArrayOutputStream();
        ImageIO.write(decoded, png ? "png" : "jpeg", sanitized);
        bytes = sanitized.toByteArray();
        if (bytes.length > 20 * 1024 * 1024) throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "Decoded image is too large.");
        long ownerCount = photos.values().stream().filter(p -> p.owner().equals(pair.owner())).count();
        long totalBytes = photos.values().stream().mapToLong(p -> p.bytes().length).sum();
        if (ownerCount >= 5 || totalBytes + bytes.length > 50L * 1024 * 1024) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "Inbox full. Remove an upload first.");
        String id = UUID.randomUUID().toString();
        photos.put(id, new Photo(id, pair.owner(), bytes, png ? "image/png" : "image/jpeg", notes, clock.instant().plusSeconds(3600)));
        pairs.remove(hash(code));
        return Map.of("status", "received");
    }
    @GetMapping("/inbox")
    public synchronized List<Item> inbox(@RequestHeader(value="Authorization", defaultValue="") String auth) throws IOException {
        clean(); String owner = owner(auth);
        return photos.values().stream().filter(p -> p.owner().equals(owner)).map(p -> new Item(p.id(), p.type(), p.notes(), p.expires())).toList();
    }
    @GetMapping("/inbox/{id}")
    public synchronized ResponseEntity<byte[]> image(@RequestHeader(value="Authorization", defaultValue="") String auth, @PathVariable String id) throws IOException {
        clean(); String owner = owner(auth); Photo p = photos.get(id);
        if (p == null || !p.owner().equals(owner)) throw new ResponseStatusException(HttpStatus.NOT_FOUND);
        return ResponseEntity.ok().contentType(MediaType.parseMediaType(p.type())).header("X-Content-Type-Options", "nosniff").cacheControl(CacheControl.noStore()).body(p.bytes());
    }
    @DeleteMapping("/inbox/{id}")
    public synchronized void remove(@RequestHeader(value="Authorization", defaultValue="") String auth, @PathVariable String id) throws IOException {
        String owner = owner(auth); Photo p = photos.get(id);
        if (p != null && p.owner().equals(owner)) photos.remove(id);
    }
    @ExceptionHandler(IOException.class) @ResponseStatus(HttpStatus.BAD_REQUEST)
    public Map<String,String> invalidFile() { return Map.of("message", "Could not read the upload."); }
}
