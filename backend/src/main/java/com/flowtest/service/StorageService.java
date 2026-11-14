package com.flowtest.service;

import com.flowtest.common.BusinessException;
import jakarta.annotation.PostConstruct;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.OutputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.nio.file.StandardCopyOption;
import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

@Slf4j
@Service
public class StorageService {

    private final Path root;

    public StorageService(@Value("${flowtest.storage.root:./data}") String rootPath) {
        this.root = Paths.get(rootPath).toAbsolutePath().normalize();
    }

    @PostConstruct
    public void init() {
        try {
            Files.createDirectories(root.resolve("uploads"));
            Files.createDirectories(root.resolve("artifacts"));
            Files.createDirectories(root.resolve("tmp"));
        } catch (IOException e) {
            throw new IllegalStateException("无法初始化存储目录：" + root, e);
        }
    }

    public record StoredFile(String originalName, String storedName, String relativePath,
                             String contentType, long size) {
    }

    public StoredFile storeAttachment(Long caseId, MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BusinessException("请选择要上传的文件");
        }
        String original = sanitize(file.getOriginalFilename());
        String stored = UUID.randomUUID().toString().replace("-", "") + extension(original);
        Path dir = root.resolve("uploads").resolve(String.valueOf(caseId));
        Path target = dir.resolve(stored).normalize();
        ensureInsideRoot(target);
        try {
            Files.createDirectories(dir);
            try (var in = file.getInputStream()) {
                Files.copy(in, target, StandardCopyOption.REPLACE_EXISTING);
            }
            String relative = root.relativize(target).toString().replace('\\', '/');
            return new StoredFile(original, stored, relative,
                    file.getContentType() == null ? "application/octet-stream" : file.getContentType(),
                    file.getSize());
        } catch (IOException e) {
            throw new BusinessException("文件保存失败：" + e.getMessage());
        }
    }

    public Path artifactPath(Long runId, String fileName) {
        Path dir = root.resolve("artifacts").resolve(String.valueOf(runId));
        Path target = dir.resolve(sanitize(fileName)).normalize();
        ensureInsideRoot(target);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new BusinessException("产物目录创建失败：" + e.getMessage());
        }
        return target;
    }

    public String storeArtifactBytes(Long runId, String fileName, byte[] bytes) {
        Path target = artifactPath(runId, fileName);
        try {
            Files.write(target, bytes);
            return relative(target);
        } catch (IOException e) {
            throw new BusinessException("产物保存失败：" + e.getMessage());
        }
    }

    public String storeArtifactText(Long runId, String fileName, String text) {
        return storeArtifactBytes(runId, fileName, text.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    public String storeRunReport(Long runId, String json) {
        return storeArtifactBytes(runId, "report.json", json.getBytes(java.nio.charset.StandardCharsets.UTF_8));
    }

    public Resource loadAsResource(String relativePath) {
        Path path = resolve(relativePath);
        if (!Files.exists(path) || !Files.isRegularFile(path)) {
            throw BusinessException.notFound("文件不存在");
        }
        return new FileSystemResource(path);
    }

    public long size(String relativePath) {
        try {
            return Files.size(resolve(relativePath));
        } catch (IOException e) {
            return 0;
        }
    }

    public void delete(String relativePath) {
        try {
            Files.deleteIfExists(resolve(relativePath));
        } catch (IOException e) {
            log.warn("删除文件失败 {}: {}", relativePath, e.getMessage());
        }
    }

    public Path zipArtifacts(Long runId, List<com.flowtest.domain.Artifact> artifacts) {
        Path zip = root.resolve("tmp").resolve("run-" + runId + "-" + System.currentTimeMillis() + ".zip");
        try {
            Files.createDirectories(zip.getParent());
            try (OutputStream out = Files.newOutputStream(zip);
                 ZipOutputStream zos = new ZipOutputStream(out)) {
                for (var artifact : artifacts) {
                    Path file = resolve(artifact.getPath());
                    if (!Files.exists(file)) {
                        continue;
                    }
                    String entryName = artifact.getFileName();
                    zos.putNextEntry(new ZipEntry(entryName));
                    Files.copy(file, zos);
                    zos.closeEntry();
                }
                zos.putNextEntry(new ZipEntry("README.txt"));
                zos.write(("FlowTest 执行报告\nRun ID: " + runId
                        + "\n导出时间: " + Instant.now()
                        + "\n产物数量: " + artifacts.size()
                        + "\n").getBytes(java.nio.charset.StandardCharsets.UTF_8));
                zos.closeEntry();
            }
            return zip;
        } catch (IOException e) {
            throw new BusinessException("报告打包失败：" + e.getMessage());
        }
    }

    public String relative(Path path) {
        return root.relativize(path.toAbsolutePath().normalize()).toString().replace('\\', '/');
    }

    public Path resolve(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            throw BusinessException.notFound("文件路径为空");
        }
        Path path = root.resolve(relativePath).normalize();
        ensureInsideRoot(path);
        return path;
    }

    public String getRootAbsolute() {
        return root.toString();
    }

    private void ensureInsideRoot(Path path) {
        if (!path.startsWith(root)) {
            throw new BusinessException("非法文件路径");
        }
    }

    private String sanitize(String name) {
        if (name == null || name.isBlank()) {
            return "file";
        }
        String clean = Paths.get(name).getFileName().toString();
        clean = clean.replaceAll("[\\\\/:*?\"<>|\\r\\n]", "_").trim();
        if (clean.isBlank()) {
            return "file";
        }
        return clean.length() > 180 ? clean.substring(clean.length() - 180) : clean;
    }

    private String extension(String name) {
        int dot = name.lastIndexOf('.');
        if (dot < 0 || dot == name.length() - 1) {
            return "";
        }
        String ext = name.substring(dot);
        return ext.length() > 12 ? "" : ext;
    }
}
