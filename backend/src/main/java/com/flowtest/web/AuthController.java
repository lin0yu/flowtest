package com.flowtest.web;

import com.flowtest.common.Dtos.*;
import com.flowtest.service.AuthService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;

    @PostMapping("/login")
    public LoginResponse login(@Valid @RequestBody LoginRequest request) {
        return authService.login(request.username(), request.password());
    }

    @GetMapping("/me")
    public UserDto me(Authentication authentication) {
        return authService.currentUser(authentication.getName());
    }

    @PostMapping("/password")
    public MessageResponse changePassword(@Valid @RequestBody PasswordRequest request,
                                          Authentication authentication) {
        authService.changePassword(authentication.getName(), request.oldPassword(), request.newPassword());
        return new MessageResponse("密码已更新");
    }
}
