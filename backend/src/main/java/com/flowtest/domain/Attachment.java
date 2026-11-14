package com.flowtest.domain;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "attachments")
@Getter
@Setter
@NoArgsConstructor
public class Attachment extends BaseEntity {

    @Column(nullable = false)
    private Long caseId;

    @Column(nullable = false, length = 260)
    private String fileName;

    @Column(nullable = false, length = 260)
    private String storedName;

    @Column(length = 160)
    private String contentType;

    @Column(nullable = false)
    private long size;

    @Column(nullable = false, length = 600)
    private String path;
}
