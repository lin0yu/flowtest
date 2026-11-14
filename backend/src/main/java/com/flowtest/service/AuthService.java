package com.flowtest.service;

import com.flowtest.common.BusinessException;
import com.flowtest.common.Dtos.LoginResponse;
import com.flowtest.common.Dtos.UserDto;
import com.flowtest.config.JwtService;
import com.flowtest.domain.User;
import com.flowtest.repo.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final JwtService jwtService;

    @Transactional(readOnly = true)
    public LoginResponse login(String username, String password) {
        User user = userRepository.findByUsername(username == null ? "" : username.trim())
                .orElseThrow(() -> new BusinessException(HttpStatus.UNAUTHORIZED, "用户名或密码错误"));
        if (!user.isEnabled() || !passwordEncoder.matches(password, user.getPasswordHash())) {
            throw new BusinessException(HttpStatus.UNAUTHORIZED, "用户名或密码错误");
        }
        String token = jwtService.generate(user.getUsername(), user.getRole(), user.getDisplayName());
        return new LoginResponse(token, toDto(user));
    }

    @Transactional(readOnly = true)
    public UserDto currentUser(String username) {
        return toDto(userRepository.findByUsername(username)
                .orElseThrow(() -> BusinessException.notFound("用户不存在")));
    }

    @Transactional
    public void changePassword(String username, String oldPassword, String newPassword) {
        User user = userRepository.findByUsername(username)
                .orElseThrow(() -> BusinessException.notFound("用户不存在"));
        if (!passwordEncoder.matches(oldPassword, user.getPasswordHash())) {
            throw new BusinessException("原密码不正确");
        }
        user.setPasswordHash(passwordEncoder.encode(newPassword));
        userRepository.save(user);
    }

    private UserDto toDto(User user) {
        return new UserDto(user.getId(), user.getUsername(), user.getDisplayName(), user.getRole());
    }
}
