package com.game.poker.repository;

import com.game.poker.entity.UserAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDateTime;

import java.util.List;
import java.util.Optional;

public interface UserAccountRepository extends JpaRepository<UserAccount, Long> {
    boolean existsByUsername(String username);

    Optional<UserAccount> findByUsername(String username);

    @Modifying(clearAutomatically = true, flushAutomatically = true)
    @Query("update UserAccount u set u.avatarId = :avatarId, u.updatedAt = :now where u.username = :username")
    int updateAvatar(@Param("username") String username, @Param("avatarId") String avatarId,
                     @Param("now") LocalDateTime now);

    List<UserAccount> findTop10ByUsernameContainingIgnoreCaseOrderByUsernameAsc(String username);
}
